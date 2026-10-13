// 엔진이 검증한 service와 route를 받는 서버용 자원 구분입니다.
// 브라우저의 resourceId·헤더·본문을 신뢰하거나 새 요청 필드를 만들지 않습니다.
export const RESOURCE_IDS = Object.freeze({ notes: 'notes', notices: 'notices' });

export function identifyResource(request) {
  const service = request?.service;
  if (service !== 'notes' && service !== 'notices') return null;
  const method = request.method;
  const base = `/${service}`;
  const collection = request.path === base
    && request.route === `${method} ${base}`;
  if (collection && (method === 'GET' || (service === 'notes' && method === 'POST'))) {
    return RESOURCE_IDS[service];
  }
  // 현재 실제 메모 ID는 UUID이며 demo는 제공 엔진의 가상 시험 ID입니다.
  // 기능 경로·중첩 경로·인코딩된 경로·쿼리를 자료 ID로 받지 않습니다.
  const id = typeof request.path === 'string' && request.path.startsWith(`${base}/`)
    ? request.path.slice(base.length + 1) : '';
  const validId = id === 'demo'
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return validId && ['GET', 'PUT', 'DELETE'].includes(method)
    && request.route === `${method} ${base}/:id` ? RESOURCE_IDS[service] : null;
}
