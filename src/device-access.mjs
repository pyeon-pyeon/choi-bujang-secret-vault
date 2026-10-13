import { createHash } from 'node:crypto';

export function deviceToken(request) {
  const value = (request.headers?.cookie || '').split(';').map(p => p.trim())
    .find(p => p.startsWith('vault_device='))?.slice(13);
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export const deviceTokenHash = value => createHash('sha256').update(value).digest('hex');
export async function registeredDevice(client, request, owner) {
  const token = deviceToken(request);
  if (!token) return { status: 'not_requested' };
  const result = await client.from('vault_devices').select('id,owner_id,status,expires_at')
    .eq('token_hash', deviceTokenHash(token)).eq('owner_id', owner).maybeSingle();
  if (result.error) throw new Error('device_status_unavailable');
  const row = result.data;
  if (!row || row.owner_id !== owner || !/^[a-f0-9]{16}$/.test(row.id)
      || !['pending', 'approved', 'revoked'].includes(row.status)
      || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now()) {
    return { status: 'not_requested' };
  }
  return { status: row.status, requestId: row.id };
}
export async function requireRegisteredDevice(client, request, owner, response) {
  try {
    if ((await registeredDevice(client, request, owner)).status === 'approved') return true;
    response.status(403).json({ error: 'DEVICE_NOT_APPROVED', reason: '서버 기기 승인이 필요합니다.' });
  } catch { response.status(503).json({ error: 'DEVICE_STATUS_UNAVAILABLE' }); }
  return false;
}
