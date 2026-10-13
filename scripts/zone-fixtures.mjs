import { createDecider } from '../src/decider.mjs';

// 제공 가상 주체와 경로를 사용하는 로컬 시험 설정. 운영에서는 사용하지 않습니다.
export function fixtureDecider() {
  const scope = { classId: 'class_fixture', projectId: 'project_fixture' };
  return createDecider([
    { ...scope, subjectId: 'learner_fixture', service: 'notes', path: '/notes/demo', methods: ['GET', 'PUT'] },
    { ...scope, subjectId: 'teacher_fixture', service: 'notices', path: '/notices/demo', methods: ['PUT'] },
  ]);
}
