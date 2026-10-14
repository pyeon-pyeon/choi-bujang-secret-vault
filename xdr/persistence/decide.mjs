const PATTERNS = Object.freeze([
  {
    "name": "서명 없는 새 서비스 등록·실행 파일 변경",
    "conditions": "새 서비스 등록 또는 기존 서비스의 실행 파일 변경과 서명 없음이 함께 관찰되는지 확인한다. 임시 폴더 실행 파일, 평소 목록 밖의 서비스, 반복 등록과 재시작 뒤 유지 여부를 보강 신호로 본다. 서명 미확인은 서명 없음으로 단정하지 않으며 설명 변경이나 같은 파일의 재시작만으로 공격을 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1543은 서비스 등 시스템 프로세스 생성·변경을 통한 지속 실행을 설명하며, 서명 없음·낯선 실행 파일은 이 과제의 보강 신호이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1543/"
    ]
  },
  {
    "name": "낯선 예약 작업을 통한 반복 실행",
    "conditions": "평소 목록 밖의 예약 작업이나 임의 작업 이름이 임시 폴더의 프로그램 실행·평소와 다른 시각 등과 결합되는지 확인한다. 시작 항목과 같은 파일을 가리키면 보강 신호로 본다. 정상 업데이트·기존 자료 복사 작업은 구분하고 작업 생성 한 건이나 시각 하나만으로 악성으로 확정하지 않는다.",
    "evidence": "MITRE ATT&CK T1053은 예약 작업을 악용해 프로그램을 실행하거나 지속성을 유지하는 기법을 설명한다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1053/"
    ]
  },
  {
    "name": "시작 폴더의 낯선 프로그램 추가",
    "conditions": "시작 폴더·시작 프로그램 목록에 평소 목록 밖의 프로그램이 추가되거나 낯선 실행 파일로 변경되는지 확인한다. 예약 작업과 같은 임시 파일을 가리키는 경우 보강 신호로 본다. 목록 읽기만 한 사건과 정상 도구를 구분하고 변경 한 건에 대한 실행·파일 정보가 없으면 확인 필요로 남긴다.",
    "evidence": "MITRE ATT&CK T1547.001은 시작 폴더에 프로그램을 추가해 로그인 시 자동 실행하는 지속성 기법을 설명하며, 이는 T1543·T1053과 구별되는 시작 폴더 신호의 직접 근거이다.",
    "sourceUrls": [
      "https://attack.mitre.org/techniques/T1547/001/"
    ]
  }
].map(pattern => Object.freeze(pattern)));

// 경보 문자열만 비교하며 외부 파일·패키지·네트워크·프로그램을 사용하지 않습니다.
function answer(confidence, names) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence, reason: [...new Set(names)].join(' · ') };
}
function text(value) { return typeof value === 'string' ? value.slice(0, 16384) : ''; }

export function decide(alert) {
  const description = text(alert?.rule?.description);
  const path = text(alert?.data?.path).replace(/\\/g, '/');
  const service = /서비스|systemd|service/i.test(description);
  const task = /예약\s*작업|scheduled\s*task|cron/i.test(description);
  const startup = /시작\s*(?:폴더|프로그램|항목)|startup/i.test(description)
    || /\/startup(?:\/|$)/i.test(path);
  const temporary = /임시\s*(?:폴더|파일)/.test(description)
    || /(?:^|\/)(?:temp|tmp)(?:\/|$)/i.test(path);
  // 확인되지 않은 서명과 명시적으로 없는 서명을 구분합니다.
  const unsigned = /서명\s*(?:없는|없음)|서명이\s*없|unsigned/i.test(description);
  const serviceChanged = /새\s*서비스|서비스\s*등록|등록됐|등록되|실행\s*파일이\s*(?:바뀌|변경)/.test(description);
  const repeated = /연속|반복/.test(description)
    && (Number(alert?.data?.count) >= 2 || /[2-9]\d*\s*(?:건|번)/.test(description));
  const unfamiliar = /처음\s*보는|평소\s*목록에\s*없는|낯선|임의\s*문자열/.test(description);
  const persisted = /다시\s*켜도\s*남|재시작.*유지/.test(description);
  const added = /추가|등록|변경/.test(description);
  const outsideHours = /수업\s*시간\s*밖|평소.*다른\s*시각/.test(description);
  const linked = task && startup && temporary && /같은|함께/.test(description);
  const strong = [];
  if (service && (unsigned && serviceChanged && (temporary || repeated)
      || unfamiliar && persisted && serviceChanged)) strong.push(PATTERNS[0].name);
  if (task && temporary && (unfamiliar || outsideHours || linked)) strong.push(PATTERNS[1].name);
  if (startup && (unfamiliar && added || linked)) strong.push(PATTERNS[2].name);
  if (strong.length) return answer(linked || repeated ? 0.98 : 0.95, strong);

  // 정상 동작이라는 명시적 근거를 확인하며, 낮은 규칙 수준만으로 정상 처리하지 않습니다.
  const normal = /로그인했습니다|로그아웃했습니다|자료실\s*화면이\s*열렸/.test(description)
    || /읽기만/.test(description)
    || /업데이트.*평소.*(?:그대로|끝났)/.test(description)
    || service && /기존/.test(description) && /서명된/.test(description)
    || task && /기존/.test(description) && /자료\s*복사.*마쳤/.test(description);
  if (normal) return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
  const weak = [];
  if (service || temporary) weak.push(PATTERNS[0].name);
  if (task) weak.push(PATTERNS[1].name);
  if (startup) weak.push(PATTERNS[2].name);
  if (weak.length) return answer(0.6, weak);
  return answer(0.1, [PATTERNS.map(pattern => pattern.name).join(' / ') + ' (불일치)']);
}
