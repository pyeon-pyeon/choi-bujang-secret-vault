import { requireRegisteredDevice } from '../../src/device-access.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createLoginVerifier } from '../../src/verify-login.mjs';

const config = JSON.parse(await readFile(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
let verifyLogin;

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'PUT');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const id = request.query?.id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return response.status(400).json({ error: 'INVALID_ID' });
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
  if (!url || !secret) return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
  try {
    if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) {
      return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
    }
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secret });
    const identity = await verifyLogin(authorization);
    if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!await requireRegisteredDevice(client, request, identity.userId, response)) return;
    // 요청의 구역·role 대신 DB 공지의 구역과 저장된 권한을 사용합니다.
    const notice = await client.from('learning_notices').select('id,class_id,project_id').eq('id', id).maybeSingle();
    if (notice.error) return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
    if (!notice.data) return response.status(404).json({ error: 'NOTICE_NOT_FOUND', reason: '자료가 없거나 접근 권한이 없습니다.' });
    const classId = notice.data.class_id;
    const projectId = notice.data.project_id;
    const role = await client.from('vault_staff_roles').select('role')
      .eq('class_id', classId).eq('project_id', projectId).eq('auth_user_id', identity.userId).maybeSingle();
    if (role.error) return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
    if (role.data?.role !== 'instructor') {
      return response.status(403).json({ error: 'FORBIDDEN', reason: '강사 권한이 필요합니다.' });
    }
    let body = request.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(k => !['title', 'body'].includes(k))
        || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200
        || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 10000) {
      return response.status(400).json({ error: 'INVALID_NOTICE', reason: '제목과 본문만 수정할 수 있습니다.' });
    }
    const result = await client.from('learning_notices').update({ title: body.title, content: body.body })
      .eq('id', id).eq('class_id', classId).eq('project_id', projectId)
      .select('id,title,content').maybeSingle();
    if (result.error) return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
    if (!result.data) return response.status(404).json({ error: 'NOTICE_NOT_FOUND' });
    return response.status(200).json({ id: result.data.id, title: result.data.title, body: result.data.content });
  } catch {
    return response.status(503).json({ error: 'NOTICE_UNAVAILABLE' });
  }
}
