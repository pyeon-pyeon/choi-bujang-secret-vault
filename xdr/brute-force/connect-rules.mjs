import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { extractAlerts } from './read-alerts.mjs';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);
const rulesUrl = new URL('./deny-candidates.json', import.meta.url);
const logUrl = new URL('../alerts.log', import.meta.url);
const ttlMs = 15 * 60 * 1000; // 학습용 후보 유효 기간. 재실행으로 연장하지 않습니다.

export async function collectCandidates(fixture, now = Date.now()) {
  const rows = extractAlerts(fixture);
  const candidates = [];
  const notifications = [];
  for (const [index, alert] of fixture.alerts.entries()) {
    const verdict = await decide(alert);
    const alertId = typeof alert?.id === 'string' && /^bf-\d+$/.test(alert.id) ? alert.id : null;
    if (!alertId) throw new Error('근거 경보 번호 형식이 아닙니다.');
    const row = rows[index];
    const observedAt = Date.parse(row.timestamp);
    const expiresAt = Number.isFinite(observedAt) ? observedAt + ttlMs : null;
    if (verdict.action === 'block') {
      candidates.push({
        ruleId: `xdr_brute_force_${alertId.replace('-', '_')}`,
        evidenceAlertId: alertId,
        observedAt: row.timestamp,
        expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
        sourceAddress: row.srcip,
        account: row.account,
        confidence: verdict.confidence,
        reason: verdict.reason,
        status: expiresAt === null || expiresAt <= now ? 'expired' : 'pending_verified_binding',
        enforced: false,
      });
    }
    if (verdict.action !== 'record') {
      notifications.push({ at: new Date(now).toISOString(), evidenceAlertId: alertId,
        action: verdict.action, confidence: verdict.confidence, reason: verdict.reason,
        enforced: false });
    }
  }
  return { candidates, notifications };
}

export async function connectRules() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const { candidates, notifications } = await collectCandidates(fixture);
  await writeFile(rulesUrl, `${JSON.stringify({ schema: 'aleph.xdr.deny-candidates.v1',
    candidates }, null, 2)}\n`, 'utf8');
  if (notifications.length) {
    await appendFile(logUrl, notifications.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  }
  return { candidates: candidates.length, notifications: notifications.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await connectRules()));
    console.log('후보만 저장했습니다. 검증된 ZTNA 주체 연결이 없어 실제 거부 규칙은 적용하지 않았습니다.');
  } catch {
    console.error('차단 후보 연결 처리 실패: 경보 형식과 파일 접근을 확인하세요.');
    process.exitCode = 1;
  }
}
