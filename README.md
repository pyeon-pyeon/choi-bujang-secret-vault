# BYTE BACK 방어전 시작 틀 R5

## 현재 작업: 2단계 자료 이전 (로컬 구현, DB 적용·배포 미확인)

화면은 `/api/notes`의 Vercel 서버 함수를 통해 `public.learning_notes`의 가상 메모 네 건을 읽습니다. 루트와 공개 `data.json`은 빈 메모 목록이며, 빌드는 메모 본문을 복사하지 않습니다. 아래 1단계 설명은 시작 당시의 동작 기록입니다.

**남은 약점:** `/api/notes`는 아직 공개 주소입니다. 로그인·소유자 검증이 없어 비로그인 방문자도 가상 메모를 읽을 수 있습니다. DB의 RLS와 브라우저 역할 권한 회수만으로 이 서버 함수의 공개 접근이 막히지는 않습니다.

Supabase SQL Editor에서 `supabase/step2-learning-notes.sql`을 새 테이블에 실행하세요. `owner_id uuid`는 NULL 허용이며 `auth.users` 외래키는 없습니다. RLS는 켜고 `PUBLIC`, `anon`, `authenticated` 권한을 회수하며 서버 역할에만 SELECT를 허용합니다. 이전 세 건 SQL을 이미 실행했다면 테이블을 삭제하지 말고 아래 추가 SQL만 실행하세요.

```sql
BEGIN;
GRANT SELECT ON TABLE public.learning_notes TO service_role;
INSERT INTO public.learning_notes (id, owner_id, title, content)
VALUES ('00000000-0000-4000-8000-000000000004'::uuid, NULL, '훈련 행정 자료', '실습용 가상 행정 기록')
ON CONFLICT (id) DO NOTHING;
COMMIT;
```

Vercel 프로젝트 Settings → Environment Variables에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 직접 등록하고 Redeploy하세요. 실제 값은 Git·브라우저 파일·답변에 넣지 않습니다. 함수는 DB 오류 세부 정보를 응답하거나 로그에 남기지 않습니다. 저장점 설정과 다음 빌드의 배포 식별 단계는 2입니다. 실제 배포·DB 적용 완료나 심판 통과를 의미하지 않습니다.

로컬 정적 빌드: `npm run build -- --local`. 이 명령은 서버 함수를 실행하지 않습니다. 실제 배포 후 `/`에서 네 건이 표시되고 `/api/notes` GET은 200, POST는 405, DB 설정 누락/실패는 503이어야 합니다. `/data.json`은 빈 목록이고 DB의 anon·authenticated 직접 조회는 거부되어야 합니다.


## 가상 메모 문장 공개 여부 확인 절차

이 절차는 최신 GitHub 커밋과 실제 배포를 각각 확인합니다. 로컬 수정만으로 GitHub나 배포의 공개 상태가 바뀌었다고 판단하지 않습니다. 확인 시각, GitHub SHA, 배포 주소, `/aleph.json`의 저장소·커밋, 각 요청의 HTTP 상태와 검색 일치 여부를 기록하세요. 키·쿠키·Authorization 헤더를 사용하거나 출력하지 않습니다.

### 1. GitHub 최신 파일 검색

기존 작업 폴더를 덮어쓰지 않도록 별도 임시 복제본에서 검색합니다. 아래는 Bash/Git Bash 명령입니다. `git grep -l`은 본문 대신 일치한 파일 이름만 출력하며, 종료 코드 1은 검색 결과 없음입니다.

```bash
review_dir=$(mktemp -d)
git clone --depth 1 --branch main https://github.com/pyeon-pyeon/choi-bujang-secret-vault.git "$review_dir/repo"
git -C "$review_dir/repo" log -1 --format='%H %s'
git -C "$review_dir/repo" grep -l -F \
  -e '실습용 가상 과제 기록' \
  -e '실습용 가상 포트폴리오 기록' \
  -e '실습용 가상 리추얼 기록' \
  -e '실습용 가상 행정 기록' HEAD -- .
```

전체 검색에서 SQL 초기 자료와 이 README가 일치할 수 있습니다. 이를 숨기거나 전체 저장소에 메모가 없다고 보고하지 마세요. `data.json`, `public/`, 브라우저 스크립트에서 일치하면 최신 정적 파일에 메모 본문이 남은 것입니다. **현재 SQL과 README에도 가상 메모 본문이 있으므로 공개 GitHub 최신 파일 전체에서 본문이 제거된 상태는 아닙니다.** DB로 옮긴 것과 공개 저장소에서 없앤 것은 별도 결과입니다.

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
  -e '실습용 가상 과제 기록' \
  -e '실습용 가상 포트폴리오 기록' \
  -e '실습용 가상 리추얼 기록' \
  -e '실습용 가상 행정 기록' "$deploy_review_dir"
```

HTTP 200뿐 아니라 JSON을 파싱해서 확인하세요. JSON이 Unicode 이스케이프로 인코딩되면 단순 문자열 검색이 일치하지 않을 수 있습니다.

`/data.json`은 정상 JSON이며 `notes`가 빈 배열이어야 합니다. `/aleph.json`의 `repoUrl`과 `commit`을 위 최신 GitHub SHA와 대조하세요. `/api/notes`는 현재 의도적으로 공개된 약점이므로 DB 연결 완료 시 비로그인 GET에도 네 건이 반환됩니다. `/`의 초기 HTML에 본문이 없어도 브라우저가 API를 호출해 표시할 수 있습니다. 시크릿 창에서 페이지를 열고 개발자 도구 Network의 `/api/notes` 응답을 함께 확인하세요. 연결 실패, 404, 503, 리다이렉트 또는 JSON 파싱 실패는 본문 제거 성공의 증거가 아닙니다. HTML이 불러오는 추가 JS 파일이 있다면 해당 파일도 검색합니다.

### 3. 과거 노출과 현재 결과를 구분

**옛 공개 커밋 또는 옛 공개 배포가 남아 있는 한 과거 노출이 해소됐다고 쓰지 않습니다.** GitHub History에서 이전 `data.json`과 `public/data.json`을 확인하고, Vercel Deployments에서 기존 개별 배포 주소의 `/data.json`도 비로그인으로 확인하세요. 최신 도메인이 새 배포를 가리키는 것만으로 이전 배포가 사라지지는 않습니다. 이 점검은 기록·배포 삭제나 Git 이력 재작성을 수행하지 않습니다.

결과는 예를 들어 “최신 정적 JSON에는 메모 없음 / 최신 GitHub SQL·README에는 가상 본문 남음 / 공개 API에서는 읽기 가능 / 과거 커밋·배포 노출은 별도 잔존”처럼 범위별로 기록하세요. 복제·캐시·다운로드된 과거 자료가 회수됐다고 단정하지 않습니다. 이 문서의 절차 추가 자체는 실제 점검 실행이나 방어 성공을 의미하지 않습니다.

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
