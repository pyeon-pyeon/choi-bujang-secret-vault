// 제공 사건 계약으로 폭주 조회의 회수만 제안하며 실제 회수는 수행하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
import { readDetectionEvents } from './detection-input.mjs';

export function detect(events) {
  const groups = new Map();
  for (const event of readDetectionEvents(events)) {
    if (event.method !== 'GET') continue;
    const sub = event.identity.sub;
    const key = sub;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  for (const reads of groups.values()) {
    reads.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let start = 0;
    for (let end = 0; end < reads.length; end++) {
      while (Date.parse(reads[end].at) - Date.parse(reads[start].at) > 600000) {
        start++;
      }
      if (end - start + 1 > 120) {
        return { action: 'propose_revocation', reasonCode: 'burst_read',
          subject: reads[end].identity.sub };
      }
    }
  }
  return { action: 'observe' };
}
