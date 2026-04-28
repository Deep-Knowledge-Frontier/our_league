const CACHE_NAME = 'uri-league-v7'; // 진단 로그 제거 + SW catch 안정화
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
];

// 설치: 기본 리소스 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 🆕 http(s) 가 아닌 스킴(chrome-extension://, file://, data: 등)은 캐싱 불가 → 패스
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // GET 요청만 캐싱 (POST/PUT 등은 Cache API에 저장 불가)
  if (event.request.method !== 'GET') {
    return;
  }

  // Firebase/API 요청은 캐시하지 않음
  if (url.includes('firebaseio.com') ||
      url.includes('googleapis.com') ||
      url.includes('firebaseapp.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공한 동일 출처 응답만 캐시에 저장 (opaque/cors 응답 등은 제외)
        if (response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {
              // 캐시 저장 실패는 조용히 무시 (e.g. 비표준 스킴, quota 초과 등)
            });
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
