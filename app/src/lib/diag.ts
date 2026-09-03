/**
 * 진단 기록.
 *
 * 아이패드 사파리는 맥에 연결하지 않으면 콘솔을 볼 수 없다. 그러니 사용자가
 * 겪은 것을 알아낼 방법은 **앱이 스스로 남기는 것**뿐이다.
 *
 * 무엇을 남기는가가 중요하다. '버튼이 안 눌린다' 는 두 가지가 전혀 다른
 * 일인데 화면만 봐서는 구별되지 않는다.
 *
 *   ① 손가락이 그 버튼에 닿지도 않는다 — 무언가가 위를 덮고 있다
 *   ② 닿기는 하는데 아무 일도 일어나지 않는다 — 코드가 터졌거나 막혔다
 *
 * 그래서 누른 자리에 실제로 무엇이 있었는지(캡처 단계에서 가로채 기록)와,
 * 앱의 처리기가 실제로 돌았는지(`mark`)를 나란히 남긴다. 둘을 맞대 보면
 * 어느 쪽인지 바로 갈린다.
 *
 * 개인적인 것은 남기지 않는다 — 누른 자리와 오류 문구, 브라우저 종류뿐이다.
 */

import { offList } from './rendermode';
import { entrySrcs } from './update';

export interface DiagEntry {
  t: number;
  kind: 'tap' | 'act' | 'err' | 'info' | 'stall';
  text: string;
}

const MAX = 400;
/*
 * localStorage 다. sessionStorage 는 탭을 닫으면 사라진다.
 *
 * 화면이 멈추거나 검게 되면 페이지를 누를 수가 없다. 그때 사용자가 할 수
 * 있는 것은 새로고침이나 탭을 닫고 다시 여는 것뿐인데, 그 순간 기록이
 * 사라지면 정작 알고 싶은 순간이 영영 남지 않는다. 기록은 앱보다 오래
 * 살아남아야 한다.
 */
const KEY = 'trip-planner.diag';
let log: DiagEntry[] = [];
let started = 0;

/*
 * 기록은 페이지를 넘어 살아남아야 한다.
 *
 * 처음에는 메모리에만 담았다. 그런데 문제 찾기 스위치를 누르면 주소가 바뀌며
 * 페이지가 새로 열리고, 그 순간 기록이 통째로 지워졌다. 실제로 사용자가 보내
 * 준 기록은 두 줄뿐이었다 — '열림' 과 '진단 패널을 눌렀다'. 정작 재현하실 때
 * 누른 것은 하나도 남지 않았다. 필요한 순간을 못 담는 계기는 계기가 아니다.
 *
 * 그래서 저장해 두고 다음 페이지에서 이어 붙인다. 열 때마다 구분선을 넣어
 * 어디서 페이지가 바뀌었는지 알아볼 수 있게 한다.
 */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(log.slice(-MAX))); } catch { /* 못 써도 앱은 돈다 */ }
}

