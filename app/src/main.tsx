import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { NotReady } from './NotReady';
import { Crashguard } from './components/Crashguard';
import { clearState, exportState, loadState, setStoreCountry } from './lib/store';
import { setCountry } from './lib/data';
import { currentCountry, homeHref } from './lib/route';
import { startDiag } from './lib/diag';
import { applyRenderMode } from './lib/rendermode';
import './styles.css';

/*
 * 이 페이지가 어느 나라인지부터 정한다.
 *
 * 주소가 정하고(`/trip-planner/spain/`), 저장 자리와 데이터 폴더가 거기에
 * 딸려 온다. 무엇이든 읽기 전에 정해져 있어야 한다 — 늦게 정하면 앞 나라의
 * 자리에서 읽고 뒷 나라의 자리에 쓰는 순간이 생긴다.
 *
 * 나라를 못 알아보는 주소로 들어왔다면(주소를 손으로 고쳤거나, 예전 링크)
 * 나라 고르는 곳으로 돌려보낸다. 아무 나라나 골라 주는 것보다 낫다.
 */
const country = currentCountry();
if (!country) {
  location.replace(homeHref());
} else {
  setCountry(country.slug);
  setStoreCountry(country.slug);
}

// 무엇이든 그리기 전에 켜 둔다. 그려지기 전에 나는 오류가 가장 알기 어렵다.
// 주소의 스위치를 가장 먼저 적용한다. 그려지기 전에 붙어 있어야 한다.
applyRenderMode();
startDiag();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      그리는 중에 오류가 나면 리액트는 트리를 통째로 버린다. 받아 주는 곳이
      없으면 화면이 하얗게 빈다 — 무엇이 잘못됐는지도, 어떻게 빠져나오는지도
      알 수 없는 상태가 된다.
    */}
    <Crashguard
      onExport={() => exportState(loadState())}
      onReset={() => { clearState(); location.reload(); }}
    >
      {/*
        데이터가 아직 없는 나라는 앱을 띄우지 않는다. 띄우면 데이터를
        받으러 갔다가 실패해 '불러오지 못했습니다' 가 뜨는데, 그건 망이
        끊겼다는 말처럼 읽힌다. 아직인 것과 고장난 것은 다른 일이다.
      */}
      {country && country.status === 'soon' ? <NotReady country={country} /> : <App />}
    </Crashguard>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    /*
     * 이미 예전 워커가 이 페이지를 쥐고 있었는가.
     *
     * 그렇다면 이번 화면은 예전 워커가 내주는 것들로 그려진다 — 새 코드가
     * 예전 캐시의 데이터를 읽는, 딱 한 번의 어긋난 상태다. 새 워커가
     * 넘겨받는 순간 한 번만 다시 불러 그 어긋남을 끝낸다.
     */
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloaded) return;
      reloaded = true;
      location.reload();
    });
    // 주소에 판 번호를 붙인다. 배포마다 주소가 달라져야 워커가 다시 설치되고,
    // 그래야 예전 캐시가 지워진다. 고정 주소로 두면 몇 주 전 데이터가 남는다.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`).catch(() => {
      /* 서비스 워커 등록 실패는 앱 사용을 막지 않는다. */
    });
  });
}
