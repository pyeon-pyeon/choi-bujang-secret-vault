import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { collectApiResults, readCatalog, summarizeLiveResults } from '../src/operations-live.mjs';
import { summarizeOperations } from '../src/operations-summary.mjs';

const config = { publicAppUrl: 'https://fixture.vercel.app', identityProvider: { issuer: 'https://fixture.invalid/auth/v1' } };
async function measured() {
  let sequence = 0;
  const calls = [];
  const live = await collectApiResults({ config,
    authHeaders: { authorization: 'Bearer synthetic-private-token', cookie: 'vault_device=synthetic-device; vault_refresh=synthetic-refresh' },
    fetcher: async (url, options) => {
      assert.equal(options.method, 'GET'); assert.equal(typeof url, 'string');
      calls.push({ path: new URL(url).pathname, headers: options.headers });
      const normal = Boolean(options.headers.authorization);
      const data = normal ? [{ id: 'fixture-note', title: 'synthetic-private-title', body: 'synthetic-private-body' }]
        : url.endsWith('/data.json') ? { notes: [] } : { error: 'LOGIN_REQUIRED' };
      return { status: normal || url.endsWith('/data.json') ? 200 : 401,
        headers: { get: key => key === 'x-request-id' ? `server-fixture-${++sequence}` : null },
        text: async () => JSON.stringify(data) };
    } });
  return { live, calls };
}

test('실제 GET 응답의 가린 기록에서 집계하고 정상 본인 요청·미실행을 구분', async () => {
  const { live, calls } = await measured();
  assert.equal(calls.length, 4);
  assert.match(calls[0].path, /^\/api\/notes\/[0-9a-f-]{36}$/);
  assert.equal(calls[1].path, '/api/my/notes');
  assert.ok(calls.slice(0, 3).every(call => !call.headers.authorization && !call.headers.cookie));
  assert.ok(!calls.at(-1).headers.cookie.includes('vault_refresh'));
  assert.equal(live.summary.total, 41); assert.equal(live.summary.executed, 3);
  assert.equal(live.summary.notRun, 38); assert.equal(live.summary.blocked, 2); assert.equal(live.summary.passed, 3);
  assert.equal(live.normal.outcome, 'allowed'); assert.equal(live.normal.httpStatus, 200);
  assert.deepEqual(live.measured, live.summary.records.filter(row => row.status === 'executed'));
  assert.ok(!JSON.stringify(live).includes('synthetic-private'));
  assert.ok(!JSON.stringify(live).includes('synthetic-device'));
  assert.ok(live.summary.records.filter(row => row.status === 'not_run').every(row => row.assertionPassed === null && row.outcome === 'not_run'));
});

test('오류·증거 누락·중복 응답은 차단이나 통과를 만들지 않음', async () => {
  const unavailable = await collectApiResults({ config, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(unavailable.summary.notRun, 41); assert.equal(unavailable.summary.blocked, 0);
  const missing = await collectApiResults({ config, fetcher: async () => ({ status: 401,
    headers: { get: () => null }, text: async () => '{"error":"LOGIN_REQUIRED"}' }) });
  assert.equal(missing.summary.notRun, 41);
  const { live } = await measured();
  const bad = structuredClone(live.measured[0]); bad.httpStatus = 500;
  const summary = summarizeLiveResults(readCatalog(), [bad]);
  assert.equal(summary.blocked, 0); assert.equal(summary.passed, 0);
  assert.equal(summarizeLiveResults(readCatalog(), [live.measured[0], live.measured[0]]).executed, 0);
});

test('실제 엔진 연결 없는 탐지·회수·복구와 설정 규칙을 통과 결과로 만들지 않음', async () => {
  const { live } = await measured();
  const summary = summarizeOperations(['device_registered'], live);
  assert.equal(summary.rules.count, 1); assert.equal(summary.rules.executionStatus, 'not_run');
  for (const key of ['detection', 'revocation', 'recovery']) {
    assert.equal(summary[key].status, 'not_run'); assert.equal(summary[key].count, null);
  }
  assert.equal(summary.recovery.version, null);
  assert.equal(summary.clearance.status, 'not_run');
  assert.ok(!JSON.stringify(summary).includes('local_fixture'));
});

test('작전실 API는 로그인·기기 승인 뒤에만 실측하며 세션을 응답에 넣지 않음', async () => {
  let approved = false; let reads = 0;
  let source = await readFile(new URL('../api/operations.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace(/^const config = .*;\n/m, '')
    .replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ URL, config, randomUUID,
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'synthetic-only' } },
    createLoginVerifier: () => async () => ({ userId: 'fixture-B' }), createClient: () => ({}),
    requireRegisteredDevice: async (_c, _r, _u, response) => { if (approved) return true; response.status(403).json({ error: 'DEVICE_NOT_APPROVED' }); return false; },
    readOperationsSummary: async options => { reads++; assert.ok(options.authHeaders.authorization); return { schema: 'vault.operations-summary.v2' }; },
  });
  vm.runInContext(source, context);
  async function call(headers) {
    let code, data; const response = { setHeader() {}, status(value) { code = value; return response; }, json(value) { data = value; } };
    await context.handler({ method: 'GET', headers }, response); return { code, data };
  }
  assert.equal((await call({})).code, 401);
  assert.equal((await call({ authorization: 'Bearer synthetic-only' })).code, 403);
  assert.equal(reads, 0); approved = true;
  const result = await call({ authorization: 'Bearer synthetic-only' });
  assert.equal(result.code, 200); assert.equal(reads, 1);
  assert.ok(!JSON.stringify(result).includes('synthetic-only'));
});

test('화면은 이번 실제 API 기록과 수치를 검산하고 불일치·로그아웃 때 지움', async () => {
  class Element {
    hidden = false; textContent = ''; children = []; listeners = {};
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const elements = new Map(['#operations-status', '#operations-data', '#operations-refresh'].map(id => [id, new Element()]));
  const handlers = {}; const { live } = await measured();
  const summary = summarizeOperations(['device_registered'], live);
  const context = vm.createContext({ document: { querySelector: id => elements.get(id), createElement: () => new Element() },
    window: { addEventListener: (name, callback) => { handlers[name] = callback; } },
    fetch: async () => ({ ok: true, json: async () => summary }) });
  vm.runInContext(await readFile(new URL('../public/operations.js', import.meta.url), 'utf8'), context);
  handlers['vault-access-state']({ detail: { approved: true } });
  await new Promise(resolve => setImmediate(resolve));
  const data = elements.get('#operations-data'); const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  assert.equal(data.hidden, false);
  assert.match(text(data), /실제 확인 3, 미실행 38, 실제 막음 2/);
  assert.match(text(data), /HTTP 200 \/ allowed/);
  const masked = data.children.at(-1);
  const maskedRows = masked.children.at(-1).children;
  assert.equal(maskedRows.length, live.summary.executed + 1);
  assert.match(text(maskedRows.at(-1)), /normal_own_note_list/);
  assert.ok(!text(data).includes('synthetic-private'));
  summary.apiResults.summary.blocked = 41;
  elements.get('#operations-refresh').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(data.hidden, true); assert.equal(data.children.length, 0);
  handlers['vault-access-state']({ detail: { approved: false } });
  assert.equal(data.children.length, 0);
});
