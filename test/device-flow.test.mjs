import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { registeredDevice, requireRegisteredDevice, deviceTokenHash } from '../src/device-access.mjs';

test('요청은 대기만 생성, 서버 승인 후 자료 허용, 회수·다른 계정은 거부', async () => {
  const config = { publicAppUrl: 'https://fixture.invalid', identityProvider: { issuer: 'https://fixture.invalid/auth/v1' } };
  let device;
  let noteReads = 0;
  const client = { from(table) {
    const filters = [];
    const query = { select() { return query; }, eq(k, v) { filters.push([k, v]); return query; },
      async insert(row) { device = { ...row, status: 'pending' }; return { error: null }; },
      async maybeSingle() {
        if (table === 'vault_devices') return { error: null,
          data: device && filters.every(([k, v]) => device[k] === v) ? device : null };
        noteReads++;
        return { error: null, data: { id: '00000000-0000-4000-8000-000000000004', owner_id: 'fixture-B', title: '가상 제목', content: '가상 내용' } };
      },
    };
    return query;
  } };
  const globals = { URL, config, randomBytes, randomUUID, registeredDevice, deviceTokenHash, requireRegisteredDevice,
    RESOURCE_IDS: { notes: 'notes' },
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'synthetic-test-only' } },
    createLoginVerifier: () => async () => ({ userId: 'fixture-B' }), createClient: () => client };
  async function handler(file) {
    const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
      .replace(/^import .*;\n/gm, '').replace(/^const config = .*;\n/m, '')
      .replace('export default async function handler', 'async function handler');
    const context = vm.createContext({ ...globals });
    vm.runInContext(source, context);
    return context.handler;
  }
  const approval = await handler('../api/device.js');
  const notes = await handler('../api/notes.js');
  async function call(fn, method, cookie = '', body) {
    let code, data;
    const headers = {};
    const response = { setHeader(k, v) { headers[k] = v; }, status(v) { code = v; return response; }, json(v) { data = v; return response; } };
    await fn({ method, headers: { authorization: 'Bearer synthetic-test-only', origin: config.publicAppUrl, cookie },
      query: fn === notes ? { id: '00000000-0000-4000-8000-000000000004' } : {}, body }, response);
    return { code, data, headers };
  }
  assert.equal((await call(notes, 'GET')).code, 403);
  assert.equal(noteReads, 0);
  assert.equal((await call(approval, 'POST', '', { approved: true })).code, 400);
  const pending = await call(approval, 'POST');
  assert.equal(pending.code, 202);
  assert.equal(pending.data.status, 'pending');
  assert(!('token' in pending.data));
  const cookie = pending.headers['Set-Cookie'].split(';')[0];
  assert.match(pending.headers['Set-Cookie'], /Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await call(approval, 'GET', cookie)).data.status, 'pending');
  assert.equal((await call(notes, 'GET', cookie)).code, 403);
  assert.equal(noteReads, 0);
  device.status = 'approved'; // 관리자 검증 승인을 모의함. 요청 API가 승인하지 않습니다.
  assert.equal((await call(approval, 'GET', cookie)).data.status, 'approved');
  assert.equal((await call(notes, 'GET', cookie)).code, 200);
  assert.equal(noteReads, 1);
  assert.equal((await registeredDevice(client, { headers: { cookie } }, 'unrelated_fixture')).status, 'not_requested');
  device.status = 'revoked';
  assert.equal((await call(notes, 'GET', cookie)).code, 403);
  device.status = 'approved'; device.expires_at = new Date(Date.now() - 1).toISOString();
  assert.equal((await call(notes, 'GET', cookie)).code, 403);
});

test('화면도 승인 전 메모 요청·표시 없이 대기하고 승인 조회 뒤 기존 목록 표시', async () => {
  class Element {
    value = ''; children = []; listeners = {}; hidden = false;
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...items) { this.children = items; }
    append(...items) { this.children.push(...items); }
    reset() {}
    querySelector() { return new Element(); }
  }
  const elements = new Map();
  let state = 'pending'; let noteRequests = 0;
  const document = { hidden: false,
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    createElement: () => new Element() };
  const context = vm.createContext({ document, setInterval() {}, window: { dispatchEvent() {} }, CustomEvent: class {}, fetch: async path => {
    if (path === '/api/auth') return { ok: true, json: async () => ({ signedIn: true }) };
    if (path === '/api/device') return { ok: true, json: async () => ({ status: state }) };
    if (path === '/api/notes') { noteRequests++; return { ok: true, json: async () => [{ id: 'demo', title: '가상 제목', body: '가상 내용' }] }; }
    throw new Error('unexpected_path');
  } });
  const source = await readFile(new URL('../public/auth.js', import.meta.url), 'utf8');
  await vm.runInContext(`(async () => { ${source}\n await loadNotes(currentSession); })()`, context);
  assert.equal(noteRequests, 0);
  assert.equal(elements.get('#note-form').hidden, true);
  assert(!elements.get('#notes').children.some(item => item.children.length));
  state = 'approved';
  await elements.get('#refresh-device').listeners.click();
  assert.equal(noteRequests, 1);
  assert.equal(elements.get('#note-form').hidden, false);
  assert.equal(elements.get('#notes').children.length, 1);
});
