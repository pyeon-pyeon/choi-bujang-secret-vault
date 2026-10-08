# BYTE BACK 방어전 시작 틀 R5

## 보너스 xdr-01 저장점

판단 조건 보완: 다계정·동일 비밀번호 표현의 순서와 변형, '실패가 N건' 표현을 처리합니다. 뚜렷한 패턴은 규칙 수준 10 미만에서도 차단하며 규칙 수준만으로는 차단하지 않습니다. 재실행 결과는 block 10·alert 9·record 9, 정상 이벤트 차단 0건으로 동일합니다. 표현 변형과 불충분한 근거에 대한 추가 사례 6개를 로컬에서 확인했습니다. 심판의 차단 건수 부족 오류가 해결됐는지는 아직 확인하지 않았습니다.

`xdr/brute-force/read-alerts.mjs`는 원본 가상 경보에서 시각·출발 주소·계정·규칙 수준·설명만 추출하고 비밀값 의심 문자열을 가립니다. `patterns.json`은 MITRE ATT&CK T1110과 T1110.003에 근거한 두 패턴을 담습니다. `decide.mjs`는 패턴과 규칙 수준을 함께 비교하고 확신도 0.85 이상 block, 0.5 이상 alert, 그 아래 record로 분류합니다. 수치 기준은 학습용이며 MITRE의 공식 임계값이 아닙니다.

재실행: `npm run xdr:run -- brute-force`. 결과는 `xdr/brute-force/result.json`에서 확인합니다. 가상 경보 28건의 로컬 결과는 block 10·alert 9·record 9이며, 정상 이벤트 9건의 block은 0건입니다. 명확한 공격은 block, 애매한 경우는 alert, 정상 이벤트는 record여야 합니다. 실제 Jev 호출 규약과 연결 모듈은 없으며 애매한 9건은 응답 없음으로 confidence 0.5 처리했습니다. Jev 응답 수신이나 운영 심판 통과를 주장하지 않습니다.

`node xdr/brute-force/connect-rules.mjs`는 차단 후보만 `deny-candidates.json`에 저장하고 공격·애매한 알림을 `xdr/alerts.log`에 JSON 한 줄씩 추가합니다. 후보에는 근거 경보 번호와 경보 시각 기준 15분 만료가 있으며 재실행으로 연장하지 않습니다. 현재 과거 시험 경보의 후보는 모두 만료입니다. 검증된 ZTNA subjectId 연결 정보가 없어 실제 거부 규칙을 적용하지 않았습니다. 기존 `src/decider.mjs`는 starter.deny 상태로 보존했으며 정상 ZTNA 요청 통과나 실제 차단은 미확인입니다.

본 작업은 5단계 메모 API·서버 전용 설정·기존 판정기와 원본 경보를 변경하지 않습니다. aleph.config.json의 단계·배포 주소·발급자·메모 허용 경로·원본 API 주소는 기존 메모 구현과 대조했으며 보너스 과제를 이유로 변경하지 않았습니다. 새 배포는 실행하지 않았습니다.

## 현재 작업: 5단계 보완 (새 배포·실제 로그인 미확인)

브라우저에서 Supabase 공개 키와 SDK를 제거했습니다. /api/auth 서버 함수가 공식 SDK로 로그인·사용자 확인·세션 갱신·로그아웃을 수행하고, 토큰은 Secure·HttpOnly·SameSite=Strict 쿠키로만 전달합니다. 브라우저 JSON에는 토큰이나 키가 없습니다. 변경 요청의 쿠키 인증은 고정된 앱 Origin을 확인합니다. 자료 API는 기존 검증 도우미·소유자 검사를 그대로 유지하며 심판 Bearer 요청도 지원합니다.

서버 함수의 공개 키는 SUPABASE_PUBLISHABLE_KEY 환경변수를 우선 읽고 기존 제공된 공개 키를 서버 코드에서만 기본값으로 사용합니다. SUPABASE_SECRET_KEY는 자료 API의 기존 서버 전용 설정을 유지합니다. 배포 /aleph.json에는 allowedRoutes와 originalApiUrl이 포함되고 첫 화면 nosniff 설정도 유지합니다. 배포 후 기존 브라우저 SDK 세션과 별개로 새 화면에서 다시 로그인해야 합니다. 비밀번호·JWT를 직접 생성하거나 로그에 기록하지 않습니다.

## 5단계 저장점 기록

브라우저의 메모 CRUD는 Vercel /api/notes와 /api/notes/:id만 호출합니다. Supabase SDK의 Auth 로그인·로그아웃은 유지하며 자료 테이블 직접 호출은 없습니다. 서버의 토큰 검증·본인 소유자 검사·서버 전용 환경변수는 변경하지 않았습니다.

