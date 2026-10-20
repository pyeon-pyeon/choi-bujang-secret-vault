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

    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