function restore(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

function push(kind: DiagEntry['kind'], text: string) {
  log.push({ t: Date.now() - started, kind, text });
  if (log.length > MAX) log.splice(0, log.length - MAX);
  persist();
}

/** 기록을 비운다. 새로 재현해 볼 때 앞의 것이 섞이지 않게. */
export function clearDiag(): void {
  log = [];
  persist();
}

/** 눌린 요소를 짧게 적는다. 무엇을 눌렀는지 알아볼 정도만. */
function describe(el: Element | null): string {
  if (!el) return '(없음)';
  const parts: string[] = [];
  for (let e: Element | null = el; e && parts.length < 3; e = e.parentElement) {
    const cls = typeof e.className === 'string' && e.className
      ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    parts.push(e.tagName.toLowerCase() + cls);
  }
  const label = (el as HTMLElement).innerText?.trim().slice(0, 24).replace(/\s+/g, ' ');
  return parts.join(' < ') + (label ? ` "${label}"` : '');
}

/** 앱이 실제로 무언가를 했다는 표시. 눌림 기록과 맞대어 본다. */
export function mark(what: string): void {
  push('act', what);
}

export function note(what: string): void {
  push('info', what);
}

let installed = false;

export function startDiag(): void {
  if (installed) return;
  installed = true;
  started = Date.now();

  // 앞 페이지의 기록을 이어받는다. 스위치를 누르면 페이지가 새로 열리는데,
  // 그때 지워지면 정작 필요한 순간이 남지 않는다.
  log = restore();
  push('info', `─── 페이지 열림 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })} · ${location.search || '(스위치 없음)'}`);

  /*
   * 캡처 단계에서 듣는다. 버블링으로 듣다가는, 위에 덮인 무언가가 이벤트를
   * 막아 버리면 기록조차 남지 않는다 — 그게 정확히 알고 싶은 경우다.
   */
  const tap = (e: Event) => {
    const p = e as PointerEvent;
    const at = document.elementFromPoint(p.clientX ?? 0, p.clientY ?? 0);
    const hit = describe(at);
    const aimed = describe(e.target as Element);
    push('tap', hit === aimed ? hit : `${aimed}  ← 실제로 닿은 곳: ${hit}`);
  };
  window.addEventListener('pointerdown', tap, true);
  // 사파리는 상황에 따라 pointer 이벤트가 오지 않을 수 있다. 터치도 함께 본다.
  window.addEventListener('touchstart', (e) => {
    const t = (e as TouchEvent).touches[0];
    if (!t) return;
    push('tap', `touch ${describe(document.elementFromPoint(t.clientX, t.clientY))}`);
  }, true);

  window.addEventListener('error', (e) => {
    const err = (e as ErrorEvent).error as Error | undefined;
    push('err', `${(e as ErrorEvent).message}\n${err?.stack?.split('\n').slice(0, 4).join('\n') ?? ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason as Error | string;
    push('err', `처리되지 않은 거절: ${r instanceof Error ? `${r.message}\n${r.stack?.split('\n').slice(0, 4).join('\n')}` : String(r)}`);
  });

  /*
   * 멈춤 감시자.
   *
   * 화면이 멈추거나 검게 되면 사용자는 아무것도 누를 수 없다. 그러니 그
   * 순간을 **앱이 스스로** 적어야 한다. 두 가지를 따로 본다 — 둘이 갈라져야
   * 원인이 갈린다.
   *
   *   ① 심장박동(setInterval) 이 멈춘다  → 메인 스레드가 막혔다 (자바스크립트)
   *   ② 심장박동은 도는데 그리기(rAF) 만 멈춘다 → 합성기·그리기 층이 죽었다
   *
   * ②가 바로 '커서는 카드 위에 있는데 눌리지 않고 화면이 빈다' 의 모양이다.
   * 지금까지 이것을 구별할 방법이 없었다.
   */
  let lastBeat = Date.now();
  let lastPaint = Date.now();
  let beats = 0;

  setInterval(() => {
    const now = Date.now();
    const gap = now - lastBeat;
    lastBeat = now;
    beats++;
    // 200ms 마다 도는데 1.5초가 넘게 비었으면 그동안 메인 스레드가 막혔다.
    if (gap > 1500) push('stall', `자바스크립트가 ${(gap / 1000).toFixed(1)}초 멈췄습니다 (메인 스레드 막힘)`);
    // 심장은 뛰는데 그리기가 오래 멈췄으면 그리기 층의 문제다.
    if (document.visibilityState === 'visible' && now - lastPaint > 3000) {
      push('stall', `그리기가 ${((now - lastPaint) / 1000).toFixed(1)}초 멈췄습니다 (자바스크립트는 도는 중)`);
      lastPaint = now;
    }
  }, 200);

  const beat = () => { lastPaint = Date.now(); requestAnimationFrame(beat); };
  requestAnimationFrame(beat);

  // 페이지를 떠날 때 마지막 상태를 남긴다. 새로고침·탭 닫기 직전이 그때다.
  // 두 이벤트가 다 오는 브라우저가 있으므로 한 번만 적는다.
  let said = false;
  const bye = () => {
    if (said) return;
    said = true;
    push('info', `─── 페이지 떠남 (심장 ${beats}회)`);
  };
  window.addEventListener('pagehide', bye);
  window.addEventListener('beforeunload', bye);

  // console.error 도 담는다. 리액트가 내는 경고가 단서가 되는 일이 많다.
  const real = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push('err', args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack?.split('\n').slice(0, 3).join('\n')}` : String(a))).join(' ').slice(0, 600));
    real(...args);
  };
}

