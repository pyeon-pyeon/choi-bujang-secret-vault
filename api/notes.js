import { createClient } from '@supabase/supabase-js';

// 2단계 학습용 공개 함수. 로그인/소유자 검증은 아직 구현하지 않았습니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
  try {
    const client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.from('learning_notes')
      .select('title,content').order('id', { ascending: true }).limit(4);
    if (error || !Array.isArray(data)) {
      return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    }
    return response.status(200).json({
      notes: data.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    // SDK 오류에는 연결 정보가 들어갈 수 있어 응답/로그에 전달하지 않습니다.
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
