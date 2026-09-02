/**
 * 그리기 문제를 기기에서 좁히는 스위치.
 *
 * ## 왜 이런 것이 필요한가
 *
 * 아이패드에서 목록 중간부터 아래가 비고, 누른 카드가 반응하지 않는다.
 * 그런데 **DOM 은 멀쩡하다** — 사파리 엔진(WebKit)으로 같은 흐름을 돌리면
 * 카드 여덟 장이 다 있고, 사진도 다 로드되고, 좌표도 정상이고, 오류도 없다.
 * 헤드리스는 실기기의 GPU 타일링·합성기까지 흉내 내지 못하므로, **이 문제를
 * 볼 수 있는 기계는 그 아이패드뿐이다.**
 *
 * 그러면 방법은 하나다 — 의심되는 것을 하나씩 끄고 그 기기에서 확인한다.
 * 추측으로 고쳐 배포하고 물어보는 것을 반복하는 대신, 한 번에 한 가지씩
 * 끄면서 어느 것이 범인인지 좁힌다.
 *
 * ## 쓰는 법
 *
 *   ?safe=1              의심되는 것 전부 끈다. 이걸로 멀쩡하면 범인은 이 안에 있다.
 *   ?off=photos          도시 사진만 끈다
 *   ?off=sticky,fixed    여러 개를 함께 끈다
 *
 * 켜진 스위치는 진단 기록에 함께 남으므로, 어떤 조합에서 무슨 일이 났는지
 * 나중에도 맞대어 볼 수 있다.
 */

/** 끌 수 있는 것들. 각각 합성 레이어를 만들거나 그리기를 무겁게 하는 후보다. */
export const SWITCHES = [
  { id: 'photos', label: '도시 사진', why: '카드마다 이미지 8장. 합성 레이어와 디코딩 비용.' },
  { id: 'sticky', label: '머리줄 고정', why: 'position: sticky 는 합성 레이어를 만든다.' },
  { id: 'fixed', label: '바닥 막대 고정', why: 'position: fixed 도 마찬가지다.' },
  { id: 'shadow', label: '그림자·둥근 모서리', why: 'overflow:hidden + border-radius + box-shadow 는 클립 레이어를 만든다.' },
  { id: 'preview', label: '1단계 미리보기', why: '도시를 고르면 아래에 새로 붙는 부분.' },
  { id: 'plans', label: '계획 미리 계산', why: '1단계에서도 4단계 계획 3안을 매번 다시 만든다.' },
  { id: 'items', label: '아이템 받아오기', why: '도시를 고르면 그 도시의 장소 목록을 내려받는다.' },
] as const;

export type SwitchId = (typeof SWITCHES)[number]['id'];

let active: Set<string> = new Set();

/** 주소에서 스위치를 읽어 <html> 에 표시로 붙인다. 가장 먼저 부른다. */
export function applyRenderMode(): void {
  try {
    const q = new URLSearchParams(location.search);
    const all = q.get('safe') === '1';
    const list = (q.get('off') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    active = new Set(all ? SWITCHES.map((s) => s.id) : list);
    for (const s of SWITCHES) {
      document.documentElement.classList.toggle(`off-${s.id}`, active.has(s.id));
    }
  } catch {
    /* 주소를 못 읽어도 앱은 그대로 돈다. */
  }
}

export function isOff(id: SwitchId): boolean {
  return active.has(id);
}

/** 지금 켜진 스위치. 진단 기록과 화면 표시에 쓴다. */
export function offList(): string[] {
  return [...active];
}

/** 이 스위치만 끈 주소. 화면에서 눌러 옮겨갈 수 있게 한다. */
export function urlWith(ids: string[]): string {
  const u = new URL(location.href);
  u.searchParams.delete('safe');
  if (ids.length) u.searchParams.set('off', ids.join(','));
  else u.searchParams.delete('off');
  return u.toString();
}
