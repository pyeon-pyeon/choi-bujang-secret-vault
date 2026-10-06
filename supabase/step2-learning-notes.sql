-- 2단계: 가상 메모 네 건만 학습용 DB에 저장합니다.
-- Supabase Dashboard > SQL Editor에서 관리자 역할로 실행합니다.
-- 새 테이블용 SQL입니다. 같은 이름이 있으면 중단하며 기존 자료를 덮어쓰지 않습니다.
BEGIN;

CREATE TABLE public.learning_notes (
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

INSERT INTO public.learning_notes (id, owner_id, title, content) VALUES
  ('00000000-0000-4000-8000-000000000001'::uuid, NULL, '과제', '실습용 가상 과제 기록'),
  ('00000000-0000-4000-8000-000000000002'::uuid, NULL, '포트폴리오', '실습용 가상 포트폴리오 기록'),
  ('00000000-0000-4000-8000-000000000003'::uuid, NULL, '아침 리추얼', '실습용 가상 리추얼 기록'),
  ('00000000-0000-4000-8000-000000000004'::uuid, NULL, '훈련 행정 자료', '실습용 가상 행정 기록');

COMMIT;
