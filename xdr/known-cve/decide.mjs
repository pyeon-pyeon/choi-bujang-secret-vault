const PATTERNS = Object.freeze([
  {
    "name": "요청 머리글의 JNDI 원격 조회 형태",
    "conditions": "User-Agent 등 요청 머리글에 JNDI 조회의 시작·종료 구문과 LDAP·RMI 등 원격 대상 표기가 함께 있는지 확인한다. 과제 경보의 문서용 조회 표기도 신호로 읽되 실행하거나 원격 대상에 접속하지 않는다. jndi라는 단어, 중괄호 하나, 잘린 구문만으로 명확한 공격을 확정하지 않는다.",
    "evidence": "Apache의 CVE-2021-44228 설명은 공격자가 통제하는 로그 메시지·인자의 JNDI 원격 조회 위험을 명시하며, 머리글에서 해당 형태를 찾는 것은 T1190 악용 시도의 학습용 탐지 조건이다.",
    "sourceUrls": [
      "https://logging.apache.org/security.html",
      "https://attack.mitre.org/techniques/T1190/"
    ]
  },
  {
    "name": "요청 인자의 JNDI 원격 조회 형태",
    "conditions": "요청 URL의 인자에 완전한 JNDI 원격 조회 형태가 있는지 확인한다. URL 인코딩 형태도 문자열로만 관찰한다. 같은 출발 주소의 반복 횟수와 머리글·인자 양쪽의 일치 여부는 보강 신호이며, CVE 번호 검색이나 라이브러리 설명만으로 공격을 확정하지 않는다.",
    "evidence": "Apache는 CVE-2021-44228에서 로그 메시지·인자의 공격자 통제 JNDI 대상 위험을 설명하고, MITRE T1190은 외부 공개 앱의 취약점 악용을 다룬다.",
    "sourceUrls": [
      "https://logging.apache.org/security.html",
      "https://attack.mitre.org/techniques/T1190/"
    ]
  },
  {
    "name": "취약점 점검 도구 흔적과 조회 구문의 결합",
    "conditions": "경보에 알려진 취약점 점검 도구의 식별 흔적이 있고 같은 요청에 CVE-2021-44228 원격 조회 형태가 함께 있는지 확인한다. 도구와 비슷한 이름 한 건만으로 차단하지 않고 애매한 보조 신호로 취급한다. 도구 흔적·반복만으로 악용 성공을 단정하지 않는다.",
    "evidence": "MITRE T1595.002는 취약점 점검을 정찰로 구분하므로 도구 흔적만으로 T1190을 확정하지 않으며, CVE-2021-44228 조회 구문과 결합될 때 악용 시도의 보강 신호로 사용한다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1190/",
      "https://attack.mitre.org/techniques/T1595/002/",
      "https://logging.apache.org/security.html"
    ]
  }
].map(pattern => Object.freeze(pattern)));

// 문자열 비교만 수행합니다. 외부 의존성·파일 접근·네트워크·실행은 없습니다.
function answer(confidence, names) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: names.join(' · ') };
}

function text(value) {
  return typeof value === 'string' ? value.slice(0, 16384) : '';
}

function decode(value) {
  let decoded = text(value);
  for (let pass = 0; pass < 2; pass++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
}

function remoteLookup(value) {
  // 완전한 조회 구문과 원격 프로토콜·대상 조합을 찾으며 문자열을 실행하지 않습니다.
  return /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop)\s*:\/\/[^\s{}]+\s*\}/i.test(value);
}

export function decide(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const description = text(alert?.rule?.description);
  const headerValues = [data.useragent, data.user_agent];
  if (data.headers && typeof data.headers === 'object' && !Array.isArray(data.headers)) {
    headerValues.push(...Object.values(data.headers).slice(0, 32));
  }
  const headers = headerValues.map(decode);
  const url = decode(data.url);
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const args = [query, decode(data.args), decode(data.query)];
  const headerMatch = headers.some(remoteLookup);
  const argumentMatch = args.some(remoteLookup);
  const names = [];
  if (headerMatch) names.push(PATTERNS[0].name);
  if (argumentMatch) names.push(PATTERNS[1].name);
  const toolHint = /점검\s*(?:도구|흔적)|취약점\s*점검|scanner|vulnerability\s*scan/i.test(description)
    || /(?:scanner|log4j[-_ ]?scan|log4shell[-_ ]?scan)/i.test(headers.join(' '));
  if (toolHint) names.push(PATTERNS[2].name);
  const educational = /수업\s*(?:노트|예제)|구문\s*(?:인용|설명)|교육용\s*예제/.test(description);
  if (headerMatch || argumentMatch) {
    if (educational) return answer(0.6, names);
    const count = Number(data.count);
    const reinforced = headerMatch && argumentMatch || toolHint
      || Number.isFinite(count) && count >= 2;
    return answer(reinforced ? 0.98 : 0.95, names);
  }
  // CVE 이름·조회 단어·잘린 표기·도구 이름만 있으면 알림으로 확인합니다.
  const weakHeader = headers.some(value => /jndi|\$\{|log4j|log4shell/i.test(value));
  const weakArgs = args.some(value => /jndi|lookup|CVE-2021-44228|log4j|log4shell/i.test(value));
  const weakDescription = /CVE-2021-44228|jndi|원격\s*조회|조회\s*(?:구문|형태)|취약점|점검\s*도구|라이브러리/i.test(description);
  if (weakHeader || weakArgs || weakDescription || toolHint) {
    if (!names.length) names.push(weakHeader ? PATTERNS[0].name : PATTERNS[1].name);
    return answer(0.6, names);
  }
  return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
}
