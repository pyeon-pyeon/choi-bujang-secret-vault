// 인터넷·패키지·파일 접근 없이 실행하는 학습용 판정기입니다.
const patterns = Object.freeze([
  Object.freeze({
    name: '같은 출발 주소의 단시간 로그인 실패 연속',
    conditions: '같은 주소의 짧은 시간 반복 실패 또는 명시된 대량 반복 대입 근거를 확인한다.',
    evidence: 'MITRE ATT&CK T1110: 비밀번호를 반복적으로 추측하는 무차별 대입.',
  }),
  Object.freeze({
    name: '여러 계정에 같은 비밀번호 대입',
    conditions: '다계정과 동일 비밀번호 대입이 설명에 함께 명시되어야 한다.',
    evidence: 'MITRE ATT&CK T1110.003: 하나 또는 소수의 비밀번호를 여러 계정에 대입하는 Password Spraying.',
  }),
]);

function result(confidence, reason) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}

export function decide(alert) {
  const row = {
    description: typeof alert?.rule?.description === 'string' ? alert.rule.description : '',
    srcip: typeof alert?.data?.srcip === 'string' ? alert.data.srcip : null,
    level: Number.isInteger(alert?.rule?.level) ? alert.rule.level : null,
  };
  const description = row.description ?? '';
  const failed = /실패/.test(description);
  const multipleAccounts = /여러\s*계정|서로 다른\s*계정|계정\s*\d+개|\d+개(?:의)?\s*계정/.test(description);
  const samePassword = /(?:같은|동일(?:한)?)\s*비밀번호/.test(description);
  const attempt = /대입|시도|넣었|실패/.test(description);
  const spraying = multipleAccounts && samePassword && attempt;
  const pattern = patterns[spraying ? 1 : 0];

  // 학습용 임계값이며 MITRE가 지정한 수치 기준은 아닙니다.
  // 규칙 수준만으로 차단하지 않고, 설명의 반복 대입 근거를 요구합니다.
  const count = Number(description.match(/실패(?:가|는|\s*횟수(?:는)?)?\s*(\d+)\s*건/)?.[1]);
  const highVolume = Number.isFinite(count) && count >= 20;
  const sameSource = /(?:같은|동일(?:한)?|한)\s*(?:출발\s*)?(?:주소|IP)/i.test(description);
  const shortWindow = /[123]\s*분\s*(?:안|이내|동안)/.test(description);
  const repetitive = /연속|이어졌|한 글자씩|같은 간격/.test(description);
  const manyAccounts = /계정\s*(\d+)개/.exec(description);
  const repeatedAcrossAccounts = multipleAccounts && repetitive
    && manyAccounts && Number(manyAccounts[1]) >= 20;
  const explicitGuessing = /비밀번호.*(?:한 글자씩|바꿔.*(?:넣|시도))/.test(description);
  const clearFailure = failed && (
    (highVolume && (shortWindow || (sameSource && repetitive) || explicitGuessing || row.level >= 10))
    || (sameSource && repeatedAcrossAccounts)
  );
  if (row.srcip && row.srcip !== '[REDACTED]' && (spraying || clearFailure)) {
    return result(0.95, pattern.name);
  }

  const normal = /성공|로그아웃|세션 유지|화면이 열렸|로그인 상태가 유지/.test(description);
  const onlyOneFailure = /실패\s*1건\s*뒤에 성공/.test(description);
  if (row.level !== null && row.level <= 3 && normal && (!failed || onlyOneFailure)) {
    return result(0.1, `${patterns[0].name} (불일치: 정상 이벤트)`);
  }

  // 격리 환경에서는 외부 응답을 기다리지 않고 애매한 경보를 알림으로 남깁니다.
  return result(0.5, `${pattern.name} (확인 필요: 근거 불충분)`);
}
