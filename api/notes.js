import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
let verifyLogin;

// 검증된 신원과 DB 소유자가 일치하는 자료만 허용합니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const id = request.query?.id;
  const single = id !== undefined;
  const methods = single ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  // 명시적 Bearer 요청은 우선 검증합니다. 잘못된 토큰을 쿠키로 대체하지 않습니다.
  let authorization = request.headers?.authorization;
  const usingCookie = authorization === undefined;
  if (usingCookie) {
    const cookie = (request.headers?.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('vault_access='));
    if (cookie) authorization = `Bearer ${cookie.slice('vault_access='.length)}`;
    if (request.method !== 'GET' && request.headers?.origin !== new URL(config.publicAppUrl).origin) {
      return response.status(403).json({ error: 'INVALID_ORIGIN' });
    }
  }
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
  try {
    if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) {
      return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    }
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secret });
    const identity = await verifyLogin(authorization);
    if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
    // userId/role 등 요청 값은 읽지 않습니다. 검증된 A/B 신원 모두 유지합니다.
    const client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (single && (typeof id !== 'string' || !uuid.test(id))) {
      return response.status(400).json({ error: 'INVALID_ID' });
    }
    const table = () => client.from('learning_notes');
    const present = row => ({ id: row.id, title: row.title, body: row.content });
    if (request.method === 'GET') {
      const result = single
        ? await table().select('id,title,content').eq('id', id).eq('owner_id', identity.userId).maybeSingle()
        : await table().select('id,title,content').eq('owner_id', identity.userId).order('created_at', { ascending: true });
      if (result.error) return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
      if (single && !result.data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
      return response.status(200).json(single ? present(result.data) : result.data.map(present));
    }
    if (request.method === 'DELETE') {
      // 행 선택과 삭제를 같은 소유자 조건으로 수행합니다.
      const { data, error } = await table().delete().eq('id', id).eq('owner_id', identity.userId).select('id').maybeSingle();
      if (error) return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
      if (!data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
      return response.status(200).json({ id: data.id });
    }
    let body = request.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return response.status(400).json({ error: 'INVALID_NOTE' }); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200
        || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 10000) {
      return response.status(400).json({ error: 'INVALID_NOTE' });
    }
    if (request.method === 'POST') {
      const newId = body.id === undefined ? randomUUID() : body.id;
      if (typeof newId !== 'string' || !uuid.test(newId)) return response.status(400).json({ error: 'INVALID_ID' });
      const { error } = await table().insert({ id: newId, title: body.title, content: body.body, owner_id: identity.userId });
      if (error) return response.status(error.code === '23505' ? 409 : 503).json({ error: error.code === '23505' ? 'ID_EXISTS' : 'NOTES_UNAVAILABLE' });
      return response.status(201).json({ id: newId });
    }
    // 수정 계약은 title/body만 허용합니다. 소유자 변경은 기본 거부합니다.
    if (Object.keys(body).some(key => !['title', 'body'].includes(key))) {
      return response.status(400).json({ error: 'INVALID_UPDATE_FIELDS' });
    }
    // 기존 행을 본인 소유로 제한하고, 새 행의 소유자도 본인 ID로 고정합니다.
    const { data, error } = await table().update({ title: body.title, content: body.body, owner_id: identity.userId })
      .eq('id', id).eq('owner_id', identity.userId).select('id,title,content').maybeSingle();
    if (error) return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    if (!data) return response.status(404).json({ error: 'NOTE_NOT_FOUND' });
    return response.status(200).json(present(data));

  } catch {
    // SDK 오류에는 연결 정보가 들어갈 수 있어 응답/로그에 전달하지 않습니다.
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