/** 지금 브라우저·저장 상태. 어떤 기기에서 난 일인지 알아야 한다. */
async function environment(): Promise<string> {
  const lines: string[] = [];
  lines.push(`주소     ${location.href}`);
  lines.push(`브라우저 ${navigator.userAgent}`);
  lines.push(`화면     ${window.innerWidth}x${window.innerHeight} · 배율 ${window.devicePixelRatio} · 터치 ${navigator.maxTouchPoints}`);
  lines.push(`언어     ${navigator.language} · 온라인 ${navigator.onLine}`);
  lines.push(`끈 것    ${offList().join(', ') || '없음 (평소 모드)'}`);
  try {
    /*
     * 서버에 올라가 있는 판과 지금 도는 판. 둘이 다르면 낡은 것을 쓰는 중이다.
     * 파일 이름(`index-*`)을 박아 두지 않는다 — 빌드가 이름을 바꾸면 이 줄이
     * 말없이 쓸모없어지고, 그게 정확히 예전에 놓친 고장이다. 문서가 실제로
     * 부르는 진입 스크립트를 본다.
     */
    const html = await (await fetch(location.href, { cache: 'no-store' })).text();
    const served = entrySrcs(html).map((x) => x.split('/').pop()).sort();
    lines.push(`화면판   ${served.join(' · ') || '(모름)'}`);
  } catch { lines.push('화면판   (확인 실패)'); }
  try {
    const running = [...document.querySelectorAll('script[type="module"][src]')]
      .map((el) => (el.getAttribute('src') ?? '').split('/').pop())
      .filter(Boolean).sort();
    lines.push(`실행판   ${running.join(' · ') || '(모름)'}`);
  } catch { /* noop */ }
  try {
    const keys = 'caches' in window ? await caches.keys() : [];
    lines.push(`캐시     ${keys.join(', ') || '없음'}`);
  } catch { lines.push('캐시     (확인 실패)'); }
  try {
    const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    lines.push(`워커     ${regs.map((r) => (r.active?.scriptURL ?? '').split('/').pop()).join(', ') || '없음'}`);
  } catch { lines.push('워커     (확인 실패)'); }
  try {
    const raw = localStorage.getItem('trip-planner.v1');
    lines.push(`저장분   ${raw ? `${raw.length}자` : '없음'}`);
  } catch { lines.push('저장분   (읽기 실패)'); }
  return lines.join('\n');
}

/** 개발자에게 보낼 한 덩어리. */
export async function diagReport(): Promise<string> {
  const env = await environment();
  const body = log.map((e) => {
    const s = (e.t / 1000).toFixed(1).padStart(6);
    const tag = { tap: '눌림', act: '동작', err: '오류', info: '정보', stall: '멈춤' }[e.kind];
    return `${s}s ${tag} ${e.text}`;
  }).join('\n');
  return `=== 여행 계획 진단 ===\n${env}\n\n=== 기록 (${log.length}줄) ===\n${body || '(빈 기록)'}\n`;
}

/**
 * 직전 화면에서 이상이 있었는가.
 *
 * 화면이 죽으면 진단을 누를 수 없다. 그러니 다시 열었을 때 앱이 먼저
 * "직전에 이런 일이 있었습니다" 라고 말해 주어야 한다. 그래야 그때 보낼 수
 * 있다. 사용자가 문제를 기억해 두었다가 찾아 들어오게 만들면 안 된다.
 */
export function lastRunTrouble(): { stalls: number; errors: number; when: string } | null {
  const prev = log.filter((e) => e.kind === 'stall' || e.kind === 'err');
  if (!prev.length) return null;
  /*
    이번 페이지가 열린 뒤의 것은 뺀다 — 지금 화면의 문제는 지금 보면 된다.
    (findLastIndex 는 쓰지 않는다. 예전 사파리에 없다.)
  */
  let opened = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].kind === 'info' && log[i].text.startsWith('─── 페이지 열림')) { opened = i; break; }
  }
  const before = opened > 0 ? log.slice(0, opened) : [];
  const stalls = before.filter((e) => e.kind === 'stall').length;
  const errors = before.filter((e) => e.kind === 'err').length;
  if (!stalls && !errors) return null;
  let when = '직전';
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i].kind === 'info' && before[i].text.includes('페이지 열림')) {
      when = (before[i].text.match(/\d\d:\d\d:\d\d/) ?? ['직전'])[0];
      break;
    }
  }
  return { stalls, errors, when };
}
