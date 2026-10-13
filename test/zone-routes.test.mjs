import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('본인 목록·메모 단건 경로 허용, 전체 목록·기능 경로 거부', async () => {
  const { normal } = fixtureRequests();
  for (const [path, route] of [
    ['/api/my/notes', 'GET /api/my/notes'],
    ['/notes/demo', 'GET /notes/:id'],
    ['/api/notes/demo', 'GET /api/notes/:id'],
  ]) assert.equal((await decide({ ...normal, path, route })).decision, 'allow');
  for (const [path, route] of [
    ['/notes', 'GET /notes'], ['/api/notes', 'GET /api/notes'],
    ['/notes/all', 'GET /notes/:id'], ['/api/notes/all', 'GET /api/notes/:id'],
    ['/api/notes/ALL', 'GET /api/notes/:id'], ['/api/notes/export', 'GET /api/notes/:id'],
    ['/api/notes/list', 'GET /api/notes/:id'], ['/api/notes/demo/export', 'GET /api/notes/:id'],
  ]) assert.equal((await decide({ ...normal, path, route })).decision, 'deny', path);
});

test('공지·강사 자료 쓰기는 메서드나 서비스 표기 우회에도 거부', async () => {
  const { normal } = fixtureRequests();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const [service, path] of [
      ['notices', '/api/notices/demo'], ['notices', '/notices/demo'],
      ['instructor-materials', '/api/instructor-materials/demo'],
      ['notes', '/api/notices/demo'],
    ]) {
      const route = `${method} ${path.replace('/demo', '/:id')}`;
      assert.equal((await decide({ ...normal, service, method, path, route })).decision, 'deny');
    }
  }
});
