import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
// 공개 키도 서버 함수에만 둡니다. 환경변수로 교체할 수 있습니다.
const PUBLIC_KEY = 'sb_publishable_dPdvN9lFoONAF7STrbWziA_12SYfsrX';
const cookies = request => Object.fromEntries((request.headers?.cookie || '').split(';').map(p => p.trim().split(/=(.*)/s)).filter(p => p.length >= 2));
function setCookies(response, session) {
  const options = '; Path=/api; HttpOnly; Secure; SameSite=Strict';
  response.setHeader('Set-Cookie', [
    `vault_access=${session?.access_token || ''}${options}; Max-Age=${session ? session.expires_in || 3600 : 0}`,
    `vault_refresh=${session?.refresh_token || ''}${options}; Max-Age=${session ? 604800 : 0}`,
  ]);
}
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }
  const origin = request.headers?.origin;
  if ((request.method !== 'GET' && origin !== new URL(config.publicAppUrl).origin)
      || (origin && origin !== new URL(config.publicAppUrl).origin)) {
    return response.status(403).json({ error: '허용되지 않은 요청 출처입니다.' });
  }
  try {
    const client = createClient(process.env.SUPABASE_URL || new URL(config.identityProvider.issuer).origin,
      process.env.SUPABASE_PUBLISHABLE_KEY || PUBLIC_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const saved = cookies(request);
    if (request.method === 'POST') {
      let body = request.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (typeof body?.email !== 'string' || typeof body?.password !== 'string'
          || !body.email.trim() || !body.password || body.email.length > 320 || body.password.length > 1024) {
        return response.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });
      }
      const { data, error } = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
      if (error || !data?.session) {
        const reasons = { invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.', email_not_confirmed: '이메일 인증을 완료하세요.', over_request_rate_limit: '요청이 많습니다. 잠시 후 다시 시도하세요.', user_banned: '사용이 제한된 계정입니다.' };
        return response.status(401).json({ error: reasons[error?.code] || '로그인에 실패했습니다. 계정 상태와 연결을 확인하세요.' });
      }
      setCookies(response, data.session);
      return response.status(200).json({ signedIn: true });
    }
    if (request.method === 'DELETE') {
      // 원격 로그아웃에 실패해도 이 브라우저의 쿠키는 지웁니다.
      setCookies(response, null);
      if (saved.vault_access && saved.vault_refresh) {
        const { error } = await client.auth.setSession({ access_token: saved.vault_access, refresh_token: saved.vault_refresh });
        if (!error) {
          const result = await client.auth.signOut({ scope: 'local' });
          if (result.error) return response.status(502).json({ signedIn: false, error: '이 브라우저는 로그아웃됐지만 서버 세션 해제는 확인하지 못했습니다.' });
        }
      }
      return response.status(200).json({ signedIn: false });
    }
    if (saved.vault_access) {
      const { data, error } = await client.auth.getUser(saved.vault_access);
      if (!error && data?.user) return response.status(200).json({ signedIn: true });
    }
    if (saved.vault_refresh) {
      const { data, error } = await client.auth.refreshSession({ refresh_token: saved.vault_refresh });
      if (!error && data?.session) {
        setCookies(response, data.session);
        return response.status(200).json({ signedIn: true });
      }
    }
    setCookies(response, null);
    return response.status(200).json({ signedIn: false });
  } catch {
    return response.status(503).json({ error: '로그인 서비스 연결에 실패했습니다. 잠시 후 다시 시도하세요.' });
  }
}
