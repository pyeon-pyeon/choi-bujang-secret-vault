import { readFile, writeFile, lstat, unlink, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVerifiedPolicyCopy } from './policy-diff.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const isNotesRoute = route => typeof route === 'string'
  ? /^[A-Z]+ \/(?:api\/)?(?:my\/)?notes(?:\/|$)/.test(route)
  : route?.service === 'notes';

export async function planRestore({ backupDir, trustedManifestSha256, testDir }) {
  const root = resolve(testDir);
  if (await realpath(root) === await realpath(fileURLToPath(new URL('..', import.meta.url)))
      || (await lstat(root)).isSymbolicLink() || (await lstat(join(root, 'src'))).isSymbolicLink()) {
    throw new Error('현재 프로젝트나 연결된 운영 폴더는 복원하지 않습니다.');
  }
  const marker = JSON.parse(await readFile(join(root, 'policy-test.json'), 'utf8'));
  if (marker.schema !== 'vault.isolated-policy-test.v1' || marker.operational !== false) {
    throw new Error('격리된 시험 정책 폴더만 복원할 수 있습니다.');
  }
  // 복원 계획·실행 호출마다 사본을 새로 읽고 검증한 바로 그 바이트만 사용합니다.
  if (await realpath(root) === await realpath(backupDir)) throw new Error('사본 폴더는 복원 대상이 아닙니다.');
  const verified = await readVerifiedPolicyCopy({ backupDir, trustedManifestSha256 });
  const safeCode = verified.files.get('src/decider.mjs').toString('utf8');
  const currentCode = await readFile(join(root, 'src/decider.mjs'), 'utf8');
  const safeConfig = JSON.parse(verified.files.get('aleph.config.json').toString('utf8'));
  const configBytes = await readFile(join(root, 'aleph.config.json'), 'utf8');
  const config = JSON.parse(configBytes);
  if (!Array.isArray(config.allowedRoutes) || !Array.isArray(safeConfig.allowedRoutes)) {
    throw new Error('정책 경로 형식을 확인할 수 없습니다.');
  }
  const preservedName = `policy-preserved-${hash(currentCode).slice(0, 16)}.mjs`;
  const safeName = `policy-safe-${hash(safeCode).slice(0, 16)}.mjs`;
  const wrapper = `// 메모만 검증된 안전 정책에 위임하며 다른 서비스는 기존 규칙을 유지합니다.\n`
    + `import * as safe from './${safeName}';\nimport * as previous from './${preservedName}';\n`
    + `export const RULE_IDS = Object.freeze([...new Set([...safe.RULE_IDS, ...previous.RULE_IDS])]);\n`
    + `export async function decide(request) {\n  return request.service === 'notes' ? safe.decide(request) : previous.decide(request);\n}\n`;
  const nextConfig = { ...config, allowedRoutes: [
    ...config.allowedRoutes.filter(route => !isNotesRoute(route)),
    ...safeConfig.allowedRoutes.filter(isNotesRoute),
  ] };
  const writes = [
    { path: `src/${preservedName}`, content: currentCode, create: true },
    { path: `src/${safeName}`, content: safeCode, create: true },
    { path: 'src/decider.mjs', content: wrapper, create: false },
    { path: 'aleph.config.json', content: JSON.stringify(nextConfig, null, 2) + '\n', create: false },
  ];
  const review = { restoreVersion: verified.manifest.version, service: 'notes',
    changes: writes.map(item => ({ path: item.path, operation: item.create ? 'create' : 'replace', sha256: hash(item.content) })),
    preserved: ['다른 서비스 판정 규칙', '다른 서비스 허용 경로', '감사·XDR 로그', 'DB 자료'],
    currentCodeSha256: hash(currentCode), currentConfigSha256: hash(configBytes) };
  return { review: { ...review, confirmationSha256: hash(JSON.stringify(review)) }, writes };
}

export async function restoreTestPolicy(options) {
  const { review, writes } = await planRestore(options);
  if (options.confirmationSha256 !== review.confirmationSha256) {
    throw new Error('변경 목록의 확인 지문이 없거나 달라 복원을 중단했습니다.');
  }
  const root = resolve(options.testDir);
  const configBefore = await readFile(join(root, 'aleph.config.json'), 'utf8');
  const codeBefore = await readFile(join(root, 'src/decider.mjs'), 'utf8');
  if (hash(configBefore) !== review.currentConfigSha256 || hash(codeBefore) !== review.currentCodeSha256) {
    throw new Error('확인 후 시험 정책이 변경되어 복원을 중단했습니다.');
  }
  for (const item of writes.filter(item => !item.create)) {
    const stat = await lstat(join(root, item.path));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('시험 정책 파일 형식이 아닙니다.');
  }
  const created = [];
  try {
    for (const item of writes.filter(item => item.create)) {
      await writeFile(join(root, item.path), item.content, { flag: 'wx' });
      created.push(item.path);
    }
    await writeFile(join(root, 'src/decider.mjs'), writes[2].content);
    await writeFile(join(root, 'aleph.config.json'), writes[3].content);
  } catch (error) {
    await writeFile(join(root, 'src/decider.mjs'), codeBefore);
    await writeFile(join(root, 'aleph.config.json'), configBefore);
    for (const path of created) await unlink(join(root, path));
    throw error;
  }
  return { ...review, applied: true, operationalPolicyChanged: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [backupDir, trustedManifestSha256, testDir, confirmationSha256] = process.argv.slice(2);
  try {
    if (!backupDir || !trustedManifestSha256 || !testDir) throw new Error('검증 사본과 격리 시험 폴더가 필요합니다.');
    const options = { backupDir, trustedManifestSha256, testDir, confirmationSha256 };
    const out = confirmationSha256 ? await restoreTestPolicy(options) : (await planRestore(options)).review;
    console.log(JSON.stringify(out, null, 2));
  } catch {
    console.error('안전 사본·시험 폴더·확인 지문을 검증하지 못해 복원을 중단했습니다.');
    process.exitCode = 1;
  }
}
