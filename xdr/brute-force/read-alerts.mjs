import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);

// 지정 필드에도 자격 증명이 섞이면 해당 필드 전체를 가립니다.
function safeText(value) {
  if (typeof value !== 'string') return null;
  const suspicious = /(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|비밀번호|토큰|비밀키)\s*[=:：]|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:sb_secret_|sb_publishable_|sk_live_|sk_test_|ghp_|github_pat_)[A-Za-z0-9_-]+|-----BEGIN .*PRIVATE KEY-----|[A-Za-z0-9_+/=-]{40,}/i;
  return suspicious.test(value) ? '[REDACTED]' : value;
}

export function extractAlerts(fixture) {
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new Error('경보 묶음 형식이 아닙니다.');
  }
  return fixture.alerts.map((alert) => ({
    timestamp: safeText(alert?.timestamp),
    srcip: safeText(alert?.data?.srcip),
    account: safeText(alert?.data?.srcuser),
    level: Number.isInteger(alert?.rule?.level) ? alert.rule.level : null,
    description: safeText(alert?.rule?.description),
  }));
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  return extractAlerts(fixture);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const rows = await readAlerts();
    for (const row of rows) console.log(JSON.stringify(row));
    console.error(`경보 ${rows.length}건 / 추출 ${rows.length}줄`);
  } catch {
    // 파싱 오류에 포함될 수 있는 원본 값은 출력하지 않습니다.
    console.error('경보를 읽지 못했습니다. 파일과 경보 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
