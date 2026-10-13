import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const POLICY_FILES = ['aleph.config.json', 'src/decider.mjs'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('안전 정책 사본 검증 실패: 비교를 중단했습니다.'); };

async function readRegular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) fail();
  return readFile(path);
}

// 출력은 내용 대신 변경된 줄 구간만 제공합니다. 키·토큰·정책 원문은 출력하지 않습니다.
function changedRange(before, after) {
  const oldLines = before.toString('utf8').split('\n');
  const newLines = after.toString('utf8').split('\n');
  let first = 0;
  while (first < oldLines.length && first < newLines.length && oldLines[first] === newLines[first]) first++;
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > first && endNew > first && oldLines[endOld - 1] === newLines[endNew - 1]) { endOld--; endNew--; }
  return { safeCopy: { startLine: first + 1, lineCount: endOld - first },
    currentTest: { startLine: first + 1, lineCount: endNew - first } };
}

export async function readVerifiedPolicyCopy({ backupDir, trustedManifestSha256,
  now = Date.now() }) {
  if (!backupDir || !/^[a-f0-9]{64}$/.test(trustedManifestSha256 || '')) fail();
  const backup = resolve(backupDir);
  const manifestBytes = await readRegular(join(backup, 'manifest.json'));
  if (sha256(manifestBytes) !== trustedManifestSha256) fail();
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'vault.safe-policy.v1'
      || !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(manifest.version || '')
      || typeof manifest.verifiedAt !== 'string' || typeof manifest.incidentAt !== 'string'
      || !Number.isFinite(Date.parse(manifest.verifiedAt)) || !Number.isFinite(Date.parse(manifest.incidentAt))
      || Date.parse(manifest.verifiedAt) >= Date.parse(manifest.incidentAt)
      || Date.parse(manifest.incidentAt) > now
      || !Array.isArray(manifest.files) || manifest.files.length !== POLICY_FILES.length
      || new Set(manifest.files.map(item => item?.path)).size !== POLICY_FILES.length) fail();
  const files = new Map();
  for (const item of manifest.files) {
    if (!POLICY_FILES.includes(item?.path) || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) fail();
    // 디렉터리 심볼릭 링크도 허용하지 않습니다.
    if ((await lstat(backup)).isSymbolicLink()) fail();
    if (item.path.startsWith('src/') && (await lstat(join(backup, 'src'))).isSymbolicLink()) fail();
    const safe = await readRegular(join(backup, item.path));
    if (sha256(safe) !== item.sha256) fail();
    files.set(item.path, safe);
  }
  return { manifest, files };
}

export async function comparePolicies({ backupDir, trustedManifestSha256, currentDir, now = Date.now() }) {
  if (!currentDir || resolve(backupDir || '.') === resolve(currentDir)) fail();
  const { manifest, files } = await readVerifiedPolicyCopy({ backupDir, trustedManifestSha256, now });
  const current = resolve(currentDir);
  const differences = [];
  for (const item of manifest.files) {
    const safe = files.get(item.path);
    let test;
    try { test = await readRegular(join(current, item.path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!test) differences.push({ path: item.path, status: 'missing_in_current_test' });
    else if (sha256(test) !== item.sha256) differences.push({ path: item.path,
      status: 'changed', ...changedRange(safe, test) });
  }
  return { schema: 'vault.policy-diff.v1', restoreVersion: manifest.version,
    verifiedAt: manifest.verifiedAt, scope: POLICY_FILES, differences,
    applied: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 2) fail();
    const result = await comparePolicies({ backupDir: args[0], trustedManifestSha256: args[1],
      currentDir: fileURLToPath(new URL('..', import.meta.url)) });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('안전한 정책 사본이 없거나 검증에 실패했습니다. 비교를 중단했으며 변경은 적용하지 않았습니다.');
    process.exitCode = 1;
  }
}
