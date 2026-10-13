import { readApiCheckSnapshot } from './api-checks.mjs';
export { measureApiChecks } from './api-checks.mjs';
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
      // 패턴 분류 block은 실행된 차단이 아닙니다. 원본 후보 분류는 별도 보존합니다.
      rows.push({ moduleKey, alertId: event.alertId, action: 'record',
        candidateAction: event.action, executionStatus: 'not_run', source: 'local_fixture' });
      counts[event.action]++;
    }
    if (valid && (new Set(rows.map(row => row.alertId)).size !== rows.length
        || Object.keys(counts).some(key => result.counts?.[key] !== counts[key]))) valid = false;
    if (valid) {
      const appliedCounts = { block: 0, alert: 0, record: 0 };
      for (const row of rows) appliedCounts[row.action]++;
      records.push(...rows);
      sources.push({ moduleKey, status: 'fixture_records_verified', counts: appliedCounts });
    }
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

export async function readOperationsSummary() {
  const datasets = [];
  for (const moduleKey of ['brute-force', 'web-injection']) {
    let result = null;
    try { result = JSON.parse(await readFile(new URL(`../xdr/${moduleKey}/result.json`, import.meta.url), 'utf8')); }
    catch { /* 경로·파일 원문·오류 내용을 응답이나 로그에 전달하지 않습니다. */ }
    datasets.push({ moduleKey, result });
  }
  const summary = summarizeOperations(RULE_IDS, datasets);
  summary.apiChecks = readApiCheckSnapshot();
  summary.checkedAt = new Date().toISOString();
  return summary;
}
