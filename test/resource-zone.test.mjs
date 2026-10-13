import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDecider, NOTICE_ID } from '../scripts/zone-fixtures.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { createDecider } from '../src/decider.mjs';

test('서버 권한 저장소로 본인 GET·PUT 허용, 타인·학생 공지 수정 거부', async () => {
  const decide = fixtureDecider();
  const { normal } = fixtureRequests();
  for (const method of ['GET', 'PUT']) {
    const request = { ...normal, method, route: `${method} /notes/:id` };
    assert.equal((await decide(request)).decision, 'allow');
    assert.equal((await decide({ ...request, subjectId: 'other_fixture' })).decision, 'deny');
  }
  const notice = { ...normal, service: 'notices', method: 'PUT',
    path: `/notices/${NOTICE_ID}`, route: 'PUT /notices/:id' };
  assert.equal((await decide(notice)).decision, 'deny');
  assert.equal((await decide({ ...notice, subjectId: 'teacher_fixture' })).decision, 'allow');
  assert.equal((await decide({ ...notice, subjectId: 'teacher_fixture', classId: 'wrong_class' })).decision, 'deny');
  assert.equal((await decide({ ...normal, subjectId: 'unbound_fixture' })).decision, 'deny');
  assert.equal((await decide({ ...normal, path: '/notes/export' })).decision, 'deny');
});

test('기기·재확인 검사 유지 및 권한 저장소 오류는 기본 거부', async () => {
  const decide = fixtureDecider();
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide({ ...normal, deviceRegistered: false })).reasonCode, 'device_not_registered');
  assert.equal((await decide(suspicious)).decision, 'step_up');
  assert.equal((await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
  const failed = createDecider(async () => { throw new Error('가상 저장소 오류'); });
  assert.equal((await failed(normal)).decision, 'deny');
});
