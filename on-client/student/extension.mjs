export function createStudentView() {
  return {

    renderIdentity({ me, devices, sessions }) {
  
      const root = document.createElement('section');

      const deviceStates = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };
      const sessionStates = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };

      const value = input =>
        typeof input === 'string' && input.trim()
          ? input
          : '확인 불가';

      const line = (parent, content) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        parent.append(paragraph);
      };

      const deviceLine = (parent, device) => {
        const state = Object.hasOwn(deviceStates, device?.status)
          ? deviceStates[device.status]
          : '확인 불가';

        line(parent,
          `기기: ${value(device?.label)}`
          + ` · ID: ${value(device?.id)}`
          + ` · 상태: ${state} (${value(device?.status)})`
        );
      };

      const sessionLine = (parent, session) => {
        const state = Object.hasOwn(sessionStates, session?.status)
          ? sessionStates[session.status]
          : '확인 불가';

        line(parent,
          `세션 ID: ${value(session?.id)} · 상태: ${state} (${value(session?.status)})`
        );
      };

      const section = (title, resource, renderData) => {
        const box = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = title;
        box.append(heading);
        root.append(box);

        // 모드 안내는 loading·error에서도 표시합니다.
        if (resource?.mode === 'demo') {
          line(box, '예제 자료');
        } else if (resource?.mode === 'disconnected') {
          line(box, '연결 없음');
        } else if (resource?.mode !== 'connected') {
          line(box, '확인 불가');
        }

        if (resource?.status === 'loading') {
          line(box, '불러오는 중');
          return;
        }

        if (resource?.status === 'error') {
          line(box,
            `연결 실패: ${value(resource.error?.message)}`
          );
          return;
        }

        if (resource?.status !== 'ok') {
          line(box, '확인 불가');
          return;
        }

        renderData(box, resource.data);
      };

      section('현재 사용자·기기·세션', me, (box, data) => {
        line(box,
          `사용자: ${value(data?.user?.label)}`
          + ` · ID: ${value(data?.user?.id)}`
        );
        deviceLine(box, data?.device);
        sessionLine(box, data?.session);
      });

      section('기기 목록', devices, (box, data) => {
        if (!Array.isArray(data)) {
          line(box, '확인 불가');
        } else if (data.length === 0) {
          line(box, '기기 목록이 비어 있습니다.');
        } else {
          for (const device of data) deviceLine(box, device);
        }
      });

      section('세션 목록', sessions, (box, data) => {
        if (!Array.isArray(data)) {
          line(box, '확인 불가');
        } else if (data.length === 0) {
          line(box, '세션 목록이 비어 있습니다.');
        } else {
          for (const session of data) sessionLine(box, session);
        }
      });

      return root;
    },
        
    renderDecision({ status, mode, data, error, appId }) {
      const root = document.createElement('section');

      const line = content => {
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        root.append(paragraph);
      };

      const value = input =>
        typeof input === 'string' && input.trim()
          ? input
          : '확인 불가';

      if (mode === 'demo') line('예제 자료');
      else if (mode === 'disconnected') line('연결 없음');
      else if (mode !== 'connected') line('확인 불가');

      if (status === 'idle') {
        line('앱을 골라 접속을 요청하세요');
        return root;
      }

      if (status === 'loading') {
        line(`업무 앱 ID: ${value(appId)}`);
        line('판정 확인 중');
        return root;
      }

      if (status === 'error') {
        line(`업무 앱 ID: ${value(appId)}`);
        line(`요청 실패: ${value(error?.message)}`);
        line(
          '요청 실패는 접근 거부 판정이 아닙니다。'
            .replace('。', ' ')
          + '접근 허용 여부를 확인할 수 없습니다.'
        );
        return root;
      }

      if (status !== 'ok') {
        line('판정 확인 불가 (unknown)');
        return root;
      }

      const labels = {
        allow: '접근 허용 (allow)',
        deny: '접근 거부 (deny)',
        challenge: '추가 확인 필요 (challenge)',
        unknown: '판정 확인 불가 (unknown)',
      };

      const decision = Object.hasOwn(labels, data?.decision)
        ? data.decision
        : 'unknown';

      line(`업무 앱 ID: ${value(data?.appId ?? appId)}`);
      line(labels[decision]);
      line(`판정 이유: ${value(data?.reason)}`);
      line(`판정 시각: ${value(data?.checkedAt)}`);

      if (decision === 'allow') {
        line(
          '정책상 접근 허용이며 '
          + '실제 업무 앱 접속 성공을 보장하지 않습니다.'
        );
      } else if (decision === 'challenge') {
        line(
          '추가 인증 또는 확인이 필요합니다. '
          + '이 앱이 확인 절차를 대신 수행하지 않습니다.'
        );
      } else if (decision === 'unknown') {
        line('접근 허용 여부를 확인할 수 없습니다.');
      }

      return root;
    },
        
    renderEvents({ status, mode, data, error }) {
      const root = document.createElement('section');
      const make = (tag, text) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const value = input =>
        typeof input === 'string' && input.trim()
          ? input : '확인 불가';
      const appName = id =>
        typeof id === 'string' && id.trim()
          ? id : '앱 확인 불가';

      const kindNames = {
        access: '접속 기록',
        xdr: 'XDR 경보',
      };
      const accessNames = {
        allowed: '접근 허용',
        denied: '접근 거부',
        unknown: '확인 불가',
      };
      const sessionNames = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };
      const deviceNames = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };
      const stateText = (names, code) =>
        Object.hasOwn(names, code)
          ? `${names[code]}(${code})`
          : '확인 불가(unknown)';
      const kindText = code =>
        Object.hasOwn(kindNames, code)
          ? `${kindNames[code]}(${code})`
          : `확인 불가(${value(code)})`;

      if (mode === 'demo') {
        root.append(make('p', '예제 자료'));
      } else if (mode === 'disconnected') {
        root.append(make('p', '연결 없음'));
      } else if (mode !== 'connected') {
        root.append(make('p', '확인 불가'));
      }

      if (status === 'loading') {
        root.append(make('p', '기록을 불러오는 중'));
        return root;
      }
      if (status === 'error') {
        const prefix = error?.code === 'CONTRACT_MISMATCH'
          ? '기록 확인 불가 (CONTRACT_MISMATCH): '
          : '기록을 불러오지 못했습니다: ';
        root.append(make('p', prefix + value(error?.message)));
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        root.append(make(
          'p', '기록 확인 불가: 응답 형식을 확인할 수 없습니다.'
        ));
        return root;
      }

      // 원본 배열은 변경하지 않습니다.
      const time = at =>
        Number.isFinite(Date.parse(at))
          ? Date.parse(at) : -Infinity;
      const events = [...data].sort((a, b) => {
        const left = time(a.at);
        const right = time(b.at);
        return left === right ? 0 : left > right ? -1 : 1;
      });

      if (events.length === 0) {
        root.append(make('p', '표시할 기록이 없습니다'));
        return root;
      }

      const filters = make('div');
      const buildFilter = (name, values, labelFor) => {
        const label = make('label');
        label.append(make('span', name));

        const select = make('select');
        select.setAttribute('aria-label', name);

        const all = make('option', '전체');
        all.value = 'all';
        select.append(all);

        const codes = new Set(values.filter(
          item => typeof item === 'string'
        ));
        for (const code of codes) {
          if (code === 'all') continue;
          const option = make('option', labelFor(code));
          option.value = code;
          select.append(option);
        }

        select.value = 'all';
        label.append(select);
        filters.append(label);
        return select;
      };

      const kindFilter = buildFilter(
        '기록 종류',
        events.map(event => event.kind),
        kindText
      );
      const appFilter = buildFilter(
        '업무 앱',
        events.map(event => event.appId),
        appName
      );
      const accessFilter = buildFilter(
        '접속 상태',
        events.map(event => event.state?.access),
        code => stateText(accessNames, code)
      );

      const count = make('p');
      const list = make('ul');
      const detail = make('div');
      root.append(filters, count, list, detail);

      const showDetail = event => {
        const box = make('section');
        box.setAttribute('data-student-event-detail', event.id);
        box.append(make('h3', `${event.id} 상세`));
        box.append(make(
          'p',
          `사건 ID: ${value(event.id)}`
          + ` · 업무 앱: ${appName(event.appId)}`
        ));

        for (const [title, entries] of [
          ['근거', event.evidence],
          ['규칙', event.rules],
        ]) {
          box.append(make('h4', title));
          if (!Array.isArray(entries)) {
            box.append(make('p', '확인 불가'));
          } else if (entries.length === 0) {
            box.append(make('p', `${title} 없음`));
          } else {
            for (const entry of entries) {
              box.append(make(
                'p',
                `ID: ${value(entry.id)} · ${value(entry.text)}`
              ));
            }
          }
        }

        box.append(make(
          'p',
          `접속 상태: ${stateText(accessNames, event.state?.access)}`
        ));
        box.append(make(
          'p',
          `세션 상태: ${stateText(sessionNames, event.state?.session)}`
        ));
        box.append(make(
          'p',
          `기기 상태: ${stateText(deviceNames, event.state?.device)}`
        ));
             
        if (
          Array.isArray(event.supportedActions)
          && event.supportedActions.length > 0
        ) {
          box.append(make(
            'p',
            '조치 실행 연결은 준비 중입니다. '
            + '아직 지원하지 않는 조치이며 요청을 전송하지 않습니다.'
          ));

          for (const action of event.supportedActions) {
            const button = make('button', `${action} 미지원`);
            button.type = 'button';
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
            box.append(button);
          }
        }
        detail.replaceChildren(box);
      };

      const redraw = () => {
        const filtered = events.filter(event =>
          (kindFilter.value === 'all'
            || event.kind === kindFilter.value)
          && (appFilter.value === 'all'
            || event.appId === appFilter.value)
          && (accessFilter.value === 'all'
            || event.state?.access === accessFilter.value)
        );

        list.replaceChildren();
        detail.replaceChildren();
        count.textContent =
          `표시 ${filtered.length}건`
          + ` / 전달받은 기록 ${events.length}건`;

        if (filtered.length === 0) {
          list.append(make('li', '표시할 기록이 없습니다'));
        }

        for (const event of filtered) {
          const row = make('li');
          row.setAttribute('data-student-event-id', event.id);
          row.append(make(
            'p',
            `사건 ID: ${value(event.id)}`
            + ` · 시각: ${value(event.at)}`
          ));
          row.append(make(
            'p',
            `종류: ${kindText(event.kind)}`
            + ` · 업무 앱: ${appName(event.appId)}`
          ));
          row.append(make('p', `요약: ${value(event.summary)}`));

          const button = make('button', `${event.id} 상세`);
          button.type = 'button';
          button.addEventListener('click', () => showDetail(event));
          row.append(button);
          list.append(row);
        }
      };

      for (const select of [
        kindFilter, appFilter, accessFilter,
      ]) {
        select.addEventListener('change', redraw);
      }
      redraw();
      return root;
    },

    renderStatus({ devices, sessions, notifications, diagnostics, mode }) {
      const root = document.createElement('section');
      const make = (tag, text) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
      };

      const safe = input => {
        if (typeof input !== 'string' || !input.trim()) {
          return '확인 불가';
        }
        const secret = /(?:password|passwd|token|secret|api[_-]?key|authorization|비밀번호|토큰|비밀키)\s*[=:：]|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sb_secret_|sk_live_|sk_test_|ghp_|github_pat_)[\w-]+|-----BEGIN .*PRIVATE KEY-----/i;
        return secret.test(input)
          ? '[비밀값 의심 내용 숨김]' : input;
      };

      const deviceStates = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };
      const sessionStates = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };
      const stateText = (names, code) =>
        Object.hasOwn(names, code)
          ? `${names[code]}(${code})`
          : '확인 불가(unknown)';

      const modeLine = (parent, currentMode) => {
        if (currentMode === 'demo') {
          parent.append(make('p', '예제 자료'));
        } else if (currentMode === 'disconnected') {
          parent.append(make('p', '연결 없음'));
        } else if (currentMode !== 'connected') {
          parent.append(make('p', '확인 불가'));
        }
      };

      const retry =
        '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. '
        + '자동으로 다시 요청하지 않습니다.';

      const resourceBox = (title, resource, showData) => {
        const box = make('section');
        box.append(make('h3', title));
        root.append(box);
        modeLine(box, resource?.mode ?? mode);

        if (resource?.status === 'loading') {
          box.append(make('p', `${title}: 불러오는 중`));
        } else if (resource?.status === 'error') {
          const timeout = /TIMEOUT|시간\s*초과|시간이\s*초과/i.test(
            String(resource.error?.code)
            + ' ' + String(resource.error?.message)
          );
          box.append(make(
            'p',
            `${title}를 불러오지 못했습니다`
            + `${timeout ? ' (시간 초과)' : ''}: `
            + safe(resource.error?.message)
          ));
          box.append(make('p', retry));
        } else if (resource?.status === 'ok') {
          showData(box, resource.data);
        } else {
          box.append(make(
            'p', `${title}: 아직 조회하지 않았거나 확인 불가`
          ));
        }
      };

      modeLine(root, mode);

      resourceBox('기기 목록', devices, (box, rows) => {
        if (!Array.isArray(rows)) {
          box.append(make('p', '기기 목록 확인 불가: 응답 형식 불일치'));
        } else if (rows.length === 0) {
          box.append(make('p', '등록된 기기가 없습니다'));
        } else {
          for (const device of rows) {
            box.append(make(
              'p',
              `기기: ${safe(device.label)}`
              + ` · 상태: ${stateText(deviceStates, device.status)}`
            ));
          }
        }
      });

      root.append(make(
        'p',
        '세션 조회 범위는 현재 검증된 연결 한 개입니다. '
        + '과거 세션 전체 목록이 아닙니다.'
      ));

      resourceBox('현재 세션', sessions, (box, rows) => {
        if (!Array.isArray(rows)) {
          box.append(make('p', '현재 세션 확인 불가: 응답 형식 불일치'));
        } else if (rows.length === 0) {
          box.append(make('p', '현재 연결이 없습니다'));
        } else {
          for (const session of rows) {
            box.append(make(
              'p',
              `세션 ID: ${safe(session.id)}`
              + ` · 상태: ${stateText(sessionStates, session.status)}`
            ));
          }
        }
      });

      const notices = make('section');
      notices.append(make('h3', '알림'));
      if (!Array.isArray(notifications)) {
        notices.append(make('p', '알림 확인 불가'));
      } else if (notifications.length === 0) {
        notices.append(make('p', '주의할 알림이 없습니다'));
      } else {
        for (const notice of notifications) {
          notices.append(make(
            'p',
            `자료(resource): ${safe(notice.resource)}`
            + ` · 코드(code): ${safe(notice.code)}`
            + ` · ${safe(notice.message)}`
          ));
        }
      }
      root.append(notices);

      let copyText = null;
      resourceBox('진단 정보', diagnostics, (box, data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          box.append(make('p', '진단 정보 확인 불가: 응답 형식 불일치'));
          return;
        }

        // 전체 응답 대신 지정된 여섯 값만 사용합니다.
        const projected = {
          requestId: safe(data.requestId),
          component: safe(data.component),
          version: safe(data.version),
          checkedAt: safe(data.checkedAt),
          engine: {
            mode: safe(data.engine?.mode),
            code: safe(data.engine?.code),
          },
        };

        for (const key of [
          'requestId', 'component', 'version', 'checkedAt',
        ]) {
          box.append(make('p', `${key}: ${projected[key]}`));
        }
        box.append(make('p', `engine.mode: ${projected.engine.mode}`));
        box.append(make('p', `engine.code: ${projected.engine.code}`));
        copyText = JSON.stringify(projected, null, 2);
      });

      root.append(make(
        'p',
        '제공 화면의 도움정보 불러오기로 조회한 진단 정보만 사용합니다. '
        + '복사한 정보는 도움 요청에 사용할 수 있습니다.'
      ));

      const copy = make('button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = copyText === null;

      const feedback = make(
        'p',
        copyText === null
          ? '복사할 진단 정보가 없습니다.'
          : '사용자가 도움정보 복사를 누를 때만 복사합니다.'
      );
      feedback.setAttribute('role', 'status');

      copy.addEventListener('click', async () => {
        if (copyText === null) return;
        try {
          if (!globalThis.navigator?.clipboard?.writeText) {
            throw new Error('COPY_UNAVAILABLE');
          }
          await globalThis.navigator.clipboard.writeText(copyText);
          feedback.textContent = '지정된 진단 정보 여섯 값을 복사했습니다.';
        } catch {
          feedback.textContent =
            '도움정보를 복사하지 못했습니다. '
            + '브라우저의 클립보드 권한을 확인하고 직접 다시 눌러 주세요.';
        }
      });

      root.append(copy, feedback);
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
        renderAiConnection({
      status, mode, data, error, checkedAt, explanationAccepted,
    }) {
      const root = document.createElement('section');
      const line = text => {
        const node = document.createElement('p');
        node.textContent = text;
        root.append(node);
      };
      const safe = input => {
        if (typeof input !== 'string' || !input.trim()) {
          return '확인 불가';
        }
        const secret = /(?:password|token|secret|api[_-]?key|authorization|비밀번호|토큰)\s*[=:：]|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sb_secret_|sk_live_|sk_test_|ghp_|github_pat_)[\w-]+|-----BEGIN .*PRIVATE KEY-----|[\r\n]\s*at\s+/i;
        return secret.test(input)
          ? '민감하거나 원문 오류인 내용은 표시하지 않습니다.'
          : input;
      };

      if (mode === 'demo') {
        line('예제 자료(demo) · 실제 연결 확인이 아닙니다.');
      } else if (mode === 'disconnected') {
        line('연결 없음(disconnected)');
      } else if (mode !== 'connected') {
        line('확인 불가(unknown)');
      }

      line(
        '다시 점검은 사용자가 제공 화면의 점검 버튼을 직접 누르세요. '
        + '자동으로 다시 요청하지 않습니다.'
      );

      if (status === 'idle') {
        line('AI 연결 점검 전');
        return root;
      }
      if (status === 'loading') {
        line('AI 연결 점검 중');
        return root;
      }

      if (status === 'error') {
        const groups = [
          [
            [
              'ON_AI_PROVISIONING_PENDING',
              'ON_AI_TRANSPORT_PENDING',
              'ON_AI_AUTHORIZATION_CHANGED',
              'AI_REQUEST_UNVERIFIED',
              'SUBJECT_SCOPE_UNVERIFIED',
              'CONTRACT_MISMATCH',
            ],
            '권한 준비 중 또는 확인 불가: 담당자에게 계정 연결과 앱 권한을 확인해 달라고 요청하세요.',
          ],
          [
            ['WB_CLCO_AUTH_REQUIRED', 'WB_CLCO_INVALID_TOKEN'],
            '인증 실패: 계정 연결을 다시 확인하고 담당자에게 문의하세요. 인증값을 복사하지 마세요.',
          ],
          [
            ['WB_CLCO_ACCESS_BLOCKED'],
            '접근 제한: 담당자에게 앱 이용 권한을 확인해 달라고 요청하세요.',
          ],
          [
            ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_LIMIT_REACHED'],
            '사용량·이용 한도: 담당자에게 반 사용량과 이용 한도를 확인하세요.',
          ],
          [
            ['WB_CLCO_SESSION_CLOSED'],
            '이용 시간 아님: 담당자에게 이용 시간을 확인하세요.',
          ],
          [
            ['WB_CLCO_RATE_LIMITED'],
            '요청 제한: 잠시 뒤 직접 다시 점검하세요.',
          ],
          [
            ['WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'],
            '시간 초과: 잠시 뒤 직접 다시 점검하세요.',
          ],
          [
            ['WB_CLCO_NETWORK_ERROR', 'WB_CLCO_SERVER_UNAVAILABLE'],
            '네트워크 또는 서버 연결 실패: 잠시 뒤 직접 다시 점검하세요.',
          ],
          [
            ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'],
            '취소됨: 이전 응답은 현재 점검 결과가 아닙니다.',
          ],
          [
            ['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'],
            '모델 없음: 담당자에게 사용할 모델과 모델 허용 설정을 확인하세요.',
          ],
          [
            ['ON_AI_INVALID_INPUT', 'ON_AI_INVALID_OUTPUT'],
            '응답 확인 불가: 담당자에게 입력·응답 형식을 확인해 달라고 요청하세요.',
          ],
        ];

        const group = groups.find(
          ([codes]) => codes.includes(error?.code)
        );
        const code = group ? error.code : 'AI_REQUEST_UNVERIFIED';

        line(`AI 연결 점검 실패: ${code}`);
        line(
          `안내: ${
            group
              ? safe(error?.message)
              : '오류 내용을 안전하게 확인할 수 없습니다.'
          }`
        );
        line(
          group
            ? group[1]
            : '담당자에게 계정 연결과 앱 권한을 확인해 달라고 요청하세요.'
        );
        return root;
      }

      if (
        status !== 'ok'
        || data?.transportChecked !== true
        || !['test', 'verified'].includes(data?.audienceAuthorization)
        || !Number.isInteger(data?.modelCount)
        || data.modelCount < 0
      ) {
        line('AI 연결 점검 결과 확인 불가(unknown)');
        return root;
      }

      line(
        data.audienceAuthorization === 'test'
          ? '시험 연결 점검(test)'
          : '앱 권한 확인 후 점검(verified)'
      );
      line(`응답 모델 수(modelCount): ${data.modelCount}`);
      line(`점검 시각(checkedAt): ${safe(checkedAt)}`);
      line(
        '이번에는 연결만 점검했습니다. '
        + '사건 설명은 아직 실행하지 않았습니다.'
      );

      if (data.audienceAuthorization === 'test') {
        line(
          '시험 연결이며 실제 앱 권한 발급·운영 연결 성공을 뜻하지 않습니다.'
        );
      } else {
        line(
          'verified는 표시된 점검 시각 기준의 앱 권한 확인과 모델 응답입니다.'
        );
      }

      if (data.modelCount === 0) {
        line(
          '사용 가능한 모델이 없습니다. '
          + '담당자에게 모델 허용 설정을 확인하세요.'
        );
      }

      return root;
    },

        renderExplanation({ event, explanation, checkedAt }) {
      // 매번 새 DOM을 만들어 이전 설명·성공 표식을 재사용하지 않습니다.
      const root = document.createElement('section');

      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.append(node);
      };

      const safe = input => {
        if (typeof input !== 'string' || !input.trim()) {
          return '확인 불가';
        }
        const secret = /(?:password|token|secret|api[_-]?key|authorization|비밀번호|토큰)\s*[=:：]|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sb_secret_|sk_live_|sk_test_|ghp_|github_pat_)[\w-]+|-----BEGIN .*PRIVATE KEY-----|[\r\n]\s*at\s+/i;
        return secret.test(input)
          ? '민감하거나 원문 오류인 내용은 표시하지 않습니다.'
          : input;
      };

      const fail = reason => {
        add('p', `AI 설명을 사용할 수 없습니다: ${reason}`);
        add(
          'p',
          '기록은 그대로입니다. 설명 실패는 과제 실패 판정이 아닙니다.'
        );
        return root;
      };

      if (explanation?.mode === 'demo') {
        add('p', '예제 자료(demo) · 실제 사건 설명 성공이 아닙니다.');
      } else if (explanation?.mode === 'disconnected') {
        add('p', '연결 없음(disconnected)');
      } else if (explanation?.mode !== 'connected') {
        add('p', '확인 불가(unknown)');
      }

      // event가 없어도 제공된 오류를 먼저 표시합니다.
      if (explanation?.status === 'error') {
        const rawCode = explanation.error?.code;
        const code =
          typeof rawCode === 'string'
          && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode)
            ? rawCode
            : 'AI_REQUEST_UNVERIFIED';

        add(
          'p',
          `AI 설명 실패: ${code} — ${safe(explanation.error?.message)}`
        );
        add(
          'p',
          '기록은 그대로입니다. 설명 실패는 과제 실패 판정이 아닙니다.'
        );
        return root;
      }

      if (!event) {
        add('p', '보안 기록에서 기록을 먼저 고르세요');
        return root;
      }

      if (explanation?.status === 'loading') {
        add('p', `사건 ID: ${safe(event.id)} · AI 설명 요청 중`);
        return root;
      }

      if (!explanation || explanation.status === 'idle') {
        add('p', '선택한 기록의 AI 설명 요청 전입니다.');
        return root;
      }

      if (explanation.status !== 'ok') {
        return fail('설명 상태 확인 불가(unknown)');
      }

      const result = explanation.data;

      if (result?.executed === true) {
        return fail(
          'AI가 이미 실행했다고 답한 설명은 사용할 수 없습니다.'
        );
      }

      if (
        !result
        || typeof event.id !== 'string'
        || !event.id.trim()
        || typeof result.summary !== 'string'
        || !result.summary.trim()
        || result.requiresHumanConfirmation !== true
        || result.executed !== false
      ) {
        return fail(
          '설명 형식 또는 사람 확인·미실행 상태를 확인할 수 없습니다.'
        );
      }

      if (
        !Array.isArray(event.evidence)
        || event.evidence.length === 0
        || !Array.isArray(event.rules)
        || event.rules.length === 0
      ) {
        return fail('설명에 필요한 근거 또는 규칙이 부족합니다.');
      }

      if (
        event.evidence.some(item =>
          typeof item?.id !== 'string'
          || !item.id.trim()
          || typeof item.text !== 'string'
          || !item.text.trim()
        )
        || event.rules.some(item =>
          typeof item?.id !== 'string'
          || !item.id.trim()
          || typeof item.text !== 'string'
          || !item.text.trim()
        )
      ) {
        return fail('근거 또는 규칙의 ID·내용을 확인할 수 없습니다.');
      }

      const evidence = new Map(
        event.evidence.map(item => [item.id, item.text])
      );

      const matches = ids =>
        Array.isArray(ids)
        && ids.length > 0
        && new Set(ids).size === ids.length
        && ids.every(id => evidence.has(id));

      if (
        evidence.size !== event.evidence.length
        || !matches(result.evidenceIds)
        || result.evidenceIds.length !== evidence.size
      ) {
        return fail(
          '근거가 맞지 않음: 선택한 기록의 근거 ID와 '
          + '설명의 인용이 일치하지 않습니다.'
        );
      }

      if (
        !Array.isArray(event.supportedActions)
        || !Array.isArray(result.proposals)
      ) {
        return fail('지원 조치 또는 제안 목록을 확인할 수 없습니다.');
      }

      if (result.proposals.some(proposal =>
        typeof proposal?.action !== 'string'
        || !event.supportedActions.includes(proposal.action)
        || typeof proposal.reason !== 'string'
        || !proposal.reason.trim()
        || !matches(proposal.evidenceIds)
      )) {
        return fail(
          '제안의 지원 조치·근거·이유가 현재 기록과 맞지 않습니다.'
        );
      }

      // 검사를 마친 성공한 설명에만 표식을 붙입니다.
      root.setAttribute('data-student-explanation-event', event.id);

      add('h3', 'AI 설명(참고용)');
      add('p', `사건 ID: ${safe(event.id)}`);
      add('p', safe(result.summary));
      add('p', `확인 시각: ${safe(checkedAt)}`);
      add(
        'p',
        'AI 설명은 해석입니다. '
        + '사실 판단은 근거 글과 연동 시스템이 알려 준 상태로 합니다.'
      );

      add('h4', '인용 근거');
      for (const id of result.evidenceIds) {
        add('p', `${safe(id)} — ${safe(evidence.get(id))}`);
      }

      add('h4', '적용 규칙');
      for (const rule of event.rules) {
        add('p', `${safe(rule.id)} — ${safe(rule.text)}`);
      }

      const states = [
        [
          '접속', event.state?.access,
          {
            allowed: '접근 허용',
            denied: '접근 거부',
            unknown: '확인 불가',
          },
        ],
        [
          '세션', event.state?.session,
          {
            active: '활성',
            expired: '만료',
            revoked: '철회됨',
            unknown: '확인 불가',
          },
        ],
        [
          '기기', event.state?.device,
          {
            compliant: '보안 기준 충족',
            noncompliant: '보안 기준 미충족',
            unknown: '확인 불가',
          },
        ],
      ];

      add('h4', '현재 상태');
      const unknown = [];

      for (const [label, raw, names] of states) {
        const code = Object.hasOwn(names, raw) ? raw : 'unknown';
        add('p', `${label}: ${names[code]}(${code})`);
        if (code === 'unknown') unknown.push(label);
      }

      add('h4', '확인 불가 상태');
      if (unknown.length === 0) {
        add('p', '없음');
      } else {
        for (const label of unknown) {
          add('p', `${label}: 확인 불가(unknown)`);
        }
      }

      add('h4', 'AI 제안');
      if (result.proposals.length === 0) {
        add(
          'p',
          event.supportedActions.length === 0
            ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상)'
            : 'AI가 제안한 조치가 없습니다.'
        );
      } else {
        for (const proposal of result.proposals) {
          add(
            'p',
            `조치: ${safe(proposal.action)}`
            + ` · 이유: ${safe(proposal.reason)}`
          );
          add(
            'p',
            `제안 근거 ID: ${proposal.evidenceIds.map(safe).join(', ')}`
          );
          add('p', '사람 확인이 필요하며 실행되지 않았습니다.');
        }
      }

      add('p', '이 설명·제안은 보안 조치를 실행하지 않습니다.');
      return root;
    },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
