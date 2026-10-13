-- 학습 DB에서 검토 후 실행합니다. 기존 메모·공지·사본은 변경하지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vault_devices (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{16}$'),
  owner_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > requested_at)
);
ALTER TABLE public.vault_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vault_devices FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.vault_devices TO service_role;
GRANT INSERT (id, owner_id, token_hash, expires_at) ON TABLE public.vault_devices TO service_role;
COMMIT;
-- 관리자만 실제 요청 번호와 소유 계정을 확인하고 status를 approved/revoked로 변경합니다.
-- 앱 서버·학생에게 승인 UPDATE 권한은 부여하지 않습니다.
