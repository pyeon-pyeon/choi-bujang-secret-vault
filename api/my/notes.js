import notesHandler from '../notes.js';

// 본인 목록 전용 주소. 단건 선택값을 넘기지 않으며 기존 로그인·소유자 검사를 재사용합니다.
export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  return notesHandler({ method: request.method, headers: request.headers, query: {} }, response);
}
