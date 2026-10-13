import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { noteContentHash } from '../src/note-hash.mjs';

test('가상 B의 한 건 복원 및 사본·ID·소유자·해시 검사', async () => {
  const id = '00000000-0000-4000-8000-000000000004';
  const owner = 'fixture-B';
  // 시험 자료는 런타임 메모리에서만 만들고 로그·사본 파일에 기록하지 않습니다.
  const title = ['가상', ' 시험 제목'].join('');
  const content = ['가상', ' 시험 내용'].join('');
  const saved = { note_id: id, owner_id: owner, title, content,
    content_sha256: noteContentHash(title, content), verified: true };
  const notes = new Map([[id, { id, owner_id: owner, title: '손상', content: '손상' }],
    ['unrelated', { id: 'unrelated', owner_id: owner, title: '보존', content: '보존' }]]);
  const unrelated = structuredClone(notes.get('unrelated'));
  const audit = ['기존 가상 감사 기록'];
  let snapshot = structuredClone(saved);
  let calls = 0;
  const config = { publicAppUrl: 'https://fixture.invalid', identityProvider: { issuer: 'https://fixture.invalid/auth/v1' } };
  const client = {
    from() {
      const filters = [];
      const query = { select() { return query; }, eq(k, v) { filters.push([k, v]); return query; },
        async maybeSingle() { return { error: null, data: snapshot && filters.every(([k, v]) => snapshot[k] === v) ? snapshot : null }; } };
      return query;
    },
    async rpc(name, args) {
      calls++;
      assert.equal(name, 'restore_learning_note');
      assert.equal(args.p_note_id, id);
      assert.equal(args.p_owner_id, owner);
      notes.set(id, { id, owner_id: owner, title: snapshot.title, content: snapshot.content });
      return { error: null, data: [{ id, owner_id: owner, content_sha256: snapshot.content_sha256 }] };
    },
  };
  let source = await readFile(new URL('../api/restore/[noteId].js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace(/^const config = .*;\n/m, '')
    .replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ URL, config, noteContentHash,
    requireRegisteredDevice: async () => true, // 승인 기기 조건; 기기 게이트는 별도 시험
    process: { env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'synthetic-test-only' } },
    createClient: () => client, createLoginVerifier: () => async () => ({ userId: owner }) });
  vm.runInContext(source, context);
  async function restore(query = { noteId: id }, body) {
    let status, response;
    const res = { setHeader() {}, status(value) { status = value; return res; }, json(value) { response = value; return res; } };
    await context.handler({ method: 'POST', query, headers: { authorization: 'Bearer synthetic-test-only' }, body }, res);
    return { status, response };
  }
  const result = await restore();
  assert.equal(result.status, 200);
  assert.equal(notes.get(id).id, saved.note_id);
  assert.equal(notes.get(id).owner_id, saved.owner_id);
  assert.equal(noteContentHash(notes.get(id).title, notes.get(id).content), saved.content_sha256);
  assert.deepEqual(notes.get('unrelated'), unrelated);
  assert.deepEqual(audit, ['기존 가상 감사 기록']);
  assert.equal(Object.keys(result.response).sort().join(','), 'content_sha256,id,restored');
  snapshot = { ...saved, content_sha256: '0'.repeat(64) };
  assert.equal((await restore()).status, 404);
  snapshot = { ...saved, owner_id: 'unrelated_fixture' };
  assert.equal((await restore()).status, 404);
  snapshot = null;
  assert.equal((await restore()).status, 404);
  assert.equal((await restore({ noteId: 'export' })).status, 400);
  assert.equal((await restore({ noteId: id }, { owner_id: owner })).status, 400);
  assert.equal(calls, 1);
});
