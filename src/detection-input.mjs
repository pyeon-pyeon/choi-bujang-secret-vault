// 엔진이 검증한 가상 사건 전용입니다. 클라이언트 입력을 인증하는 함수가 아닙니다.
// 제공 계약에는 기기·판정 필드가 없으므로 임의로 추가하지 않습니다.
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(event => {
    const at = event?.at;
    const method = event?.method;
    const sub = event?.identity?.sub;
    if (typeof at !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at)
        || !Number.isFinite(Date.parse(at))
        || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)
        || typeof sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sub)
        || /^(?:sb_secret_|sb_publishable_|ghp_|github_pat_|sk_|eyJ)/.test(sub)) {
      // 오류에도 원문이나 식별자를 포함하지 않습니다.
      throw new TypeError('invalid_detection_event');
    }
    return { at, method, identity: { sub } };
  });
}
