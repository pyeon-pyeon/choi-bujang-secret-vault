import { createDecider } from '../src/decider.mjs';
import { authorizeWithClient } from '../src/zone-policy.mjs';

// 로컬 시험용 서버 저장소. 운영 판정기는 이 파일을 불러오지 않습니다.
export const NOTICE_ID = '00000000-0000-4000-8000-000000000009';
export function fixtureDecider() {
  const scope = { class_id: 'class_fixture', project_id: 'project_fixture' };
  const tables = {
    vault_identity_bindings: [
      { ...scope, subject_id: 'learner_fixture', auth_user_id: 'fixture-A' },
      { ...scope, subject_id: 'other_fixture', auth_user_id: 'fixture-B' },
      { ...scope, subject_id: 'teacher_fixture', auth_user_id: 'fixture-teacher' },
    ],
    vault_staff_roles: [{ ...scope, auth_user_id: 'fixture-teacher', role: 'instructor' }],
    learning_notes: [{ id: 'demo', owner_id: 'fixture-A' }],
    learning_notices: [{ ...scope, id: NOTICE_ID }],
  };
  const client = { from(table) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      async maybeSingle() {
        return { data: tables[table]?.find(row => filters.every(([k, v]) => row[k] === v)) ?? null, error: null };
      },
    };
    return query;
  } };
  return createDecider(request => authorizeWithClient(client, request));
}
