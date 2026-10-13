import { readFileSync } from 'node:fs';

function unrun(test) {
  return { ...test, status: 'not_run', outcome: 'not_run', actual: null,
    requestId: null, checkedAt: null, assertionPassed: null };
}

function recorded(test, input) {
  // 미실행 행의 기대 결과·임의 block/pass 표시는 판정으로 쓰지 않습니다.
  if (input?.status !== 'executed') return unrun(test);
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{8,160}$/.test(input.requestId)
      || typeof input.checkedAt !== 'string' || !input.checkedAt.endsWith('Z')
      || !Number.isFinite(Date.parse(input.checkedAt)) || !input.actual) return unrun(test);
  const httpStatus = input.actual.httpStatus ?? null;
  const decision = input.actual.decision ?? null;
  const dataReturned = input.actual.dataReturned ?? null;
  if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) return unrun(test);
  if (decision !== null && !['allow', 'deny', 'step_up'].includes(decision)) return unrun(test);
  if (dataReturned !== null && typeof dataReturned !== 'boolean') return unrun(test);
  const outcome = input.outcome;
  const valid = outcome === 'blocked'
    ? dataReturned === false && ([401, 403, 404].includes(httpStatus) || decision === 'deny')
    : outcome === 'allowed'
      ? (httpStatus >= 200 && httpStatus < 300) || decision === 'allow'
      : outcome === 'step_up' ? decision === 'step_up'
        : outcome === 'failed' && httpStatus !== null;
  if (!valid) return unrun(test);
  return { ...test, status: 'executed', outcome,
    actual: { httpStatus, decision, dataReturned }, requestId: input.requestId,
    checkedAt: input.checkedAt, assertionPassed: input.assertionPassed === true };
}

export function summarizeDefenseTests(catalog, saved) {
  if (catalog?.schema !== 'vault.defense-catalog.v1' || !Array.isArray(catalog.tests)
      || catalog.tests.length === 0 || catalog.tests.some(test => !/^[a-z0-9_]{1,80}$/.test(test.attackId)
        || !Number.isInteger(test.step) || test.step < 1 || test.step > 12
        || typeof test.expected !== 'string' || test.expected.length > 600)
      || new Set(catalog.tests.map(test => test.attackId)).size !== catalog.tests.length) throw new Error('invalid_catalog');
  const supplied = saved?.schema === 'vault.defense-test-records.v1' && Array.isArray(saved.records) ? saved.records : [];
  const records = catalog.tests.map(({ attackId, step, expected }) => {
    const matches = supplied.filter(row => row?.attackId === attackId);
    return recorded({ attackId, step, expected }, matches.length === 1 ? matches[0] : null);
  });
  const executed = records.filter(row => row.status === 'executed');
  return { expectedTestCount: records.length, catalogAvailable: true,
    source: catalog.sourceUrl, records,
    status: executed.length === 0 ? 'not_run' : executed.length === records.length ? 'executed' : 'partially_run',
    executed: executed.length, notRun: records.filter(row => row.status === 'not_run').length,
    blocked: executed.filter(row => row.outcome === 'blocked').length,
    allowed: executed.filter(row => row.outcome === 'allowed').length,
    passed: executed.filter(row => row.assertionPassed === true).length };
}

export function readDefenseTestResults() {
  let catalog;
  try { catalog = JSON.parse(readFileSync(new URL('../operations/defense-catalog.json', import.meta.url), 'utf8')); }
  catch { return { catalogAvailable: false, status: 'not_run', records: [],
    expectedTestCount: null, executed: null, notRun: null, blocked: null, allowed: null, passed: null }; }
  let saved = null;
  try { saved = JSON.parse(readFileSync(new URL('../operations/defense-tests.json', import.meta.url), 'utf8')); }
  catch { /* 결과가 없으면 제공 목록의 각 행을 미실행으로 둡니다. */ }
  try { return summarizeDefenseTests(catalog, saved); }
  catch { return { catalogAvailable: false, status: 'not_run', records: [],
    expectedTestCount: null, executed: null, notRun: null, blocked: null, allowed: null, passed: null }; }
}
