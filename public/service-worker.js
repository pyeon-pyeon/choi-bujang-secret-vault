const OFFLINE_CACHE = 'vault-offline-guide-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add('/offline.html')));
});
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API·인증·메모 요청은 가로채거나 저장하지 않습니다. 첫 화면 연결 실패만 안내합니다.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate'
      || url.origin !== self.location.origin || url.pathname !== '/') return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await (await caches.open(OFFLINE_CACHE)).match('/offline.html'))
      || new Response('오프라인입니다. 연결 후 내 자료실에 다시 접속하세요.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