supabase/step5-revoke-direct-access.sql은 learning_notes의 PUBLIC·anon·authenticated 테이블/열 권한만 회수하고 적용 전후 명시·실제 권한을 조회합니다. 기존 service_role 권한, RLS 정책, DB 행, 다른 테이블은 보존합니다. 사용자가 실행한 after 결과에서 anon·authenticated의 열 SELECT·INSERT·UPDATE·REFERENCES가 false임을 확인했습니다. 테이블 DELETE 및 service_role CRUD 결과와 실제 A CRUD는 아직 미확인입니다.

originalApiUrl은 쿼리 없는 https://bggmpuwdrkrqqglduvlp.supabase.co/rest/v1/learning_notes 입니다. 단계는 5이며 발급자·허용 메서드/경로는 기존 구현을 유지합니다. 원본 직접 요청은 심판의 anon 키로 확인합니다. anon 키를 제공받지 않아 그 직접 점검은 미실행이며 publishable key나 authenticated 토큰으로 대체하지 않았습니다.

다시 실행: npm run build -- --local. 실제 배포 후 A로 로그인해 본인 조회·추가·수정·삭제를 확인해야 합니다. 비로그인/잘못된 토큰은 401, 상대 단건은 404로 거부돼야 하며 원본 Data API는 anon 역할로 자료 접근을 허용하지 않아야 합니다. 첫 화면 nosniff 보안 헤더 설정도 유지합니다. 과거 공개 커밋·배포가 남아 있는 한 과거 노출 해소를 주장하지 않습니다.

## 4단계 기록

### 4단계 저장점 기록

자료 API는 기존 토큰 검증을 유지하고 검증된 ID와 owner_id를 대조합니다. 목록은 본인 행, 단건 GET·PUT·DELETE는 id와 owner_id를 함께 조건으로 사용합니다. 추가는 서버 ID로 소유자를 저장하고 수정은 title/body만 허용하며 기존·새 소유자를 본인으로 제한합니다. 상대 또는 없는 행은 자료 없이 404, 잘못된 수정 필드는 400, 인증 실패는 401입니다.

allowedRoutes에는 GET /api/notes, POST /api/notes, GET /api/notes/:id, PUT /api/notes/:id, DELETE /api/notes/:id를 기록했습니다. 정상 A/B 본인 CRUD와 상대 접근·소유자 변경 거부는 모의 DB로 검증했습니다. 실제 계정 A/B 시험은 미실행입니다.

supabase/step4-notes-rls.sql은 검토 후 SQL Editor에서 직접 실행합니다. 기존 PUBLIC·anon·authenticated 테이블 권한 회수, authenticated CRUD만 부여, 본인 행 RLS 네 정책, 적용 전후 명시·실제 권한 조회를 포함합니다. 이 테이블의 기존 정책을 교체하지만 행이나 다른 테이블은 건드리지 않습니다. DB 적용과 권한 결과는 미확인입니다. 서버 Secret key는 RLS를 우회하므로 API 소유자 검사도 유지합니다.

직접 Data API는 anon 키로만 확인하고 authenticated 역할 직접 접근은 점수 근거에 넣지 않습니다. 현재 anon 키 직접 점검은 미실행입니다. 로그인 없이 자료 조회 거부와 배포 식별만 실제 자기 점검에 기록하며 A/B 소유자 차단을 검증한 것처럼 보고하지 않습니다.

다시 실행: npm run build -- --local. 배포 후 화면에서 로그인해 본인 추가·수정·삭제를 확인하고, 상대 단건 접근은 404로 거부돼야 합니다. 과거 공개 커밋·배포가 남아 있는 한 과거 노출이 해소됐다고 판단하지 않습니다.

## 3단계 기록

기존 검증 도우미로 토큰을 확인하고, 누락·실패 시 자료 없이 401을 반환합니다. 추가 시 검증된 ID를 owner_id로 저장하며 목록은 로그인 사용자의 자료 배열을 반환합니다. 기존 owner_id가 NULL인 학습 자료는 보존하지만 본인 목록에는 표시하지 않습니다.

| 메서드 | 경로 | 결과 |
|---|---|---|
| GET | /api/notes | 본인 메모 배열 |
| POST | /api/notes | {id,title,body} 입력, id 생략 시 서버 UUID 생성, {id} 반환 |
| GET | /api/notes/:id | {id,title,body}; 없음/삭제 후 404 |
| PUT | /api/notes/:id | 제목·body 수정 |
| DELETE | /api/notes/:id | 삭제 |

allowedRoutes는 실제 경로 두 개를 기록하며 각 경로의 메서드는 위 표와 API에서 제한합니다. SQL Editor에서 supabase/step3-notes-permissions.sql을 실행하면 서버 역할의 쓰기 권한만 추가됩니다. 기존 DB 행은 삭제하지 않습니다.

