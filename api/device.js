import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { registeredDevice, deviceTokenHash } from '../src/device-access.mjs';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
let verifyLogin;
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  if (request.method === 'POST' && request.headers?.origin !== new URL(config.publicAppUrl).origin) {
    return response.status(403).json({ error: 'INVALID_ORIGIN' });
  }
  if (request.method === 'POST' && request.body != null
      && !(typeof request.body === 'object' && !Array.isArray(request.body) && Object.keys(request.body).length === 0)) {
    return response.status(400).json({ error: 'INVALID_DEVICE_REQUEST' });
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
  if (!url || !secret) return response.status(503).json({ error: 'DEVICE_STATUS_UNAVAILABLE' });
  try {
    if (new URL(url).origin !== new URL(config.identityProvider.issuer).origin) throw new Error('invalid_issuer');
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secret });
    const identity = await verifyLogin(authorization);
    if (!identity) return response.status(401).json({ error: 'INVALID_LOGIN' });
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const state = await registeredDevice(client, request, identity.userId);
    if (request.method === 'GET' || state.status !== 'not_requested') return response.status(200).json(state);
    const requestId = randomBytes(8).toString('hex');
    const token = randomBytes(32).toString('hex');
    const result = await client.from('vault_devices').insert({ id: requestId, owner_id: identity.userId,
      token_hash: deviceTokenHash(token), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (result.error) return response.status(503).json({ error: 'DEVICE_STATUS_UNAVAILABLE' });
    response.setHeader('Set-Cookie', `vault_device=${token}; Path=/api; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict`);
    return response.status(202).json({ status: 'pending', requestId });
  } catch { return response.status(503).json({ error: 'DEVICE_STATUS_UNAVAILABLE' }); }
}
