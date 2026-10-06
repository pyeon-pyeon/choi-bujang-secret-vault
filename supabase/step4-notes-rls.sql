-- 검토용 4단계 SQL. 자동 실행하지 않습니다. 메모 행·다른 테이블은 보존합니다.
BEGIN;

SELECT 'before' AS phase, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'learning_notes'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT 'before' AS phase, r.role_name, p.privilege,
  has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
ORDER BY r.role_name, p.privilege;

REVOKE ALL ON TABLE public.learning_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_notes TO authenticated;
ALTER TABLE public.learning_notes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'learning_notes'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.learning_notes', existing_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY notes_select_own ON public.learning_notes
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY notes_insert_own ON public.learning_notes
FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY notes_update_own ON public.learning_notes
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE POLICY notes_delete_own ON public.learning_notes
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id);

SELECT 'after' AS phase, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'learning_notes'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT 'after' AS phase, r.role_name, p.privilege,
  has_table_privilege(r.role_name, 'public.learning_notes', p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
ORDER BY r.role_name, p.privilege;

SELECT relrowsecurity AS rls_enabled FROM pg_class
WHERE oid = 'public.learning_notes'::regclass;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'learning_notes' ORDER BY policyname;
COMMIT;
