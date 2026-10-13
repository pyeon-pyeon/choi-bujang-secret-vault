import { RULE_IDS } from './decider.mjs';
import { collectApiResults, readCatalog, summarizeLiveResults } from './operations-live.mjs';

export function summarizeOperations(ruleIds, live) {
  if (!Array.isArray(ruleIds) || ruleIds.some(id => !/^[a-z][a-z0-9_.-]{0,79}$/.test(id))) throw new Error('INVALID_RULES');
  const rules = [...new Set(ruleIds)].map(ruleId => ({ ruleId, source: 'server_configuration' }));
  const pending = reason => ({ status: 'not_run', count: null, records: [], reason });
  return { schema: 'vault.operations-summary.v2', checkedAt: new Date().toISOString(),
    rules: { count: rules.length, records: rules, source: 'server_configuration', executionStatus: 'not_run' },
    apiResults: live,
    detection: pending('실제 ALEPH SDP 엔진 사건을 읽는 연결 계약이 확인되지 않았습니다. 로컬 fixture는 집계하지 않습니다.'),
    revocation: pending('실제 회수 완료·경과 시간 기록이 연결되지 않았습니다.'),
    recovery: { ...pending('실제 복구 완료·사본 비교 결과가 연결되지 않았습니다.'), version: null },
    clearance: { status: 'not_run', reason: '12단계 통과와 제공 41종 방어는 심판 판정으로 확인합니다.' },
  };
}

export async function readOperationsSummary(options) {
  const live = options ? await collectApiResults(options) : {
    summary: summarizeLiveResults(readCatalog(), []), normal: null, measured: [],
    catalogSource: readCatalog().sourceUrl,
  };
  return summarizeOperations(RULE_IDS, live);
}