**의도적으로 남은 3단계 허점:** 단건 GET·PUT·DELETE에는 소유자 검사가 없습니다. 정상 B 로그인으로 A 메모 ID를 지정하면 조회·수정·삭제할 수 있습니다. 4단계에서 보완합니다. 로그인 화면은 목록 항목별 수정·삭제와 새 메모 추가를 제공합니다.

정상 계정 로그인 후 메모를 추가·수정·삭제할 수 있어야 합니다. 비로그인·잘못된 토큰은 401, 삭제된 단건 GET은 404여야 합니다. 실제 계정 CRUD와 새 배포는 아직 검증하지 않았습니다. 단계 설정은 3이며 identityProvider와 allowedRoutes를 구현에 맞춰 기록했습니다. 실제 로그인 A 성공, B의 타인 자료 수정, SQL 쓰기 권한 적용은 미실행 또는 미확인입니다. 자기 점검은 인증 없는 조회와 잘못된 토큰 조회를 실제 배포에 보내고 결과만 기록합니다. 새 커밋이 배포되기 전에는 2단계 응답이 관찰될 수 있습니다.

다시 실행: npm run build -- --local. 실제 배포 후 로그인 → 가상 메모 추가 → 수정 → 삭제를 확인합니다. 자료 API의 비로그인 요청은 401, 삭제 후 단건 조회는 404여야 합니다.

## 2단계 기록

사용자가 SQL 실행과 서버 환경변수 등록을 완료했다고 알려 주었습니다. 실제 API 응답은 새 배포 후 별도 확인하며, 키 값은 확인하거나 보관하지 않습니다.

화면은 `/api/notes`의 Vercel 서버 함수를 통해 `public.learning_notes`의 가상 메모 네 건을 읽습니다. 루트 `data.json`과 공개 `data.json`은 빈 메모 목록이며, 빌드는 메모 본문을 복사하지 않습니다. 아래 1단계 설명은 시작 당시의 동작 기록입니다.

**남은 약점:** `/api/notes`는 아직 공개 주소입니다. 로그인·소유자 검증이 없어 비로그인 방문자도 가상 메모를 읽을 수 있습니다. DB의 RLS와 브라우저 역할 권한 회수만으로 이 서버 함수의 공개 접근이 막히지는 않습니다.

Supabase SQL Editor에서 가상 메모 네 건을 등록한 상태를 유지하세요. `supabase/step2-learning-notes.sql`은 테이블 구조와 권한만 담고 본문은 포함하지 않습니다. 새 DB에서는 이 파일만 실행해도 메모가 생기지 않습니다. 기존 DB 행은 삭제하거나 수정하지 않습니다. `owner_id uuid`는 NULL 허용이며 외래키가 없습니다.

Vercel 프로젝트 Settings → Environment Variables에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 직접 등록하고 Redeploy하세요. 실제 값은 Git·브라우저 파일·답변에 넣지 않습니다. 함수는 DB 오류 세부 정보를 응답하거나 로그에 남기지 않습니다. 저장점 설정과 다음 빌드의 배포 식별 단계는 2입니다. 실제 배포·DB 적용 완료나 심판 통과를 의미하지 않습니다.

로컬 정적 빌드: `npm run build -- --local`. 이 명령은 서버 함수를 실행하지 않습니다. 실제 배포 후 `/`에서 네 건이 표시되고 `/api/notes` GET은 200, POST는 405, DB 설정 누락/실패는 503이어야 합니다. `/data.json`은 빈 목록이고 DB의 anon·authenticated 직접 조회는 거부되어야 합니다.


## 2단계 심판 오류 보완 (로컬 수정, 배포 미확인)

공개 `/data.json`은 `notes: []`만 생성하고, 2단계 `/aleph.json`에는 1단계 확인 표시를 넣지 않습니다. 화면은 `/api/notes`를 호출하며 DB가 빈 경우 오류 안내를 표시합니다. 새 코드가 배포되고 DB·환경변수 설정이 완료돼야 카드 네 건이 표시됩니다. 현재 로컬 수정만으로 실제 심판 오류가 해결됐다고 판단하지 않습니다.

## 가상 메모 문장 공개 여부 확인 절차

이 절차는 최신 GitHub 커밋과 실제 배포를 각각 확인합니다. 로컬 수정만으로 GitHub나 배포의 공개 상태가 바뀌었다고 판단하지 않습니다. 확인 시각, GitHub SHA, 배포 주소, `/aleph.json`의 저장소·커밋, 각 요청의 HTTP 상태와 검색 일치 여부를 기록하세요. 키·쿠키·Authorization 헤더를 사용하거나 출력하지 않습니다.

