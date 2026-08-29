// 오프라인 지원: 앱 셸과 도시 데이터를 캐시해 비행기와 로밍 없는 환경에서도 일정을 볼 수 있게 한다.
const CACHE = 'trip-planner-v1';
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, `${SCOPE}manifest.webmanifest`])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 문서 요청은 네트워크 우선 — 새 배포를 바로 받도록.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(SCOPE).then((r) => r ?? Response.error())),
    );
    return;
  }

  // 정적 자원과 도시 데이터는 캐시 우선 — 현지에서 빠르고 오프라인에서도 열린다.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});
