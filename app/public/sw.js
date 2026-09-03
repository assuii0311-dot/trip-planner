/*
 * 오프라인 지원 — 앱 셸과 도시 데이터를 캐시해 비행기와 로밍 없는 곳에서도
 * 일정을 볼 수 있게 한다.
 *
 * ## 예전에 무엇이 잘못됐나
 *
 * 캐시 이름이 'trip-planner-v1' 로 고정이었다. 그런데 이름이 바뀌지 않으면
 * activate 의 청소가 아무것도 지우지 않는다. 게다가 정적 자원과 데이터를
 * 모두 '캐시에 있으면 그것' 으로 돌려줬으므로,
 *
 *   - 한 번 받아 둔 data/spain.json 은 새 배포가 나가도 영원히 그대로였고,
 *   - 자바스크립트만 새것으로 바뀌어, 새 코드가 몇 주 전 데이터를 읽었다.
 *
 * 화면이 비거나 눌러도 반응이 없는 상태가 여기서 나온다.
 *
 * ## 지금
 *
 * 1. 캐시 이름에 배포 판 번호를 넣는다(register 할 때 ?v= 로 받는다).
 *    새 배포가 나가면 워커 주소가 달라져 다시 설치되고, activate 에서
 *    예전 캐시를 통째로 지운다. 낡은 데이터가 남을 자리가 없다.
 * 2. 데이터(data/)는 망 우선이다. 새것이 있으면 새것을 쓰고, 못 받으면
 *    캐시에 있는 것으로 버틴다. 오프라인은 그대로 되고 낡지는 않는다.
 * 3. assets/ 의 파일 이름에는 내용 해시가 붙는다. 내용이 바뀌면 이름이
 *    바뀌므로 이것만 캐시 우선으로 둔다.
 */
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `trip-planner-${V}`;
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([SCOPE]))
      // 셸을 못 받아도 설치는 넘어간다. 워커 하나 때문에 앱이 막히면 안 된다.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * 이 주소가 속한 나라 페이지의 셸.
 *
 *   /trip-planner/spain/        → /trip-planner/spain/
 *   /trip-planner/spain/?safe=1 → /trip-planner/spain/
 *   /trip-planner/              → /trip-planner/
 *
 * 나라 목록을 여기 적지 않는다. 적으면 나라를 붙일 때마다 워커도 같이
 * 고쳐야 하고, 잊으면 그 나라만 오프라인에서 엉뚱한 화면이 뜬다.
 */
function shellOf(url) {
  const rest = url.pathname.startsWith(SCOPE) ? url.pathname.slice(SCOPE.length) : '';
  const first = rest.split('/').filter(Boolean)[0];
  return first ? `${SCOPE}${first}/` : SCOPE;
}

/** 받아 온 것을 캐시에 넣어 둔다(넣기에 실패해도 응답은 그대로 돌려준다). */
function keep(request, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /*
   * 문서는 망 우선 — 새 배포를 바로 받는다.
   *
   * 망이 없을 때 무엇을 대신 내주는가가 나라를 쪼개면서 달라졌다. 예전에는
   * 언제나 SCOPE(맨 앞 페이지)를 내줬는데, 이제 그건 '나라 고르는 곳' 이다.
   * 비행기 안에서 /spain/ 을 열었는데 나라 고르는 화면이 나오면 계획을 볼
   * 방법이 없다. 그래서 그 페이지 → 그 나라 셸 → 맨 앞 순으로 찾는다.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => keep(request, res))
        .catch(() => caches.match(request)
          .then((r) => r ?? caches.match(shellOf(url)))
          .then((r) => r ?? caches.match(SCOPE))
          .then((r) => r ?? Response.error())),
    );
    return;
  }

  // 데이터는 망 우선, 캐시는 오프라인 대비.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(request)
        .then((res) => keep(request, res))
        .catch(() => caches.match(request).then((r) => r ?? Response.error())),
    );
    return;
  }

  // 이름에 해시가 붙는 자원과 사진은 캐시 우선.
  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((res) => keep(request, res))),
  );
});
