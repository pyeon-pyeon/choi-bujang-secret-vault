import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { planRestore, restoreTestPolicy } from '../scripts/policy-restore.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('계획 후 사본 변조·누락·지문 불일치면 파일 변경 없이 중단', async () => {
  const root = await mkdtemp(join(tmpdir(), 'verified-policy-test-'));
  try {
    const backup = join(root, 'backup');
    const trial = join(root, 'trial');
    for (const dir of [backup, trial]) await mkdir(join(dir, 'src'), { recursive: true });
    const safe = 'export const RULE_IDS=["safe"]; export const decide=()=>({decision:"deny"});\n';
    const current = 'export const RULE_IDS=["trial"]; export const decide=()=>({decision:"allow"});\n';
    const config = JSON.stringify({ allowedRoutes: ['GET /api/notes/:id'] });
    await writeFile(join(backup, 'src/decider.mjs'), safe);
    await writeFile(join(backup, 'aleph.config.json'), config);
    await writeFile(join(trial, 'src/decider.mjs'), current);
    await writeFile(join(trial, 'aleph.config.json'), config);
    await writeFile(join(trial, 'policy-test.json'), JSON.stringify({ schema: 'vault.isolated-policy-test.v1', operational: false }));
    await writeFile(join(trial, 'audit.log'), '가상 감사 기록\n');
    const manifest = JSON.stringify({ schema: 'vault.safe-policy.v1', version: 'a'.repeat(40),
      verifiedAt: '2026-10-01T00:00:00Z', incidentAt: '2026-10-02T00:00:00Z',
      files: [{ path: 'src/decider.mjs', sha256: hash(safe) }, { path: 'aleph.config.json', sha256: hash(config) }] });
    await writeFile(join(backup, 'manifest.json'), manifest);
    const options = { backupDir: backup, testDir: trial, trustedManifestSha256: hash(manifest) };
    const { review } = await planRestore(options);
    const confirmed = { ...options, confirmationSha256: review.confirmationSha256 };
    await writeFile(join(backup, 'src/decider.mjs'), current);
    await assert.rejects(restoreTestPolicy(confirmed));
    await writeFile(join(backup, 'src/decider.mjs'), safe);
    await assert.rejects(restoreTestPolicy({ ...confirmed, trustedManifestSha256: '0'.repeat(64) }));
    await assert.rejects(restoreTestPolicy({ ...confirmed, confirmationSha256: 'wrong' }));
    await rm(join(backup, 'src/decider.mjs'));
    await assert.rejects(restoreTestPolicy(confirmed));
    assert.equal(await readFile(join(trial, 'src/decider.mjs'), 'utf8'), current);
    assert.equal(await readFile(join(trial, 'aleph.config.json'), 'utf8'), config);
    assert.equal(await readFile(join(trial, 'audit.log'), 'utf8'), '가상 감사 기록\n');
    await writeFile(join(backup, 'src/decider.mjs'), safe);
    const result = await restoreTestPolicy(confirmed);
    assert.equal(result.applied, true);
    const restoredCopy = result.changes.find(item => item.path.startsWith('src/policy-safe-'));
    assert.equal(await readFile(join(trial, restoredCopy.path), 'utf8'), safe);
    assert.equal(await readFile(join(trial, 'audit.log'), 'utf8'), '가상 감사 기록\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});
