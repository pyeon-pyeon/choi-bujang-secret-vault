import { execFileSync } from 'node:child_process';

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 10) {
    const attempts = [];
    try {
      execFileSync(process.execPath, ['--test', 'test/note-restore.test.mjs'], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000,
      });
      attempts.push({ attackId: 'note_restore_fixture',
        expected: '가상 B 한 건 ID·소유자·해시 일치, 다른 자료·감사 이력 보존 및 변조 사본 거부',
        observed: 'B API·RPC 모의 시험 통과; 실제 SQL·B 복구·배포 및 복구 후 1~9단계 시험 미실행' });
    } catch {
      attempts.push({ attackId: 'note_restore_fixture', expected: 'B 가상 한 건 복원 시험 통과',
        observed: '로컬 모의 시험 실패; 실제 복원 미실행' });
    }
    const { comparePolicies } = await import('../scripts/policy-diff.mjs');
    let rejected = false;
    try { await comparePolicies({ currentDir: '.', backupDir: null, trustedManifestSha256: null }); }
    catch { rejected = true; }
    attempts.push({ attackId: 'missing_safe_policy', expected: '검증된 안전 사본·신뢰 지문 없으면 중단',
      observed: rejected ? '실제 로컬 호출 중단 확인; 운영 정책 변경 없음' : '중단 실패; 운영 정책 복원 미실행' });
    return attempts;
  }
  if (config.step === 9) {
    const { detect } = await import('./detect.mjs');
    const reads = (count, subject = 'learner_fixture', interval = 2000) =>
      Array.from({ length: count }, (_, i) => ({
        at: new Date(Date.UTC(2026, 9, 1) + i * interval).toISOString(),
        method: 'GET', identity: { sub: subject },
      }));
    const checks = [
      ['normal_detection_fixture', reads(30), 'observe'],
      ['threshold_detection_fixture', reads(120), 'observe'],
      ['burst_detection_fixture', reads(121), 'propose_revocation'],
      ['separate_subjects_fixture', [...reads(100), ...reads(100, 'other_fixture')], 'observe'],
      ['outside_window_fixture', reads(200, 'learner_fixture', 7000), 'observe'],
    ];
    return checks.map(([attackId, events, expected]) => {
      const result = detect(events);
      return { attackId, expected: `제공 로컬 사건 계약: ${expected}`,
        observed: `가상 탐지 ${result.action}; 이유 ${result.reasonCode ?? '없음'}; 계약상 대상 포함 ${typeof result.subject === 'string'}; 실제 회수·시간 미실측` };
    });
  }
  if (config.step === 8) {
    const { decide } = await import('./decider.mjs');
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { normal } = fixtureRequests();
    const checks = [
      ['own_api_route', { path: '/api/notes/demo', route: 'GET /api/notes/:id' }, 'allow'],
      ['own_api_update_route', { method: 'PUT', path: '/api/notes/demo', route: 'PUT /api/notes/:id' }, 'allow'],
      ['function_route', { path: '/api/notes/export', route: 'GET /api/notes/:id' }, 'deny'],
      ['other_zone_list', { path: '/api/notes', route: 'GET /api/notes' }, 'deny'],
      ['student_notice_write', { service: 'notices', method: 'PUT', path: '/api/notices/demo', route: 'PUT /api/notices/:id' }, 'deny'],
    ];
    const attempts = [];
    for (const [attackId, patch, expected] of checks) {
      const result = await decide({ ...normal, ...patch });
      attempts.push({ attackId, expected: `가상 경로 판정 ${expected}; 소유자 실측과 별도`,
        observed: `로컬 가상 판정 ${result.decision}·${result.reasonCode}; 실제 A/B API 및 심판 검증 미실행` });
    }
    return attempts;
  }
  if (config.step === 7) {
    const { decide } = await import('./decider.mjs');
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { normal, suspicious } = fixtureRequests();
    const attempts = [];
    for (const [attackId, request, expected] of [
      ['normal_access_fixture', normal, '로컬 가상 정상 읽기: allow'],
      ['compound_risk_fixture', suspicious, '로컬 가상 복합 이상: step_up·step_up_required'],
      ['verified_step_up_fixture', { ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } },
        '엔진 재확인 완료를 가정한 로컬 가상 요청: allow'],
      ['unregistered_device_fixture', { ...normal, deviceRegistered: false },
        '로컬 가상 미등록 기기: deny·device_not_registered'],
    ]) {
      const response = await decide(request);
      attempts.push({ attackId, expected,
        observed: `로컬 가상 요청: ${response.decision}·${response.reasonCode}; 실제 재로그인·자료 차단 미실행` });
    }
    return attempts;
  }
  if (config.step === 6) {
    const { decide } = await import('./decider.mjs');
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { normal } = fixtureRequests();
    const attempts = [];
    for (const [attackId, registered, expected] of [
      ['registered_device_fixture', true, '로컬 가상 등록 기기 읽기: allow'],
      ['unregistered_device_fixture', false, '로컬 가상 미등록 기기: deny·device_not_registered'],
      ['missing_device_registration_fixture', undefined, '로컬 가상 등록값 누락: deny·device_not_registered'],
    ]) {
      const request = { ...normal, deviceRegistered: registered };
      if (registered === undefined) delete request.deviceRegistered;
      const response = await decide(request);
      attempts.push({ attackId, expected,
        observed: `로컬 가상 요청: ${response.decision}·${response.reasonCode}; 실제 심판 공격 미실행` });
    }
    return attempts;
  }
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if ([3, 4, 5].includes(config.step)) {
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000 }).trim();
    return Promise.all([
      ['/api/notes', 'anonymous_note_read', '토큰 없는 자료 조회는 401이며 메모가 없어야 함', {}],
      ['/api/notes', 'invalid_token_read', '잘못된 토큰 조회는 401이며 메모가 없어야 함', { Authorization: 'Bearer invalid-test-token' }],
      ['/aleph.json', 'deployment_identity', `배포 단계 ${config.step}과 현재 커밋이 일치해야 함`, {}],
    ].map(async ([path, attackId, expected, headers]) => {
      let observed;
      try {
        const response = await fetch(new URL(path, app), { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
        let data;
        try { data = await response.json(); } catch { data = null; }
        observed = path === '/aleph.json'
          ? `HTTP ${response.status}; 단계 ${Number.isInteger(data?.step) ? data.step : '미확인'}; 저장소 일치 ${data?.repoUrl === config.repoUrl}; 현재 커밋 일치 ${data?.commit === currentCommit}`
          : `HTTP ${response.status}; JSON ${data !== null}; 메모 포함 ${Array.isArray(data) || Array.isArray(data?.notes)}; 인증 거부 ${response.status === 401 && data !== null && !Array.isArray(data) && !Array.isArray(data?.notes)}`;
      } catch { observed = '요청 실패; 미확인'; }
      return { attackId, expected, observed };
    }));
  }
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
