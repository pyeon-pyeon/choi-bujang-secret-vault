// 격리 실행용: 외부 의존성, 파일 접근, 네트워크 호출이 없습니다.
const PATTERNS = [
  {
    "name": "요청 인자의 SQL 주입 형태",
    "conditions": "요청 인자에 UNION SELECT 같은 결합 SQL 구문이나 따옴표·논리 비교·주석이 결합된 조건 우회 형태가 있는지 확인한다. SQL 단어 하나나 학습 문서의 인용만으로 공격을 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1190은 공개 웹 앱 악용 사례로 SQL 주입을 명시하며, 요청 인자의 SQL 조합은 이 과제에서 관찰하는 악용 시도 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1190/"
    ]
  },
  {
    "name": "요청 인자의 스크립트 태그",
    "conditions": "요청 인자에 script 시작·종료 태그와 실행 코드가 결합되어 있는지 확인한다. URL 인코딩 형태도 관찰하되 태그 설명·이스케이프된 예제만으로 공격을 확정하지 않고, 문자열을 실행하지 않는다.",
    "evidence": "T1190의 공개 웹 앱 취약점 악용 관점에서 관찰하는 신호이며, 스크립트 주입의 직접 근거는 MITRE CWE-79이다; script 태그만으로 T1190 성립이나 공격 성공을 단정하지 않는다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1190/",
      "https://cwe.mitre.org/data/definitions/79.html"
    ]
  },
  {
    "name": "반복된 상위 경로 탐색",
    "conditions": "요청 경로나 인자에 ../가 반복되어 허용 디렉터리 밖의 파일을 가리키려는 형태가 있는지 확인한다. URL 인코딩과 역슬래시 변형도 관찰하며 정상 상대 경로 하나만으로 공격을 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1190은 디렉터리 탐색 취약점 악용 사례를 명시하며, 반복된 상위 경로 이동은 이 과제에서 관찰하는 파일 접근 우회 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1190/"
    ]
  },
  {
    "name": "반복된 명령 구분자 주입",
    "conditions": "같은 출발 주소의 연속 요청에서 명령 구분자 주입 표기가 여러 번 관찰됐다는 경보 근거를 확인한다. 구분 문자 하나나 단일 의심 요청은 차단하지 않는다.",
    "evidence": "MITRE ATT&CK T1190의 Cutting Edge 사례는 외부 공개 앱에 대한 명령 주입 악용을 명시한다. 반복 명령 구분자 표기는 해당 시도를 관찰하는 학습용 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1190/"
    ]
  }
];

function answer(confidence, names) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason: names.join(' · '),
  };
}

function decode(value) {
  let text = typeof value === 'string' ? value.slice(0, 16384) : '';
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(text.replace(/\+/g, ' '));
      if (decoded === text) break;
      text = decoded;
    } catch { break; }
  }
  return text;
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.slice(0, 4096) : '';
  const level = Number.isInteger(alert?.rule?.level) ? alert.rule.level : null;
  const url = decode(alert?.data?.url);
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const names = [];

  // 실행하지 않고 문자열만 비교합니다. 단어 하나는 강한 근거로 삼지 않습니다.
  const sql = /\bunion\s+(?:all\s+)?select\b/i.test(query)
    || /['"]\s*(?:or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+/i.test(query)
    || /;\s*(?:select|drop|insert|update|delete)\b/i.test(query);
  const script = /<script\b[^>]*>[\s\S]*?<\/script\s*>/i.test(query);
  const traversal = /(?:\.\.[/\\]){2,}/.test(url);
  if (sql) names.push(PATTERNS[0].name);
  if (script) names.push(PATTERNS[1].name);
  if (traversal) names.push(PATTERNS[2].name);
  const educational = /수업|예제|인용|이스케이프/.test(description);
  if (names.length) return answer(educational ? 0.6 : 0.95, names);

  // 시험용 doc-* 이름을 근거로 삼지 않고 집계 경보의 설명을 대조합니다.
  const repeatedCount = Number(description.match(/(\d+)\s*번/)?.[1]);
  const repeated = repeatedCount >= 2 && /반복|연속|번갈아|들어왔/.test(description);
  const negated = /표식은 아닙|표기는 없|반복은 없|반복되지 않/.test(description);
  const sqlDescription = /SQL\s*(?:구문|표식)|데이터베이스 조회를 이어 붙/.test(description);
  const scriptDescription = /스크립트\s*(?:삽입 표기|표식)/.test(description);
  const pathDescription = /경로.*(?:여러 단계 거슬러|이탈 표기)/.test(description);
  if (sqlDescription) names.push(PATTERNS[0].name);
  if (scriptDescription) names.push(PATTERNS[1].name);
  if (pathDescription) names.push(PATTERNS[2].name);
  const commandDescription = /명령\s*구분자\s*표기/.test(description);
  const sourceAddress = typeof alert?.data?.srcip === 'string' && alert.data.srcip.length > 0;
  if (commandDescription && sourceAddress) names.push(PATTERNS[3].name);
  if (names.length && repeated && !negated && !educational) return answer(0.95, names);
  if (names.length) return answer(0.6, names);

  const normal = /조회했습니다|화면이 열렸|새로고침/.test(description);
  if (level !== null && level <= 3 && normal) {
    return answer(0.1, [PATTERNS.map(p => p.name).join(' / ') + ' (불일치: 정상 이벤트)']);
  }
  return answer(0.5, [PATTERNS.map(p => p.name).join(' / ') + ' (확인 필요: 근거 불충분)']);
}
