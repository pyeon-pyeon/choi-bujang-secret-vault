const status = document.querySelector('#operations-status');
const content = document.querySelector('#operations-data');
const refresh = document.querySelector('#operations-refresh');
let approved = false;
let revision = 0;
function clearSummary() {
  revision++; content.hidden = true; content.replaceChildren(); refresh.hidden = true;
  status.textContent = '로그인과 서버 기기 승인 뒤 요약을 확인합니다.';
}
function section(title, text) {
  const box = document.createElement('section');
  const heading = document.createElement('h3'); heading.textContent = title;
  const paragraph = document.createElement('p'); paragraph.textContent = text;
  box.append(heading, paragraph); return box;
}
async function loadSummary() {
  if (!approved) { clearSummary(); return; }
  const version = ++revision;
  status.textContent = '서버 요약을 확인하고 있습니다.';
  try {
    const response = await fetch('/api/operations', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('summary_unavailable');
    const data = await response.json();
    if (!approved || version !== revision) return;
    if (data.schema !== 'vault.operations-summary.v1'
        || !Array.isArray(data.rules?.records) || !Array.isArray(data.detection?.records)) throw new Error('invalid_summary');
    const counts = { block: 0, alert: 0, record: 0 };
    for (const row of data.detection.records) {
      if (!Object.hasOwn(counts, row.action)) throw new Error('invalid_record');
      counts[row.action]++;
    }
    if (data.rules.count !== data.rules.records.length || data.detection.count !== data.detection.records.length
        || Object.keys(counts).some(key => data.detection.counts?.[key] !== counts[key])) throw new Error('count_mismatch');
    const rules = section('판정기 규칙 · 서버 설정 확인', `${data.rules.count}개: ${data.rules.records.map(r => r.ruleId).join(', ')}. 실제 판정 실행 건수가 아닙니다.`);
    const detection = section('탐지 사건 · 로컬 가상 기록', `${data.detection.count}건 — block ${counts.block}, alert ${counts.alert}, record ${counts.record}. 실제 접속 탐지 기록은 미확인입니다.`);
    const unavailable = data.detection.sources.filter(source => source.status !== 'fixture_records_verified');
    if (unavailable.length) detection.append(section('누락 또는 검증 실패', unavailable.map(source => source.moduleKey).join(', ') + ' — 결과에 포함하지 않았습니다.'));
    const revocation = section('실제 회수 상태', data.revocation.reason + ' 완료 건수는 확인되지 않아 표시하지 않습니다.');
    const recovery = section('실제 복구 버전', data.recovery.reason + ' 복구 성공이나 안전 버전을 추정하지 않습니다.');
    const records = section('가린 서버 기록', '아래 가상 기록으로 수치를 계산했습니다. 원문·가명 사용자·메모·키·토큰은 표시하지 않습니다.');
    const list = document.createElement('ul');
    for (const row of data.detection.records) {
      const item = document.createElement('li'); item.textContent = `${row.moduleKey} / ${row.alertId} / ${row.action} / 가상 기록`; list.append(item);
    }
    records.append(list);
    content.replaceChildren(rules, detection, revocation, recovery, records);
    content.hidden = false; refresh.hidden = false;
    status.textContent = '서버 확인 시각: ' + data.checkedAt + ' · 운영 실측과 가상 기록을 구분합니다.';
  } catch {
    if (version !== revision) return;
    content.hidden = true; content.replaceChildren();
    status.textContent = '요약을 검증하지 못했습니다. 이전 수치를 표시하지 않습니다.';
  }
}
window.addEventListener('vault-access-state', event => {
  const next = event.detail?.approved === true;
  const changed = next !== approved;
  approved = next;
  if (!approved) clearSummary();
  else if (changed) void loadSummary();
});
refresh.addEventListener('click', () => { void loadSummary(); });
