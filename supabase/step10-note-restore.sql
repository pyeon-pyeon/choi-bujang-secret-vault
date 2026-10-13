-- 검토 후 학습 DB SQL Editor에서 실행합니다. 사본과 메모는 자동으로 생성하지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.learning_note_backups (
  note_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  verified boolean NOT NULL DEFAULT false
);
ALTER TABLE public.learning_note_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_note_backups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.learning_note_backups TO service_role;

CREATE OR REPLACE FUNCTION public.restore_learning_note(p_note_id uuid, p_owner_id uuid)
RETURNS TABLE (id uuid, owner_id uuid, content_sha256 text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  snapshot public.learning_note_backups%ROWTYPE;
  restored public.learning_notes%ROWTYPE;
  digest text;
BEGIN
  IF p_note_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'restore_denied';
  END IF;
  SELECT b.* INTO snapshot FROM public.learning_note_backups b
    WHERE b.note_id = p_note_id AND b.owner_id = p_owner_id AND b.verified = true
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'restore_denied';
  END IF;
  digest := encode(sha256(convert_to(
    octet_length(snapshot.title)::text || ':' || snapshot.title ||
    octet_length(snapshot.content)::text || ':' || snapshot.content, 'UTF8')), 'hex');
  IF digest <> snapshot.content_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'restore_denied';
  END IF;
  INSERT INTO public.learning_notes AS n (id, owner_id, title, content)
    VALUES (snapshot.note_id, snapshot.owner_id, snapshot.title, snapshot.content)
    ON CONFLICT ON CONSTRAINT learning_notes_pkey DO UPDATE
      SET title = EXCLUDED.title, content = EXCLUDED.content
      WHERE n.owner_id = p_owner_id
    RETURNING n.* INTO restored;
  IF NOT FOUND OR restored.id <> snapshot.note_id OR restored.owner_id <> snapshot.owner_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'restore_denied';
  END IF;
  digest := encode(sha256(convert_to(
    octet_length(restored.title)::text || ':' || restored.title ||
    octet_length(restored.content)::text || ':' || restored.content, 'UTF8')), 'hex');
  IF digest <> snapshot.content_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'restore_denied';
  END IF;
  RETURN QUERY SELECT restored.id, restored.owner_id, digest;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_learning_note(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_learning_note(uuid, uuid) TO service_role;
COMMIT;

-- 관리자가 침해 전에 검증한 가상 B 메모 한 건만 별도의 안전 사본에서 등록합니다.
-- verified=true는 안전 확인 후에만 지정합니다. 현재 손상 메모를 안전 사본으로 자동 지정하지 않습니다.
