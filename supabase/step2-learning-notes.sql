-- 2단계: 학습용 테이블 구조와 접근 권한을 유지합니다.
-- Supabase Dashboard > SQL Editor에서 관리자 역할로 실행합니다.
-- 이미 등록한 학습용 DB 자료는 보존합니다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.learning_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid, -- 이후 소유자 연결용. auth.users 외래키 없음.
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;
-- 브라우저 역할의 읽기 허용 정책은 만들지 않습니다.
REVOKE ALL PRIVILEGES ON TABLE public.learning_notes FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.learning_notes TO service_role;

-- 가상 메모는 SQL Editor로 이미 등록했습니다. 본문은 최신 Git 파일에 보관하지 않습니다.
-- 이 파일은 기존 DB 행을 삭제하거나 수정하지 않습니다.
COMMIT;
