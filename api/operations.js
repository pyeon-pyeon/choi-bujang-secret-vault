import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { requireRegisteredDevice } from '../src/device-access.mjs';
import { readOperationsSummary } from '../src/operations-summary.mjs';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
let verifyLogin;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  let authorization = request.headers?.authorization;
  if (authorization === undefined) {
    const cookie = (request.headers?.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('vault_access='));
    if (cookie) authorization = `Bearer ${cookie.slice(13)}`;
  }
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return response.status(503).json({ error: 'SUMMARY_UNAVAILABLE' });
  try {
    if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) throw new Error('invalid_issuer');
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secret });
    const identity = await verifyLogin(authorization);
    if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!await requireRegisteredDevice(client, request, identity.userId, response)) return;
    const headers = {};
    if (request.headers?.cookie) headers.cookie = request.headers.cookie;
    if (request.headers?.authorization) headers.authorization = request.headers.authorization;
    return response.status(200).json(await readOperationsSummary({ config, headers }));
  } catch { return response.status(503).json({ error: 'SUMMARY_UNAVAILABLE' }); }
}
