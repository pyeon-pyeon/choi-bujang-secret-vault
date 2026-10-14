const PATTERNS = Object.freeze([
  {
    "name": "갑작스러운 관리자 그룹 추가",
    "conditions": "평범한 계정의 관리자 그룹 추가·재추가가 원격 또는 처음 보는 주소, 여러 계정의 연속 추가, 곧바로 실행한 관리자 명령 등과 결합되는지 확인한다. 관리자 아닌 과제 그룹 추가·그룹 목록 조회와 승인된 관리 변경은 구분한다. 취약점 악용 근거가 없으면 T1068 악용으로 단정하지 않는다.",
    "evidence": "MITRE T1098.007은 계정의 로컬·도메인 그룹 추가로 권한을 높이는 조작을 직접 설명하며, T1078은 정상 계정의 권한 악용을 설명한다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1098/007/",
      "https://attack.mitre.org/techniques/T1078/"
    ]
  },
  {
    "name": "권한 상승 직후의 낯선 관리자 명령",
    "conditions": "새 관리자 권한·세션 권한 상승 직후 처음 보는 관리자 명령 또는 다른 계정 권한으로 실행한 명령이 나타나는지 확인한다. 취약점 악용과 낮은 권한에서 높은 권한으로의 전환 근거가 있으면 T1068 관점도 대조한다. 단일 명령·실패·취소·조회만으로 공격을 확정하지 않는다.",
    "evidence": "MITRE T1068은 소프트웨어 취약점 악용에 의한 권한 상승을, T1078은 정상 계정 권한의 악용을 설명하므로 낯선 명령은 권한 전환·도용 근거와 함께 보는 학습용 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1068/",
      "https://attack.mitre.org/techniques/T1078/"
    ]
  },
  {
    "name": "업무 시간 밖의 복합 권한 사용",
    "conditions": "업무·수업 시간 밖의 관리자 권한 사용이 처음 보는 주소, 관리자 그룹 변경, 다른 계정 권한 사용 또는 관리자 명령 실행과 함께 나타나는지 확인한다. 시각만으로 차단하지 않고 평소 예약 작업과 승인된 관리 계정의 활동은 구분한다. 시간대·기준 정보가 없으면 임의로 채우지 않는다.",
    "evidence": "MITRE T1078은 탈취한 정상 계정으로 접근·권한을 악용하는 기법을 설명하며, 업무 외 시각과 낯선 접속·권한 변경의 결합은 이 과제에서 대조하는 보강 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1078/"
    ]
  }
].map(pattern => Object.freeze(pattern)));

// 외부 의존성 없이 경보의 문자열·수치 근거만 비교합니다.
function answer(confidence, names) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: [...new Set(names)].join(' · ') };
}
function text(value) { return typeof value === 'string' ? value.slice(0, 16384) : ''; }

export function decide(alert) {
  const description = text(alert?.rule?.description);
  const group = text(alert?.data?.group);
  const adminGroup = /^(?:administrators|domain admins|enterprise admins|sudo|wheel)$/i.test(group)
    || /관리자\s*그룹/.test(description) && !/관리자\s*그룹은\s*아/.test(description);
  const addition = adminGroup && /추가|들어가|들어왔|재등록/.test(description);
  const command = (/(?:관리자|권한)\s*명령/.test(description)
    || adminGroup && /명령\s*실행/.test(description))
    && /실행/.test(description) && !/실패|취소|명령은\s*없/.test(description);
  const elevated = /방금\s*관리자가\s*된|관리자\s*권한으로\s*바뀌|권한\s*상승/.test(description)
    && !/취소/.test(description);
  const remote = /원격\s*주소/.test(description);
  const unfamiliar = /처음\s*보는\s*주소|주소는\s*처음|낯선\s*주소/.test(description);
  const outside = /(?:업무|수업)\s*시간\s*밖|업무처럼\s*보이지\s*않는\s*시각/.test(description);
  const otherIdentity = /다른\s*계정의\s*권한/.test(description);
  const multiple = Number(alert?.data?.count) >= 2 && /계정\s*\d+개/.test(description);
  const readded = addition && /빠진\s*계정/.test(description) && /다시/.test(description);
  const strong = [];
  if (addition && (remote || unfamiliar || command || multiple || readded)) strong.push(PATTERNS[0].name);
  if (command && (elevated || addition || otherIdentity)
      || elevated && unfamiliar) strong.push(PATTERNS[1].name);
  if (outside && (command && unfamiliar || addition && command)) strong.push(PATTERNS[2].name);
  if (strong.length) return answer(strong.length > 1 ? 0.98 : 0.95, strong);

  const normal = /로그인했습니다|로그아웃했습니다|비밀번호를\s*변경했습니다|자료실을\s*열었습니다/.test(description)
    || /그룹\s*소속을\s*읽기만/.test(description)
    || /자기\s*세션\s*정보를\s*조회/.test(description)
    || /평소\s*예약\s*작업을\s*확인/.test(description);
  if (normal) return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
  const weak = [];
  if (/그룹/.test(description) || group) weak.push(PATTERNS[0].name);
  if (/관리자|권한|계정\s*종류/.test(description)) weak.push(PATTERNS[1].name);
  if (outside) weak.push(PATTERNS[2].name);
  if (weak.length) return answer(0.6, weak);
  return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
}
