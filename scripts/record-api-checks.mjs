import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { measureApiChecks } from '../src/api-checks.mjs';

// 별도 실행한 공개 GET의 가린 증거만 보관합니다. 인증·쓰기 요청은 없습니다.
const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const summary = await measureApiChecks({ config });
mkdirSync(new URL('../operations/', import.meta.url), { recursive: true });
writeFileSync(new URL('../operations/api-checks.json', import.meta.url),
  JSON.stringify({ schema: 'vault.api-check-snapshot.v1', deploymentCommit: summary.records.find(row => row.attackId === 'deployment_identity')?.deploymentCommit ?? null, records: summary.records.map(row => ({ ...row, status: row.status === 'not_run' ? 'not_run' : 'recorded' })) }, null, 2) + '\n');
console.log(`가린 GET 기록 저장: 응답 확인 ${summary.passed + summary.failed}, 미실행 ${summary.notRun}. 공식 41종 결과가 아닙니다.`);
