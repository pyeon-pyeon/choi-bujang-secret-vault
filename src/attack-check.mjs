import { execFileSync } from 'node:child_process';

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 2) {
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000 }).trim();
    const checks = [];
    for (const [path, attackId, expected] of [
      ['/data.json', 'static_note_read', '공개 JSON의 notes가 빈 배열이어야 함'],
      ['/api/notes', 'public_api_read', 'DB 연결 완료 시 공개 함수에서 가상 메모 4건 읽기 가능; 인증 보호 미구현'],
      ['/aleph.json', 'deployment_identity', '배포 단계 2와 저장소·현재 커밋이 일치해야 함'],
    ]) {
      let observed;
      try {
        const result = await fetch(new URL(path, app), {
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) observed = `HTTP ${result.status}; 정상 동작 미확인`;
        else {
          try {
            const data = await result.json();
            observed = path === '/aleph.json'
              ? `HTTP ${result.status}; 단계 ${Number.isInteger(data.step) ? data.step : '알 수 없음'}; 저장소 일치 ${data.repoUrl === config.repoUrl}; 현재 커밋 일치 ${data.commit === currentCommit}`
              : `HTTP ${result.status}; 메모 건수 ${Array.isArray(data.notes) ? data.notes.length : '형식 불일치'}`;
          } catch { observed = `HTTP ${result.status}; JSON 파싱 실패`; }
        }
      } catch { observed = '요청 실패; 배포 상태 미확인'; }
      checks.push({ attackId, expected, observed });
    }
    return checks;
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
