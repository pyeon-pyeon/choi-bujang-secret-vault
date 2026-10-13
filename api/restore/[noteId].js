import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { noteContentHash } from '../../src/note-hash.mjs';

const config = JSON.parse(await readFile(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
let verifyLogin;

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const noteId = request.query?.noteId;
  if (typeof noteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId)
      || Object.keys(request.query || {}).some(key => key !== 'noteId')
      || (request.body != null && !(typeof request.body === 'object' && !Array.isArray(request.body) && Object.keys(request.body).length === 0))) {
    return response.status(400).json({ error: 'INVALID_RESTORE_REQUEST' });
  }
  let authorization = request.headers?.authorization;
  if (authorization === undefined) {
    if (request.headers?.origin !== new URL(config.publicAppUrl).origin) {
      return response.status(403).json({ error: 'INVALID_ORIGIN' });
    }
    const cookie = (request.headers?.cookie || '').split(';').map(p => p.trim())
      .find(p => p.startsWith('vault_access='));
    if (cookie) authorization = `Bearer ${cookie.slice('vault_access='.length)}`;
  }
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return response.status(503).json({ error: 'RESTORE_UNAVAILABLE' });
  try {
    if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) {
      return response.status(503).json({ error: 'RESTORE_UNAVAILABLE' });
    }
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secret });
    const identity = await verifyLogin(authorization);
    if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const backup = await client.from('learning_note_backups').select('note_id,owner_id,title,content,content_sha256,verified')
      .eq('note_id', noteId).eq('owner_id', identity.userId).eq('verified', true).maybeSingle();
    if (backup.error) return response.status(503).json({ error: 'RESTORE_UNAVAILABLE' });
    const row = backup.data;
    if (!row || row.note_id !== noteId || row.owner_id !== identity.userId
        || row.verified !== true || row.content_sha256 !== noteContentHash(row.title, row.content)) {
      return response.status(404).json({ error: 'RESTORE_DENIED' });
    }
    // DB에서도 같은 검사를 수행하고 한 트랜잭션에서 한 행만 복원합니다.
    const restored = await client.rpc('restore_learning_note', { p_note_id: noteId, p_owner_id: identity.userId });
    if (restored.error || !Array.isArray(restored.data) || restored.data.length !== 1) {
      return response.status(409).json({ error: 'RESTORE_DENIED' });
    }
    const result = restored.data[0];
    if (result.id !== row.note_id || result.owner_id !== row.owner_id || result.content_sha256 !== row.content_sha256) {
      return response.status(409).json({ error: 'RESTORE_DENIED' });
    }
    return response.status(200).json({ id: result.id, content_sha256: result.content_sha256, restored: true });
  } catch {
    return response.status(503).json({ error: 'RESTORE_UNAVAILABLE' });
  }
}