### 1. GitHub 최신 파일 검색

기존 작업 폴더를 덮어쓰지 않도록 별도 임시 복제본에서 검색합니다. 아래는 Bash/Git Bash 명령입니다. `git grep -l`은 본문 대신 일치한 파일 이름만 출력하며, 종료 코드 1은 검색 결과 없음입니다.

```bash
note_prefix='실습용 가상'
review_dir=$(mktemp -d)
git clone --depth 1 --branch main https://github.com/pyeon-pyeon/choi-bujang-secret-vault.git "$review_dir/repo"
git -C "$review_dir/repo" log -1 --format='%H %s'
git -C "$review_dir/repo" grep -l -F \
  -e "$note_prefix 과제 기록" \
  -e "$note_prefix 포트폴리오 기록" \
  -e "$note_prefix 리추얼 기록" \
  -e "$note_prefix 행정 기록" HEAD -- .
```

전체 검색에서 일치한 파일이 있으면 숨기지 말고 기록하세요. `data.json`, `public/`, 브라우저 스크립트에서 일치하면 최신 정적 파일에 메모 본문이 남은 것입니다. SQL과 README에서 가상 메모 전체 문장을 제거했습니다. 검색어는 조각을 조합해 검색 설명 자체가 전체 문장으로 남지 않도록 합니다. DB로 옮긴 것과 공개 저장소에서 없앤 것은 별도 결과입니다.

### 2. 실제 배포 응답 검색

Vercel의 Domains 주소로 비로그인 요청을 보냅니다. 인증 없는 HTTP 요청에는 브라우저 로그인 세션이 포함되지 않습니다. 응답 본문은 임시 파일에만 저장하고 검색 결과로 파일 이름만 출력하세요.

```bash
app_url='https://choi-bujang-secret-vault-xtz6.vercel.app'
deploy_review_dir=$(mktemp -d)
for path in / /data.json /aleph.json /api/notes; do
  filename=${path#/}
  filename=${filename//\//_}
  if [ -z "$filename" ]; then filename=index.html; fi
  curl --silent --show-error --max-time 30 \
    --output "$deploy_review_dir/$filename" \
    --write-out "$path HTTP %{http_code}\n" "$app_url$path"
done
rg -l -F \
  -e "$note_prefix 과제 기록" \
  -e "$note_prefix 포트폴리오 기록" \
  -e "$note_prefix 리추얼 기록" \
  -e "$note_prefix 행정 기록" "$deploy_review_dir"
```

HTTP 200뿐 아니라 JSON을 파싱해서 확인하세요. JSON이 Unicode 이스케이프로 인코딩되면 단순 문자열 검색이 일치하지 않을 수 있습니다.

`/data.json`은 정상 JSON이며 `notes`가 빈 배열이어야 합니다. `/aleph.json`의 `repoUrl`과 `commit`을 위 최신 GitHub SHA와 대조하세요. `/api/notes`는 현재 의도적으로 공개된 약점이므로 DB 연결 완료 시 비로그인 GET에도 네 건이 반환됩니다. `/`의 초기 HTML에 본문이 없어도 브라우저가 API를 호출해 표시할 수 있습니다. 시크릿 창에서 페이지를 열고 개발자 도구 Network의 `/api/notes` 응답을 함께 확인하세요. 연결 실패, 404, 503, 리다이렉트 또는 JSON 파싱 실패는 본문 제거 성공의 증거가 아닙니다. HTML이 불러오는 추가 JS 파일이 있다면 해당 파일도 검색합니다.

### 3. 과거 노출과 현재 결과를 구분

**옛 공개 커밋 또는 옛 공개 배포가 남아 있는 한 과거 노출이 해소됐다고 쓰지 않습니다.** GitHub History에서 이전 `data.json`과 `public/data.json`을 확인하고, Vercel Deployments에서 기존 개별 배포 주소의 `/data.json`도 비로그인으로 확인하세요. 최신 도메인이 새 배포를 가리키는 것만으로 이전 배포가 사라지지는 않습니다. 이 점검은 기록·배포 삭제나 Git 이력 재작성을 수행하지 않습니다.

결과는 예를 들어 “최신 정적 JSON에는 메모 없음 / 최신 GitHub 전체 문장 검색 결과를 별도 기록 / 공개 API에서는 읽기 가능 / 과거 커밋·배포 노출은 별도 잔존”처럼 범위별로 기록하세요. 복제·캐시·다운로드된 과거 자료가 회수됐다고 단정하지 않습니다. 이 문서의 절차 추가 자체는 실제 점검 실행이나 방어 성공을 의미하지 않습니다.

## 1단계 시작 당시 안내

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
