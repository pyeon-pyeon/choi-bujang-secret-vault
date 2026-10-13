import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { summarizeOperations, readOperationsSummary } from '../src/operations-summary.mjs';

test('가린 기록과 합계 일치, 원문 제외, 실행 증거 없는 상태는 미확인', async () => {
  const result = { schema: 'aleph.xdr.result.v1', moduleKey: 'brute-force',
    counts: { block: 1, alert: 0, record: 1 }, decisions: [
      { alertId: 'bf-01', action: 'block', body: 'synthetic-private-content', token: 'synthetic-token' },
      { alertId: 'bf-02', action: 'record', reason: 'synthetic-private-reason' },
    ] };
  const summary = summarizeOperations(['device_registered'], [{ moduleKey: 'brute-force', result }]);
  assert.equal(summary.rules.count, summary.rules.records.length);
  assert.equal(summary.detection.count, summary.detection.records.length);
  assert.equal(Object.values(summary.detection.counts).reduce((a, b) => a + b, 0), summary.detection.count);
  assert(!JSON.stringify(summary).includes('synthetic-'));
  assert.equal(summary.revocation.count, null);
  assert.equal(summary.recovery.version, null);
  const invalid = structuredClone(result); invalid.counts.block = 99;
  const rejected = summarizeOperations([], [{ moduleKey: 'brute-force', result: invalid }]);
  assert.equal(rejected.detection.sources[0].status, 'missing_or_invalid');
  assert.equal(rejected.detection.records.length, 0);
  const current = await readOperationsSummary();
  assert.equal(current.detection.count, current.detection.records.length);
});

test('요약 API도 비로그인·미승인에서는 기록을 조회하지 않음', async () => {
  let summaryReads = 0; let approved = false;
  const config = { identityProvider: { issuer: 'https://fixture.invalid/auth/v1' } };
  let source = await readFile(new URL('../api/operations.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace(/^const config = .*;\n/m, '')
    .replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ URL, config,
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'synthetic-test-only' } },
    createLoginVerifier: () => async () => ({ userId: 'fixture-B' }), createClient: () => ({}),
    requireRegisteredDevice: async (_c, _r, _u, res) => { if (approved) return true; res.status(403).json({ error: 'DEVICE_NOT_APPROVED' }); return false; },
    readOperationsSummary: async () => { summaryReads++; return { schema: 'vault.operations-summary.v1' }; },
  });
  vm.runInContext(source, context);
  async function call(headers) {
    let code;
    const response = { setHeader() {}, status(v) { code = v; return response; }, json() {} };
    await context.handler({ method: 'GET', headers }, response);
    return code;
  }
  assert.equal(await call({}), 401);
  assert.equal(await call({ authorization: 'Bearer synthetic-test-only' }), 403);
  assert.equal(summaryReads, 0);
  approved = true;
  assert.equal(await call({ authorization: 'Bearer synthetic-test-only' }), 200);
  assert.equal(summaryReads, 1);
});
