import { readFile } from 'node:fs/promises';
import { RULE_IDS } from './decider.mjs';

export function summarizeOperations(ruleIds, datasets) {
  if (!Array.isArray(ruleIds) || ruleIds.some(id => !/^[a-z][a-z0-9_.-]{0,79}$/.test(id))) throw new Error('invalid_rules');
  const rules = [...new Set(ruleIds)].map(ruleId => ({ ruleId, source: 'server_configuration' }));
  const records = [];
  const sources = [];
  for (const { moduleKey, result } of datasets) {
    const prefix = moduleKey === 'brute-force' ? 'bf' : moduleKey === 'web-injection' ? 'wi' : null;
    const counts = { block: 0, alert: 0, record: 0 };
    const rows = [];
    let valid = prefix && result?.schema === 'aleph.xdr.result.v1'
      && result.moduleKey === moduleKey && Array.isArray(result.decisions);
    if (valid) for (const event of result.decisions) {
      if (typeof event?.alertId !== 'string' || !new RegExp(`^${prefix}-\\d+$`).test(event.alertId)
          || !Object.hasOwn(counts, event.action)) { valid = false; break; }
      rows.push({ moduleKey, alertId: event.alertId, action: event.action, source: 'local_fixture' });
      counts[event.action]++;
    }
    if (valid && (new Set(rows.map(row => row.alertId)).size !== rows.length
        || Object.keys(counts).some(key => result.counts?.[key] !== counts[key]))) valid = false;
    if (valid) { records.push(...rows); sources.push({ moduleKey, status: 'fixture_records_verified', counts }); }
    else sources.push({ moduleKey, status: 'missing_or_invalid', counts: null });
  }
  const counts = { block: 0, alert: 0, record: 0 };
  for (const row of records) counts[row.action]++;
  return {
    schema: 'vault.operations-summary.v1', checkedAt: new Date().toISOString(),
    rules: { count: rules.length, records: rules, source: 'server_configuration' },
    detection: { count: sources.some(s => s.status === 'fixture_records_verified') ? records.length : null,
      counts: sources.some(s => s.status === 'fixture_records_verified') ? counts : null, records, sources, source: 'local_fixture',
      operationalStatus: 'no_verified_live_records' },
    revocation: { status: 'not_verified', count: null, records: [], reason: '실제 회수·시간 실측 기록이 연결되지 않았습니다.' },
    recovery: { status: 'not_verified', version: null, records: [], reason: '실제 검증 사본 복구 버전·복구 후 실측 기록이 연결되지 않았습니다.' },
  };
}

export async function readOperationsSummary(options) {
  const datasets = [];
  for (const moduleKey of ['brute-force', 'web-injection']) {
    let result = null;
    try { result = JSON.parse(await readFile(new URL(`../xdr/${moduleKey}/result.json`, import.meta.url), 'utf8')); }
    catch { /* 경로·파일 원문·오류 내용을 응답이나 로그에 전달하지 않습니다. */ }
    datasets.push({ moduleKey, result });
  }
  const summary = summarizeOperations(RULE_IDS, datasets);
  summary.apiChecks = options ? await measureApiChecks(options) : { records: [], count: 0, passed: 0, failed: 0, notRun: 0, status: 'not_run' };
  return summary;
}

// 설정된 자료실의 고정 경로만 읽으며 응답 원문·인증 값은 반환하지 않습니다.
export async function measureApiChecks({ config, headers = {}, fetcher = fetch }) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || !app.hostname.endsWith('.vercel.app')) throw new Error('invalid_app');
  const records = await Promise.all([
    ['static_empty', '/data.json', false, 'HTTP 200·빈 notes 배열'],
    ['anonymous_notes', '/api/notes', false, 'HTTP 401·자료 없음'],
    ['own_notes', '/api/my/notes', true, 'HTTP 200·본인 메모 배열'],
  ].map(async ([testId, path, signedIn, expected]) => {
    const record = { testId, method: 'GET', path, expected, source: 'live_api',
      status: 'not_run', httpStatus: null, requestId: null, checkedAt: null, matched: null };
    if (signedIn && !headers.cookie && !headers.authorization) return record;
    try {
      const response = await fetcher(new URL(path, app), { method: 'GET', redirect: 'error',
        headers: signedIn ? headers : {}, signal: AbortSignal.timeout(10000) });
      record.httpStatus = response.status;
      record.checkedAt = new Date().toISOString();
      const id = response.headers?.get('x-request-id');
      if (typeof id === 'string' && /^[a-f0-9-]{16,64}$/i.test(id)) record.requestId = id;
      let data = null;
      try { data = await response.json(); } catch { /* 본문은 기록하지 않습니다. */ }
      record.matched = testId === 'static_empty'
        ? response.status === 200 && Array.isArray(data?.notes) && data.notes.length === 0
        : testId === 'anonymous_notes'
          ? response.status === 401 && data !== null && !Array.isArray(data)
            && Object.keys(data).every(key => key === 'error') && typeof data.error === 'string'
          : response.status === 200 && Array.isArray(data)
            && data.every(row => typeof row?.id === 'string' && typeof row.title === 'string' && typeof row.body === 'string');
      record.status = record.matched ? 'passed' : 'failed';
    } catch { /* 미확인을 성공이나 0건으로 처리하지 않습니다. */ }
    return record;
  }));
  records.push({ testId: 'write_restore_revocation', method: null, path: null,
    expected: '쓰기·복원·회수는 별도 실측', source: 'live_api', status: 'not_run',
    httpStatus: null, requestId: null, checkedAt: null, matched: null });
  return { records, count: records.length, passed: records.filter(r => r.status === 'passed').length,
    failed: records.filter(r => r.status === 'failed').length, notRun: records.filter(r => r.status === 'not_run').length };
}
