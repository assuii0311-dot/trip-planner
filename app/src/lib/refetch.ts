/**
 * 받아 둔 것을 모두 비우고 새로 받는다.
 *
 * 서비스 워커가 예전 배포의 데이터를 쥐고 있으면, 새 코드가 몇 주 전
 * 데이터를 읽는 상태가 된다. 그때 나는 고장은 새로고침으로 풀리지 않는다 —
 * 캐시가 그대로이기 때문이다. 워커를 내리고 캐시를 지운 뒤 다시 받는다.
 *
 * 브라우저에 저장된 계획(localStorage)은 건드리지 않는다. 고치자고 사용자의
 * 일정을 지울 수는 없다.
 */
export async function hardRefetch(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* 비우지 못해도 새로고침은 해 본다. */
  }
  location.reload();
}
