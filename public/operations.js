const status = document.querySelector('#operations-status');
const content = document.querySelector('#operations-data');
const refresh = document.querySelector('#operations-refresh');
let approved = false;
let revision = 0;
function clearSummary() {
  revision++; content.hidden = true; content.replaceChildren(); refresh.hidden = true;
  status.textContent = '로그인과 서버 기기 승인 뒤 실제 API 결과를 확인합니다.';
}
function section(title, text) {
  const box = document.createElement('section');
  const heading = document.createElement('h3'); heading.textContent = title;
  const paragraph = document.createElement('p'); paragraph.textContent = text;
  box.append(heading, paragraph); return box;
}
function showRecord(row) {
  if (!row || row.status === 'not_run') return '미실행';
  return `HTTP ${row.httpStatus} / ${row.outcome} / 요청 ID ${row.requestId ?? '미제공'} / ${row.checkedAt}`;
}
async function loadSummary() {
  if (!approved) { clearSummary(); return; }
  const version = ++revision;
  refresh.disabled = true;
  status.textContent = '서버가 실제 읽기 API 응답을 확인하고 있습니다.';
  try {
    const response = await fetch('/api/operations', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('SUMMARY_UNAVAILABLE');
    const data = await response.json();
    if (!approved || version !== revision) return;
    const results = data.apiResults?.summary;
    if (data.schema !== 'vault.operations-summary.v2' || !Array.isArray(results?.records)
        || !Array.isArray(data.rules?.records) || data.rules.count !== data.rules.records.length
        || results.total !== results.records.length
        || new Set(results.records.map(row => row.attackId)).size !== results.records.length) throw new Error('INVALID_SUMMARY');
    const executed = results.records.filter(row => row.status === 'executed');
    const unrun = results.records.filter(row => row.status === 'not_run');
    if (executed.length + unrun.length !== results.total || results.executed !== executed.length
        || results.notRun !== unrun.length
        || unrun.some(row => row.outcome !== 'not_run' || row.assertionPassed !== null || row.httpStatus !== null)
        || results.blocked !== executed.filter(row => row.outcome === 'blocked').length
        || results.passed !== executed.filter(row => row.assertionPassed === true).length
        || results.errors !== executed.filter(row => row.outcome === 'error').length
        || executed.some(row => !row.requestId || !row.checkedAt || !row.urlSha256)) throw new Error('COUNT_MISMATCH');
    const rules = section('학생 판정 규칙', `${data.rules.count}개: ${data.rules.records.map(row => row.ruleId).join(', ')}. 서버 설정이며 실제 엔진 판정 건수는 미실행입니다.`);
    const api = section('실제 자료 API 확인', showRecord(data.apiResults.normal) + '. 본인 목록 확인이며 제공 41종과 별도입니다.');
    const tests = section('제공 시험 · 실제 응답만 집계', `${results.total}종 중 실제 확인 ${results.executed}, 미실행 ${results.notRun}, 실제 막음 ${results.blocked}, 기대 일치 ${results.passed}, 불일치 ${results.errors}. 총공세 클리어 선언이 아닙니다.`);
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const label of ['시험 ID', '단계', '기대 결과', '실제 결과', '요청 ID', '확인 시각']) {
      const cell = document.createElement('th'); cell.textContent = label; head.append(cell);
    }
    table.append(head);
    for (const row of results.records) {
      const line = document.createElement('tr');
      for (const value of [row.attackId, row.step, row.expected,
        row.status === 'not_run' ? '미실행' : `HTTP ${row.httpStatus} / ${row.outcome}`,
        row.requestId ?? '미실행', row.checkedAt ?? '미실행']) {
        const cell = document.createElement('td'); cell.textContent = String(value); line.append(cell);
      }
      table.append(line);
    }
    tests.append(table);
    const pending = ['detection', 'revocation', 'recovery'].map((key, index) => {
      const result = data[key];
      if (result?.status !== 'not_run' || result.count !== null || !Array.isArray(result.records) || result.records.length) throw new Error('UNVERIFIED_ENGINE_RESULT');
      return section(['실제 탐지', '실제 회수', '실제 복구'][index], '미실행 · ' + result.reason);
    });
    const masked = section('가린 서버 기록', '이 표의 결과는 이번 /api/operations 응답에서 읽었습니다. 본문·계정 ID·쿠키·토큰·키는 포함하지 않습니다.');
    const list = document.createElement('ul');
    for (const row of [...executed, ...(data.apiResults.normal?.status === 'executed' ? [data.apiResults.normal] : [])]) {
      const item = document.createElement('li');
      item.textContent = `${row.attackId} / ${row.method} / URL SHA-256 ${row.urlSha256} / ${showRecord(row)}`;
      list.append(item);
    }
    masked.append(list);
    content.replaceChildren(rules, api, tests, ...pending, masked);
    content.hidden = false; refresh.hidden = false;
    status.textContent = '이번 서버 확인 시각: ' + data.checkedAt;
  } catch {
    if (version !== revision) return;
    content.hidden = true; content.replaceChildren();
    status.textContent = '실제 결과를 검증하지 못했습니다. 이전 수치를 표시하지 않습니다.';
  } finally { if (version === revision) refresh.disabled = false; }
}
window.addEventListener('vault-access-state', event => {
  const next = event.detail?.approved === true;
  const changed = next !== approved;
  approved = next;
  if (!approved) clearSummary();
  else if (changed) void loadSummary();
});
refresh.addEventListener('click', () => { void loadSummary(); });
