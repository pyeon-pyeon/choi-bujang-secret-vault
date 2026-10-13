import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));

// 관리자만 등록한 연결을 조회합니다. 브라우저에 연결/권한 등록 API는 제공하지 않습니다.
export async function authorizeZone(request) {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !request.subjectId || !request.classId || !request.projectId) return false;
  if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) return false;
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }) },
  });
  return authorizeWithClient(client, request);
}

export async function authorizeWithClient(client, request) {
  const binding = await client.from('vault_identity_bindings').select('auth_user_id')
    .eq('class_id', request.classId).eq('project_id', request.projectId)
    .eq('subject_id', request.subjectId).maybeSingle();
  if (binding.error || !binding.data?.auth_user_id) return false;
  const userId = binding.data.auth_user_id;
  if (request.service === 'notes') {
    if (request.path === '/notes' && request.method === 'GET') return true;
    if (!['GET', 'PUT'].includes(request.method)) return false;
    const id = request.path.slice('/notes/'.length);
    const row = await client.from('learning_notes').select('owner_id').eq('id', id).maybeSingle();
    return !row.error && row.data?.owner_id === userId;
  }
  if (request.service === 'notices' && request.method === 'PUT') {
    const role = await client.from('vault_staff_roles').select('role')
      .eq('class_id', request.classId).eq('project_id', request.projectId)
      .eq('auth_user_id', userId).maybeSingle();
    if (role.error || role.data?.role !== 'instructor') return false;
    const row = await client.from('learning_notices').select('id')
      .eq('id', request.path.slice('/notices/'.length))
      .eq('class_id', request.classId).eq('project_id', request.projectId).maybeSingle();
    return !row.error && Boolean(row.data);
  }
  return false;
}
