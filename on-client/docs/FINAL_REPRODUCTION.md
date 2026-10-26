# 최종 제출 원문 재현 확인 기록

## 직접 확인한 커밋과 환경

- 저장소: https://github.com/pyeon-pyeon/choi-bujang-secret-vault
- 원본 브랜치: main. 재현 폴더에서는 detached HEAD 사용.
- 직접 실행한 커밋: d11bbd1aa47fb34d3fb08f19f1d94a407b253a03
- 확인 시각: 2026-10-26T11:18:53.7989240+09:00
- Node.js: v24.20.0. package.json engines 명세는 24.19.0으로 별도 구분.
- 앱: alekov-client-starter 0.2.11
- 동일 재현 폴더에서 앞서 확인한 npm: 11.19.0, PowerShell: 5.1.26100.9711. 이번 명령 묶음에서는 이 두 버전은 재조회하지 않음.
- Windows PC의 별도 clone 폴더에서 실행. 기존 작업 폴더·개인 설정을 보존.

이 문서는 학생의 PowerShell 출력과 직접 화면 확인 진술을 기록합니다. AI나 과제 서버가 학생 PC에서 실행한 증거가 아닙니다.

## 실제 수행 절차와 관찰

별도 clone 폴더에서 origin/main을 받아 git log와 git rev-parse HEAD로 위 40자리 커밋을 확인한 뒤 git switch --detach origin/main으로 전환했습니다. 잘못된 해시 전환에 실패했던 이전 실행은 이번 결과에 포함하지 않습니다.

```powershell
git diff 0cdab87c48c51be7188f6eccad4f120ad4707a49 HEAD -- on-client/student on-client/public on-client/src on-client/tools on-client/package.json
cd .\on-client
Get-Date -Format o
node --version
npm run check
npm start
```

| 원문·실행 항목 | 실제 결과 | 증거 |
|---|---|---|
| 커밋 선택 | d11bbd1aa47fb34d3fb08f19f1d94a407b253a03 | git log·rev-parse 출력 |
| 이전 제출본과 실행 파일 차이 | 위 git diff 출력 없음 | 학생 PowerShell 출력 |
| 문법 검사 | 오류 없이 종료 | node --check student/extension.mjs 출력 |
| 실행 진입점 | npm start → node src/server.mjs | npm 출력과 package.json 일치 |
| 시작 출력 | 케셰브 연결 확인: http://127.0.0.1:5189 | 서버 출력 |
| 브라우저 확인 | 앱 화면 열림 | 학생 직접 확인 진술 |
| 종료·재실행 | Ctrl+C 후 npm start, 화면 다시 열림 | 학생 직접 확인 진술. 재실행 정확한 시각 미기록 |
| 설정 | 개인 연결 설정 옵션 없는 기본 실행 | npm start 명령과 scripts 일치 |
| 의존성 | on-client 외부 npm 의존성 없음. npm install 미실행 | package.json 원문과 절차 일치 |

명세 기준 24.19.0의 실행은 이번에 확인하지 않았습니다. 관찰한 24.20.0의 기본 실행을 Node.js 22~24 전체 지원으로 확대하지 않습니다.

## 최종 문서 변경과 실행 원문의 관계

이 기록을 커밋하면 Git 커밋 식별자는 바뀝니다. 문서가 자기 자신의 최종 커밋 해시를 포함하는 것은 요구하지 않습니다. 직접 실행한 기준 해시는 위에 고정하고, 이 기록을 추가한 제출 커밋과 실행 파일·설정·의존성의 동일성을 다음 명령으로 대조합니다.

```powershell
git diff --name-status d11bbd1aa47fb34d3fb08f19f1d94a407b253a03 HEAD
git diff --exit-code d11bbd1aa47fb34d3fb08f19f1d94a407b253a03 HEAD -- on-client/student on-client/public on-client/src on-client/tools on-client/vendor on-client/package.json on-client/package-lock.json
```

첫 명령에는 학생 문서 변경만 있어야 하고 두 번째는 출력 없이 종료 코드 0이어야 합니다. 이것은 실행 원문 동일성 검사이며 새 커밋을 실행했다는 진술과 구분합니다. 최종 커밋 생성 후 재현 폴더에서도 그 커밋으로 전환해 문법 검사·시작·종료·재시작을 직접 확인합니다. 이 확인 전에는 최종 커밋을 실행했다고 주장하지 않습니다. 실행 코드 차이가 있으면 이 기록을 해당 코드의 실행 증거로 사용하지 않고 다시 검증합니다.

## 미확인 범위와 이전 기록

실제 SDP 연결·AI 승인 및 모델 호출·보안 조치 집행·실제 OSV 조회 성공은 미확인입니다. 최초 상세 demo 점검은 a2cf149 커밋의 과거 기록이며 이번 커밋에서 모든 기능을 재점검한 것으로 합치지 않습니다. 기본 화면 열림은 연결 성공을 뜻하지 않습니다.

STUDENT_RELEASE.md의 이전 커밋 재현 기록은 이력입니다. 최신 실행 근거는 이 문서의 d11bbd1 기록입니다. 데이터 보존·백업·복원 계획과 실제 미실행 범위는 STUDENT_RELEASE.md를 유지합니다. 기존 DB·감사 기록·개인 자격은 이번 문서 변경으로 수정하지 않습니다.
