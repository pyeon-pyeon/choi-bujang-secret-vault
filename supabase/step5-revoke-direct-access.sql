-- 검토 후 학습 DB SQL Editor에서 실행. 자동 적용하지 않습니다.
BEGIN;
SELECT 'before' AS phase, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'learning_notes'
ORDER BY grantee, privilege_type;
SELECT 'before' AS phase, r.role_name, p.privilege,
  has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
ORDER BY r.role_name, p.privilege;
-- 테이블 권한과 별개로 남을 수 있는 열 권한도 확인합니다.
SELECT 'before' AS phase, r.role_name, p.privilege,
  has_any_column_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS p(privilege)
ORDER BY r.role_name, p.privilege;

REVOKE ALL ON TABLE public.learning_notes FROM PUBLIC, anon, authenticated;
-- 기존에 별도로 부여한 열 권한이 있다면 이 테이블에서만 회수합니다.
DO $$
DECLARE col record;
BEGIN
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.learning_notes'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.learning_notes FROM PUBLIC, anon, authenticated', col.attname);
  END LOOP;
END $$;
-- service_role의 기존 CRUD 권한, RLS 정책, DB 행은 유지합니다.
SELECT 'after' AS phase, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'learning_notes'
ORDER BY grantee, privilege_type;
SELECT 'after' AS phase, r.role_name, p.privilege,
  has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
ORDER BY r.role_name, p.privilege;
-- 테이블 권한과 별개로 남을 수 있는 열 권한도 확인합니다.
SELECT 'after' AS phase, r.role_name, p.privilege,
  has_any_column_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS p(privilege)
ORDER BY r.role_name, p.privilege;
COMMIT;
