import type { Item, Preferences } from '../types';

/** 고를 수 있는 아침 시작 시각의 범위와 눈금(분). */
export const DAY_START_MIN = 6 * 60;
export const DAY_START_MAX = 11 * 60 + 30;
export const DAY_START_STEP = 30;
export const DAY_START_DEFAULT = 9 * 60 + 30;

/**
 * 눈금에 맞춰 범위 안으로 당긴다.
 *
 * 숫자가 아닌 값도 받는다. 이 자리에는 예전에 `'normal'` 같은 글자가
 * 들어 있었고, 저장분을 옮기지 않고 들어오는 길(예전 검사 스크립트)이
 * 있으면 계산이 통째로 NaN 이 된다 — 그러면 하루 활동 시간이 NaN 이 되고
 * 계획이 조용히 비어 버린다. 모르는 값은 기본값으로 본다.
 */
export const clampDayStart = (min: number): number =>
  (Number.isFinite(min)
    ? Math.min(DAY_START_MAX, Math.max(DAY_START_MIN, Math.round(min / DAY_START_STEP) * DAY_START_STEP))
    : DAY_START_DEFAULT);

/**
 * 하루에 실제로 쓸 수 있는 활동 시간(분).
 *
 * 아침 시작 시각과 속도 취향으로 정한다. 이동·줄서기·쉬는 시간이 들어갈
 * 자리를 남겨야 하므로, 깨어 있는 시간을 그대로 쓰지 않는다.
 *
 * 세 칸이던 시절의 값이 기준점이다 — 08:00 에 9시간, 09:30 에 8시간,
 * 11:00 에 6시간 30분. 실측으로 정해 둔 값이라 그대로 지나가게 두고,
 * 사이는 직선으로 잇는다.
 *
 * **세 점은 한 직선 위에 있지 않다.** 앞 구간은 90분 늦어질 때 60분이
 * 줄고(기울기 ⅔), 뒤 구간은 90분에 90분이 준다(기울기 1). 늦게 나설수록
 * 손해가 커지는 모양이고, 실제로도 11시에 나서면 오전이 통째로 없다.
 * 한 직선으로 뭉개면 11:00 이 예전보다 30분 넉넉해진다.
 */
const DAY_START_ANCHORS: [min: number, active: number][] = [
  [8 * 60, 9 * 60],
  [9 * 60 + 30, 8 * 60],
  [11 * 60, 6.5 * 60],
];

/** 앵커 사이는 직선으로, 바깥은 가장 가까운 구간의 기울기를 이어서. */
function activeBase(start: number): number {
  const [[m0, a0], [m1, a1], [m2, a2]] = DAY_START_ANCHORS;
  const lerp = (x: number, xa: number, ya: number, xb: number, yb: number) =>
    ya + ((x - xa) / (xb - xa)) * (yb - ya);
  return start <= m1 ? lerp(start, m0, a0, m1, a1) : lerp(start, m1, a1, m2, a2);
}

export function dailyMinutes(prefs: Preferences): number {
  const base = Math.max(4 * 60, activeBase(clampDayStart(prefs.dayStart)));
  // pace 1(느긋) ~ 5(빡빡). 3이 기준.
  return Math.round(base * (0.78 + prefs.pace * 0.09));
}

/**
 * 아이템 하나가 실제로 잡아먹는 시간.
 * 머무는 시간에 더해 다음 장소로 옮기고 자리를 잡는 시간을 얹는다.
 * 같은 도시 안 이동이라 크지 않지만, 열 곳이면 두 시간이 넘는다.
 */
const OVERHEAD_MIN = 18;

export function itemMinutes(item: Item): number {
  return item.durationMin + OVERHEAD_MIN;
}

/**
 * 식사인가 — 일정을 늘리지 않고 동선이 만드는 끼니 자리에 들어갈 것인가.
 *
 * 점심과 저녁은 어차피 먹는다. 식당을 열 곳 담았다고 여행이 길어지지
 * 않는데, 예전에는 미식이 소요 일수의 11~28%(세비야 28%)를 차지해 숙박일과
 * 거점 판정까지 밀고 올라갔다. 식당 때문에 하룻밤이 더 잡히는 것은
 * 계획이 아니라 계산 실수다.
 *
 * 간식은 다르다. 츄러스 한 접시는 끼니가 아니라 오전·오후에 끼워 넣는
 * 일정이라 시간을 실제로 쓴다.
 */
export function isMeal(item: Item): boolean {
  if (item.theme !== 'food') return false;
  // 오전·오후에도 갈 수 있다고 적힌 곳은 간식으로 본다.
  const snack = item.bestSlots.some((s) => s === 'morning' || s === 'afternoon');
  return !snack;
}

/**
 * 고른 아이템으로 며칠이 필요한지.
 *
 * 3단계에서 담을 때마다 바로 보여 주는 값이다. 정확한 배치는 4단계 계획이
 * 하지만, 담는 동안 '지금 며칠치인가'를 모르면 20일치를 담아 놓고 7일
 * 일정에서 잘려 나가는 것을 마지막에야 알게 된다.
 *
 * 식사는 세지 않는다 — 위 {@link isMeal} 참고.
 */
export function estimateDays(items: Item[], prefs: Preferences): number {
  const counted = items.filter((i) => !isMeal(i));
  if (!counted.length) return 0;
  const total = counted.reduce((a, i) => a + itemMinutes(i), 0);
  /*
   * 하한이 1 이었다. 그래서 두 곳만 담아도 '1일' 로 나왔고, 반나절 근교를
   * 표현할 수가 없었다. 하루가 한 도시라는 전제가 여기에도 박혀 있었다.
   */
  return Math.max(0.5, Math.round((total / dailyMinutes(prefs)) * 10) / 10);
}

/** 하루에 몇 곳이 들어가는지. 식사는 빼고 센다. */
export function itemsPerDay(items: Item[], prefs: Preferences): number {
  const counted = items.filter((i) => !isMeal(i));
  if (!counted.length) return 4;
  const avg = counted.reduce((a, i) => a + itemMinutes(i), 0) / counted.length;
  return Math.max(2, Math.round(dailyMinutes(prefs) / avg));
}
