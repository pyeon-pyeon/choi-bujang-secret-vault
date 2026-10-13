// 서버가 정한 자원 식별자입니다. 클라이언트의 헤더·본문 값은 사용하지 않습니다.
export const RESOURCE_IDS = Object.freeze({ notes: 'notes', notices: 'notices' });

// 기존 앱 API 경로와 엔진 경로를 동일한 자원 종류로 구분합니다.
// 이 함수는 식별만 하며 로그인·소유자·권한을 허용하지 않습니다.
export function identifyResource({ method, path } = {}) {
  if (typeof path !== 'string' || !['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return null;
  const match = /^(?:\/api)?\/(notes|notices)(?:\/([A-Za-z0-9_-]+))?$/.exec(path);
  if (!match || ['export', 'import', 'search', 'admin'].includes(match[2])) return null;
  return RESOURCE_IDS[match[1]];
}
