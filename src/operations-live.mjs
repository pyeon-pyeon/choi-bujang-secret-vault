import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const LIVE_CHECKS = Object.freeze([
  { attackId: 'anonymous_note_read', path: '/api/notes', kind: 'deny' },
  { attackId: 'anonymous_note_list', path: '/api/my/notes', kind: 'deny' },
  { attackId: 'static_seed_data_scan', path: '/data.json', kind: 'empty_static' },
]);

export function readCatalog() {
  const data = JSON.parse(readFileSync(new URL('../operations/defense-catalog.json', import.meta.url), 'utf8'));
  if (data.schema !== 'vault.defense-catalog.v1' || !Array.isArray(data.tests)
      || data.tests.length === 0 || new Set(data.tests.map(row => row.attackId)).size !== data.tests.length
      || data.tests.some(row => !/^[a-z0-9_]{1,80}$/.test(row.attackId)
        || !Number.isInteger(row.step) || typeof row.expected !== 'string')) throw new Error('INVALID_CATALOG');
  return data;
}

export function unrun(test) {
  return { attackId: test.attackId, step: test.step ?? null, expected: test.expected ?? '',
    status: 'not_run', outcome: 'not_run', httpStatus: null, requestId: null,
    checkedAt: null, method: null, urlSha256: null, bodyBytes: null,
    assertionPassed: null, observed: 'not_run', source: 'live_api' };
}

export function summarizeLiveResults(catalog, measured) {
  const records = catalog.tests.map(test => {
    const matches = measured.filter(row => row.attackId === test.attackId);
    if (matches.length !== 1) return unrun(test);
    const row = matches[0];
    if (row.status !== 'executed' || row.method !== 'GET' || !Number.isInteger(row.httpStatus)
        || row.httpStatus < 100 || row.httpStatus > 599 || !/^[a-f0-9]{64}$/.test(row.urlSha256 ?? '')
        || !/^[a-zA-Z0-9:_-]{8,160}$/.test(row.requestId ?? '')
        || !Number.isFinite(Date.parse(row.checkedAt)) || !Number.isInteger(row.bodyBytes)
        || row.bodyBytes < 0 || !['blocked', 'checked', 'error'].includes(row.outcome)) return unrun(test);
    if (row.outcome === 'blocked' && (row.httpStatus !== 401 || row.assertionPassed !== true)) return unrun(test);
    return { attackId: test.attackId, step: test.step, expected: test.expected, status: row.status,
      outcome: row.outcome, httpStatus: row.httpStatus, requestId: row.requestId, checkedAt: row.checkedAt,
      method: row.method, urlSha256: row.urlSha256, bodyBytes: row.bodyBytes,
      assertionPassed: row.assertionPassed === true, observed: `HTTP ${row.httpStatus}; method=GET; urlSha256=${row.urlSha256}; bodyBytes=${row.bodyBytes}`, source: 'live_api' };
  });
  const executed = records.filter(row => row.status === 'executed');
  return { records, total: records.length, executed: executed.length,
    notRun: records.filter(row => row.status === 'not_run').length,
    blocked: executed.filter(row => row.outcome === 'blocked').length,
    passed: executed.filter(row => row.assertionPassed === true).length,
    errors: executed.filter(row => row.outcome === 'error').length };
}

export async function collectApiResults({ config, authHeaders = {}, fetcher = fetch }) {
  const base = new URL(config.publicAppUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
      || base.pathname !== '/' || !base.hostname.endsWith('.vercel.app')) throw new Error('INVALID_APP_URL');
  const catalog = readCatalog();
  async function sample(check, headers) {
    const definition = catalog.tests.find(row => row.attackId === check.attackId) ?? check;
    const record = unrun(definition);
    try {
      const url = new URL(check.path, base).href;
      const response = await fetcher(url, { method: 'GET', headers, redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10000) });
      const requestId = response.headers?.get('x-request-id') || response.headers?.get('x-vercel-id');
      if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(requestId ?? '')) return record;
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch { /* 응답 원문을 저장하거나 출력하지 않습니다. */ }
      const onlyError = data !== null && !Array.isArray(data)
        && Object.keys(data).every(key => key === 'error') && typeof data.error === 'string';
      const matched = check.kind === 'deny' ? response.status === 401 && onlyError
        : check.kind === 'empty_static' ? response.status === 200 && data !== null
          && Object.keys(data).join(',') === 'notes' && Array.isArray(data.notes) && data.notes.length === 0
          : response.status === 200 && Array.isArray(data)
            && data.every(row => typeof row.id === 'string' && typeof row.title === 'string' && typeof row.body === 'string');
      const checkedAt = new Date().toISOString();
      const urlSha256 = createHash('sha256').update(url).digest('hex');
      const bodyBytes = new TextEncoder().encode(raw).length;
      return { ...record, status: 'executed', outcome: matched ? check.kind === 'deny' ? 'blocked' : check.kind === 'normal' ? 'allowed' : 'checked' : 'error',
        httpStatus: response.status, requestId, checkedAt, method: 'GET', urlSha256, bodyBytes,
        assertionPassed: matched,
        observed: `HTTP ${response.status}; method=GET; urlSha256=${urlSha256}; bodyBytes=${bodyBytes}; jsonReady=${data !== null}` };
    } catch { return record; }
  }
  const measured = await Promise.all(LIVE_CHECKS.map(check => sample(check, {})));
  const headers = {};
  if (typeof authHeaders.authorization === 'string') headers.authorization = authHeaders.authorization;
  if (typeof authHeaders.cookie === 'string') {
    headers.cookie = authHeaders.cookie.split(';').map(value => value.trim())
      .filter(value => value.startsWith('vault_access=') || value.startsWith('vault_device=')).join('; ');
  }
  const normal = headers.authorization || headers.cookie
    ? await sample({ attackId: 'normal_own_note_list', path: '/api/my/notes', kind: 'normal',
      expected: '서버가 승인한 로그인 계정의 본인 목록 HTTP 200' }, headers)
    : unrun({ attackId: 'normal_own_note_list', expected: '승인된 계정으로 별도 확인' });
  return { summary: summarizeLiveResults(catalog, measured), normal, measured, catalogSource: catalog.sourceUrl };
}
