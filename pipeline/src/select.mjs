/**
 * Pick which items ship for a city.
 *
 * Ranking by popularity alone and slicing to the cap looked reasonable and was
 * badly wrong: restaurants rarely have a Wikidata item, so they scored lowest
 * and Barcelona shipped 70 items with zero food — leaving the planner unable
 * to fill a single lunch slot. Themes therefore get floors first, and only the
 * leftover budget is handed out by popularity.
 */

/** 계획을 짜려면 최소한 이만큼은 있어야 하는 테마별 하한. */
const FLOORS = {
  hub:       { food: 14, history: 8, art: 7, landmark: 7, nature: 5, activity: 5, nightlife: 5, shopping: 3 },
  satellite: { food: 7,  history: 5, art: 3, landmark: 4, nature: 3, activity: 2, nightlife: 2, shopping: 2 },
};

/** 설명이 길고 좌표가 있는 항목이 실제로 쓸모가 크다. */
function quality(item) {
  const desc = item.descEn ?? item.desc ?? '';
  return item.popularity * 10
    + Math.min(desc.length, 300) / 30
    + (item.lat !== null ? 4 : 0)
    + (item.priceEur !== null ? 2 : 0);
}

/**
 * No single theme may take more than this share of a city.
 * Girona's article is mostly restaurants; without a ceiling it shipped 25 food
 * items out of 40 and the planner had nothing to put between the meals.
 */
const THEME_SHARE_CEILING = 0.3;

export function selectBalanced(items, cap, isHub) {
  const floors = FLOORS[isHub ? 'hub' : 'satellite'];
  // 상한이 아니라 실제로 뽑히는 개수를 기준으로 잡는다. 카다케스처럼
  // 후보가 28개뿐인 도시에서 상한 40을 기준으로 삼으면 한 테마가 절반을
  // 차지해도 걸리지 않는다.
  const ceiling = Math.max(4, Math.round(Math.min(cap, items.length) * THEME_SHARE_CEILING));
  const byTheme = new Map();
  for (const item of items) {
    const list = byTheme.get(item.theme) ?? [];
    list.push(item);
    byTheme.set(item.theme, list);
  }
  for (const list of byTheme.values()) list.sort((a, b) => quality(b) - quality(a));

  const chosen = [];
  const taken = new Map();

  // 1) 테마별 하한을 먼저 채운다.
  for (const [theme, floor] of Object.entries(floors)) {
    const list = byTheme.get(theme) ?? [];
    const n = Math.min(floor, list.length);
    chosen.push(...list.slice(0, n));
    taken.set(theme, n);
  }

  // 2) 남은 자리는 품질 순으로 채우되, 한 테마가 전체를 잠식하지 않게 막는다.
  const rest = [];
  for (const [theme, list] of byTheme) rest.push(...list.slice(taken.get(theme) ?? 0));
  rest.sort((a, b) => quality(b) - quality(a));
  for (const item of rest) {
    if (chosen.length >= cap) break;
    const used = taken.get(item.theme) ?? 0;
    if (used >= ceiling) continue;
    chosen.push(item);
    taken.set(item.theme, used + 1);
  }

  // 3) 하한 합계가 상한을 넘었다면 품질이 낮은 쪽부터 덜어낸다.
  //    단 테마당 최소 2개는 남겨 3단계 목록이 비지 않게 한다.
  if (chosen.length > cap) {
    const counts = new Map();
    for (const it of chosen) counts.set(it.theme, (counts.get(it.theme) ?? 0) + 1);
    const ordered = [...chosen].sort((a, b) => quality(a) - quality(b));
    const drop = new Set();
    for (const it of ordered) {
      if (chosen.length - drop.size <= cap) break;
      if ((counts.get(it.theme) ?? 0) <= 2) continue;
      drop.add(it.id);
      counts.set(it.theme, counts.get(it.theme) - 1);
    }
    return chosen.filter((it) => !drop.has(it.id));
  }
  return chosen;
}
