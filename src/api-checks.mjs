// 묶음과 작전실이 함께 사용하는 읽기 전용 점검 목록입니다.
export const API_CHECKS = Object.freeze([
  { attackId: 'static_notes_empty', path: '/data.json', expected: 'HTTP 200·빈 notes 배열' },
  { attackId: 'deployment_identity', path: '/aleph.json', expected: 'HTTP 200·배포 단계와 저장소 일치' },
  { attackId: 'anonymous_notes_denied', path: '/api/notes', expected: 'HTTP 401·자료 없음' },
  { attackId: 'anonymous_operations_denied', path: '/api/operations', expected: 'HTTP 401·기록 없음' },
  { attackId: 'own_notes', path: null, expected: '승인된 본인 자료 읽기는 별도 실측' },
  { attackId: 'write_and_approval_checks', path: null, expected: '쓰기·승인·복원·회수는 별도 실측' },
].map(check => Object.freeze(check)));

export function summarizeApiChecks(records) {
  if (!Array.isArray(records) || records.length !== API_CHECKS.length) throw new Error('invalid_checks');
  for (let index = 0; index < records.length; index++) {
    const row = records[index];
    const check = API_CHECKS[index];
    if (row.attackId !== check.attackId || row.expected !== check.expected || row.path !== check.path
        || !['passed', 'failed', 'not_run'].includes(row.status)) throw new Error('invalid_check');
    if (row.status === 'not_run' && (row.observed !== 'not_run' || row.matched !== null)) throw new Error('invalid_not_run');
    if (row.status !== 'not_run' && (!Number.isInteger(row.httpStatus) || row.httpStatus < 100
        || row.httpStatus > 599 || !Number.isFinite(Date.parse(row.checkedAt))
        || typeof row.matched !== 'boolean' || (row.status === 'passed') !== row.matched)) throw new Error('missing_evidence');
  }
  return { records, count: records.length,
    passed: records.filter(row => row.status === 'passed').length,
    failed: records.filter(row => row.status === 'failed').length,
    notRun: records.filter(row => row.status === 'not_run').length };
}

export async function measureApiChecks({ config, fetcher = fetch }) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || !app.hostname.endsWith('.vercel.app')) throw new Error('invalid_app');
  const records = await Promise.all(API_CHECKS.map(async check => {
    const row = { ...check, method: check.path ? 'GET' : null, source: 'live_api', status: 'not_run',
      httpStatus: null, requestId: null, checkedAt: null, matched: null, observed: 'not_run' };
    if (check.path) try {
      // 문자열 URL로 호출합니다. 이 헤더는 학생 점검 식별자이며 권한의 근거가 아닙니다.
      // 제공 심판이 이 헤더를 읽는 계약인지는 별도 확인해야 합니다.
      const response = await fetcher(new URL(check.path, app).href, {
        method: 'GET', redirect: 'error', headers: { 'x-aleph-attack-id': check.attackId },
        signal: AbortSignal.timeout(10000),
      });
      row.httpStatus = response.status;
      row.checkedAt = new Date().toISOString();
      const requestId = response.headers?.get('x-request-id');
      if (typeof requestId === 'string' && /^[a-f0-9-]{16,64}$/i.test(requestId)) row.requestId = requestId;
      let data = null;
      try { data = await response.json(); } catch { /* 원문은 출력·저장하지 않습니다. */ }
      row.matched = check.attackId === 'static_notes_empty'
        ? response.status === 200 && Array.isArray(data?.notes) && data.notes.length === 0
        : check.attackId === 'deployment_identity'
          ? response.status === 200 && data?.step === config.step && data?.repoUrl === config.repoUrl
          : response.status === 401 && data !== null && !Array.isArray(data)
            && Object.keys(data).every(key => key === 'error') && typeof data.error === 'string';
      row.status = row.matched ? 'passed' : 'failed';
      row.observed = `HTTP ${row.httpStatus}; expected_match=${row.matched}; checkedAt=${row.checkedAt}`;
    } catch {
      row.status = 'not_run'; row.httpStatus = null; row.requestId = null;
      row.checkedAt = null; row.matched = null; row.observed = 'not_run';
    }
    return row;
  }));
  return summarizeApiChecks(records);
}

export function toAttackAttempts(summary) {
  summarizeApiChecks(summary.records);
  return summary.records.map(({ attackId, expected, observed }) => ({ attackId, expected, observed }));
}
