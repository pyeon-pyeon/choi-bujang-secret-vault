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

    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
