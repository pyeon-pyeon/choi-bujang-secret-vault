import { readFile } from 'node:fs/promises';
import { extractAlerts } from './read-alerts.mjs';

const { patterns } = JSON.parse(await readFile(new URL('./patterns.json', import.meta.url), 'utf8'));

function result(confidence, reason) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}

async function askJev(row, pattern) {
  // 연결 정보는 아직 없습니다. 공식 호출 규약을 확인한 뒤 어댑터를 연결합니다.
  // Adapter contract: askConfidence({ alert, pattern }) -> { confidence: number }.
  // 읽기 모듈에서 선택하고 비밀값을 가린 다섯 항목만 전달합니다.
  let timer;
  try {
    const response = await Promise.race([
      import('./jev-client.mjs').then((client) => client.askConfidence({ alert: row, pattern })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000); }),
    ]);
    const confidence = response?.confidence;
    return typeof confidence === 'number' && Number.isFinite(confidence)
      && confidence >= 0 && confidence <= 1 ? confidence : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function decide(alert) {
  const [row] = extractAlerts({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'brute-force', alerts: [alert] });
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

  const confidence = await askJev(row, pattern);
  return result(confidence ?? 0.5, confidence === null
    ? `${pattern.name} (확인 필요: Jev 응답 없음)` : pattern.name);
}
