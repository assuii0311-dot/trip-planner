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

export interface DiagEntry {
  t: number;
  kind: 'tap' | 'act' | 'err' | 'info';
  text: string;
}

const MAX = 300;
const log: DiagEntry[] = [];
let started = 0;

function push(kind: DiagEntry['kind'], text: string) {
  log.push({ t: Date.now() - started, kind, text });
  if (log.length > MAX) log.splice(0, log.length - MAX);
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

  push('info', `열림 ${new Date().toISOString()}`);

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
  try {
    const html = await (await fetch(location.href, { cache: 'no-store' })).text();
    const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
    lines.push(`화면판   ${m ? m[0] : '(모름)'}`);
  } catch { lines.push('화면판   (확인 실패)'); }
  try {
    const script = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).join(', ');
    lines.push(`실행판   ${script}`);
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
    const tag = { tap: '눌림', act: '동작', err: '오류', info: '정보' }[e.kind];
    return `${s}s ${tag} ${e.text}`;
  }).join('\n');
  return `=== 여행 계획 진단 ===\n${env}\n\n=== 기록 (${log.length}줄) ===\n${body || '(빈 기록)'}\n`;
}
