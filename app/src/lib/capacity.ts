import type { Item, Preferences } from '../types';

/**
 * 하루에 실제로 쓸 수 있는 활동 시간(분).
 *
 * 아침 시작 시각과 속도 취향으로 정한다. 이동·줄서기·쉬는 시간이 들어갈
 * 자리를 남겨야 하므로, 깨어 있는 시간을 그대로 쓰지 않는다.
 */
export function dailyMinutes(prefs: Preferences): number {
  const base = { early: 9 * 60, normal: 8 * 60, late: 6.5 * 60 }[prefs.dayStart];
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
 * 고른 아이템으로 며칠이 필요한지.
 *
 * 3단계에서 담을 때마다 바로 보여 주는 값이다. 정확한 배치는 4단계 계획이
 * 하지만, 담는 동안 '지금 며칠치인가'를 모르면 20일치를 담아 놓고 7일
 * 일정에서 잘려 나가는 것을 마지막에야 알게 된다.
 */
export function estimateDays(items: Item[], prefs: Preferences): number {
  if (!items.length) return 0;
  const total = items.reduce((a, i) => a + itemMinutes(i), 0);
  return Math.max(1, Math.round((total / dailyMinutes(prefs)) * 10) / 10);
}

/** 하루에 몇 곳이 들어가는지 — 코스 크기를 정할 때 쓴다. */
export function itemsPerDay(items: Item[], prefs: Preferences): number {
  if (!items.length) return 4;
  const avg = items.reduce((a, i) => a + itemMinutes(i), 0) / items.length;
  return Math.max(2, Math.round(dailyMinutes(prefs) / avg));
}
