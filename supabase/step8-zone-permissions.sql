-- 검토 후 SQL Editor에서 실행합니다. 기존 메모·소유자·다른 테이블은 변경하지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vault_identity_bindings (
  class_id text NOT NULL,
  project_id text NOT NULL,
  subject_id text NOT NULL,
  auth_user_id uuid NOT NULL,
  PRIMARY KEY (class_id, project_id, subject_id)
);
CREATE TABLE IF NOT EXISTS public.vault_staff_roles (
  class_id text NOT NULL,
  project_id text NOT NULL,
  auth_user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = 'instructor'),
  PRIMARY KEY (class_id, project_id, auth_user_id)
);
CREATE TABLE IF NOT EXISTS public.learning_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id text NOT NULL,
  project_id text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vault_identity_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vault_identity_bindings, public.vault_staff_roles,
  public.learning_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vault_identity_bindings, public.vault_staff_roles TO service_role;
GRANT SELECT, UPDATE ON TABLE public.learning_notices TO service_role;
COMMIT;

-- 권한·연결 행은 SQL Editor에서 관리자만 등록합니다. 예제 계정은 자동 생성하지 않습니다.
-- subject_id는 엔진이 검증한 값, auth_user_id는 별도로 확인한 같은 로그인 계정의 UUID여야 합니다.
-- class_id/project_id도 엔진 등록값과 일치시킵니다. 클라이언트 제출값만으로 연결하지 않습니다.
-- 강사 계정만 vault_staff_roles에 등록합니다. 학생 행은 만들지 않습니다.
