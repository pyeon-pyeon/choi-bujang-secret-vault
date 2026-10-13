import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { summarizeOperations, readOperationsSummary, measureApiChecks } from '../src/operations-summary.mjs';
import { API_CHECKS, toAttackAttempts, summarizeApiChecks, readApiCheckSnapshot, defenseTestCoverage } from '../src/api-checks.mjs';

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
  assert.equal(rejected.detection.count, null);
  assert.equal(rejected.detection.counts, null);
  const current = await readOperationsSummary();
  assert.equal(current.detection.count, current.detection.records.length);
});

test('요약 API도 비로그인·미승인에서는 기록을 조회하지 않음', async () => {
  let summaryReads = 0; let approved = false;
  const config = { identityProvider: { issuer: 'https://fixture.invalid/auth/v1' } };
  let source = await readFile(new URL('../api/operations.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace(/^const config = .*;\n/m, '')
    .replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ URL, config, randomUUID,
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

test('화면·묶음의 공통 기록과 수치 일치, GET만 실행, 비밀값·미실행 분리', async () => {
  const config = { step: 12, publicAppUrl: 'https://fixture.vercel.app', repoUrl: 'https://github.com/fixture/vault' };
  const calls = [];
  const result = await measureApiChecks({ config, fetcher: async (address, options) => {
    assert.equal(typeof address, 'string');
    const url = new URL(address);
    calls.push({ path: url.pathname, headers: options.headers });
    assert.equal(options.method, 'GET');
    assert.equal(options.headers, undefined);
    return { status: url.pathname.startsWith('/api/') ? 401 : 200, headers: { get: key => key === 'x-request-id' ? 'server-fixture-0001' : null },
      json: async () => url.pathname === '/data.json' ? { notes: [] } : url.pathname === '/aleph.json'
        ? { step: 12, repoUrl: config.repoUrl, token: 'synthetic-private-token' }
        : { error: 'LOGIN_REQUIRED' } };
  } });
  assert.equal(result.passed, 4); assert.equal(result.failed, 0); assert.equal(result.notRun, 2);
  assert.equal(calls.length, 4);
  assert(!JSON.stringify(result).includes('synthetic-'));
  assert.equal(result.records[0].requestId, 'server-fixture-0001');
  const attempts = toAttackAttempts();
  assert.deepEqual(attempts.map(a => a.attackId), API_CHECKS.map(a => a.attackId));
  assert.ok(attempts.every(a => a.observed === 'not_run'));
  const unavailable = await measureApiChecks({ config, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(unavailable.notRun, 6); assert.equal(unavailable.passed, 0);
  const invalid = structuredClone(result); invalid.records[0].checkedAt = null;
  assert.throws(() => summarizeApiChecks(invalid.records), /missing_evidence/);
});

test('작전실 화면은 응답 기록의 수치를 표시하고 불일치 응답은 숨김', async () => {
  class Element {
    hidden = false; textContent = ''; children = []; listeners = {};
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const elements = new Map(['#operations-status', '#operations-data', '#operations-refresh'].map(id => [id, new Element()]));
  const listeners = {};
  const config = { step: 12, publicAppUrl: 'https://fixture.vercel.app', repoUrl: 'https://github.com/fixture/vault' };
  const apiChecks = await measureApiChecks({ config, fetcher: async address => {
    const path = new URL(address).pathname;
    return { status: path.startsWith('/api/') ? 401 : 200, headers: { get: () => 'server-fixture-0001' },
      json: async () => path === '/data.json' ? { notes: [] } : path === '/aleph.json'
        ? { step: 12, repoUrl: config.repoUrl } : { error: 'LOGIN_REQUIRED' } };
  } });
  const archive = { records: apiChecks.records.map(row => ({ ...row, status: row.status === 'not_run' ? 'not_run' : 'recorded' })),
    count: 6, recordedCount: 4, notRun: 2, coverage: defenseTestCoverage() };
  const summary = { ...summarizeOperations(['device_registered'], []), apiChecks: archive };
  const context = vm.createContext({
    document: { querySelector: id => elements.get(id), createElement: () => new Element() },
    window: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    fetch: async () => ({ ok: true, json: async () => summary }),
  });
  vm.runInContext(await readFile(new URL('../public/operations.js', import.meta.url), 'utf8'), context);
  listeners['vault-access-state']({ detail: { approved: true } });
  await new Promise(resolve => setImmediate(resolve));
  const data = elements.get('#operations-data');
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  assert.equal(data.hidden, false);
  assert.match(text(data), /공식 41종: 실행 0건·미실행 41건/);
  assert.match(text(data), /확인된 막음 0건·허용 0건·통과 0건/);
  assert.ok(!text(data).includes('통과 4'));
  assert.ok(!text(data).includes('block 18'));
  for (const row of apiChecks.records) assert.ok(text(data).includes(row.attackId));
  assert.match(text(data), /검증된 기록이 없어 건수 미확인/);
  summary.apiChecks.recordedCount = 99;
  elements.get('#operations-refresh').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(data.hidden, true); assert.equal(data.children.length, 0);
});

test('보관된 실측과 현재 묶음 실행을 구분하고 실제 GET 재실행 없이 미실행 반환', async () => {
  const snapshot = readApiCheckSnapshot();
  assert.equal(snapshot.coverage.status, 'not_run');
  assert.equal(snapshot.coverage.blocked, 0);
  assert.equal(snapshot.coverage.allowed, 0);
  assert.equal(snapshot.recordedCount, snapshot.records.filter(row => row.status === 'recorded').length);
  assert.equal(snapshot.passed, undefined);
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('unexpected_fetch'); };
  try {
    const { runAttackChecks } = await import('../src/attack-check.mjs');
    const attempts = await runAttackChecks({ step: 12 });
    assert.equal(attempts.length, API_CHECKS.length);
    assert.ok(attempts.every(row => row.observed === 'not_run'));
  } finally { globalThis.fetch = original; }
});

test('미실행 41종은 막음·허용·통과에 포함되지 않음', () => {
  const coverage = defenseTestCoverage();
  assert.deepEqual(coverage, { expectedTestCount: 41, catalogAvailable: false, status: 'not_run',
    executed: 0, notRun: 41, blocked: 0, allowed: 0, passed: 0 });
  assert.equal(coverage.executed + coverage.notRun, coverage.expectedTestCount);
  const snapshot = readApiCheckSnapshot();
  // 과거 HTTP 기록 수와 무관하게 공식 시험은 전부 미실행입니다.
  assert.deepEqual(snapshot.coverage, coverage);
});
