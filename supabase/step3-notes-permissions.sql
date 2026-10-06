-- 서버 API용 권한만 추가합니다. 기존 행·RLS·브라우저 권한은 보존합니다.
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_notes TO service_role;
COMMIT;
