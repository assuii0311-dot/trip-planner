import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Crashguard } from './components/Crashguard';
import { clearState, exportState, loadState } from './lib/store';
import { startDiag } from './lib/diag';
import './styles.css';

// 무엇이든 그리기 전에 켜 둔다. 그려지기 전에 나는 오류가 가장 알기 어렵다.
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
      <App />
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
