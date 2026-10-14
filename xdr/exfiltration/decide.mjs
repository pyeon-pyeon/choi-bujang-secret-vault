const PATTERNS = Object.freeze([
  {
    "name": "낯선 목적지로 대용량·반복 전송",
    "conditions": "처음 보는 외부 목적지로 평소 기준을 넘는 대용량·다량 파일·자료 묶음 전송이 있거나 같은 목적지로 대용량 전송이 반복되는지 확인한다. 기존 명령 통로 사용 근거가 있으면 T1041, 명령 통로와 다른 프로토콜 사용 근거가 있으면 T1048을 대조한다. 목적지 주소나 단일 전송량만으로 유출·통로 종류를 확정하지 않는다.",
    "evidence": "MITRE T1041은 기존 C2 통로로 자료를 유출하는 기법이고 T1048은 다른 프로토콜로 유출하는 기법이며, 낯선 목적지·대량·반복은 이 과제의 보강 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1041/",
      "https://attack.mitre.org/techniques/T1048/"
    ]
  },
  {
    "name": "업무 시간 밖 압축 자료 반출",
    "conditions": "압축 자료의 실제 외부 전송이 업무·수업 시간 밖 활동이나 처음 보는 목적지·여러 목적지·연속 업로드와 결합되는지 확인한다. 압축 생성·열기만 한 사건, 승인된 백업, 전송 실패를 구분한다. 시간 기준이 없으면 임의로 업무 외 시각을 만들지 않고 압축 하나만으로 유출을 확정하지 않는다.",
    "evidence": "MITRE T1560은 수집 자료의 압축을 설명하며 T1041·T1048은 반출 통로를 설명하므로 압축과 실제 외부 전송의 결합을 관찰하되 시각은 보강 신호로만 사용한다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1560/",
      "https://attack.mitre.org/techniques/T1041/",
      "https://attack.mitre.org/techniques/T1048/"
    ]
  },
  {
    "name": "명령 통로·낯선 프로토콜의 연속 자료 전송",
    "conditions": "경보가 명령 통로의 큰 파일 반복 전송 또는 평소 쓰지 않던 프로토콜·포트의 연속 자료 전송을 명시하는지 확인한다. 짧은 자료 이름만 보이는 통신과 일반 요청을 구분하며, 포트 차이 하나만으로 다른 프로토콜 사용이나 유출 성공을 단정하지 않는다.",
    "evidence": "MITRE T1041은 C2와 같은 프로토콜의 유출을, T1048은 C2와 다른 프로토콜의 유출을 구분하므로 통로 근거와 실제 자료 전송을 함께 대조한다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1041/",
      "https://attack.mitre.org/techniques/T1048/"
    ]
  }
].map(pattern => Object.freeze(pattern)));

// 학습용 기준이며 실제 조직의 평소 전송량이나 업무 시간 기준을 추정하지 않습니다.
const LARGE_BYTES = 50000000;
const MANY_FILES = 50;
function answer(confidence, names) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: [...new Set(names)].join(' · ') };
}
function text(value) { return typeof value === 'string' ? value.slice(0, 16384) : ''; }
function number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
export function decide(alert) {
  const description = text(alert?.rule?.description);
  const bytes = number(alert?.data?.bytes);
  const files = number(alert?.data?.files);
  const count = number(alert?.data?.count);
  const unfamiliar = /처음\s*보는\s*(?:목적지|주소)|목적지는\s*처음|평소와\s*다른\s*주소/.test(description);
  const outside = /(?:업무|수업)\s*시간\s*밖/.test(description);
  const compressed = /압축\s*파일|archive|\.zip\b|\.7z\b/i.test(description);
  const transfer = /나갔|올라갔|복사됐|전송/.test(description);
  const failed = /실패|전송은\s*(?:아직\s*)?없|전송되지/.test(description);
  const repeated = /반복|연속/.test(description) || count !== null && count >= 3;
  const large = bytes !== null && bytes >= LARGE_BYTES;
  const bulk = files !== null && files >= MANY_FILES;
  const channel = /명령\s*통로/.test(description);
  const alternate = /(?:쓰지\s*않던|낯선|다른)\s*(?:포트|프로토콜)/.test(description);
  const whole = /자료실\s*전체/.test(description) && /외부\s*주소/.test(description);
  const strong = [];
  if (transfer && !failed && (large || bulk)) {
    if (unfamiliar || repeated || whole) strong.push(PATTERNS[0].name);
    if (compressed && (outside || unfamiliar || repeated)) strong.push(PATTERNS[1].name);
    if (channel && repeated || alternate && repeated) strong.push(PATTERNS[2].name);
    if (outside && repeated) strong.push(PATTERNS[0].name);
  }
  if (strong.length) return answer(strong.length > 1 ? 0.98 : 0.95, strong);
  // 정상 활동은 복합 공격 근거가 없는 경우에만 기록으로 분류합니다.
  const normal = /내\s*메모.*(?:읽었|저장했)|공지를\s*읽었|화면\s*새로고침|로그아웃/.test(description)
    || /검색\s*결과\s*한\s*페이지|첨부\s*그림\s*한\s*장/.test(description)
    || /수업\s*자료\s*주소로\s*작은\s*동기화/.test(description)
    || /세션\s*확인.*전송은\s*없/.test(description);
  if (normal && !unfamiliar && !outside && !large && !bulk) {
    return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
  }
  const weak = [];
  if (compressed) weak.push(PATTERNS[1].name);
  if (channel || alternate) weak.push(PATTERNS[2].name);
  if (transfer || unfamiliar || /전송량|파일\s*수|자료\s*\d+건|백업/.test(description) || large || bulk) weak.push(PATTERNS[0].name);
  if (weak.length) return answer(0.6, weak);
  return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
}
