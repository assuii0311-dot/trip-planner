import type { City, Item } from '../types';
import type { Island } from './data';
import { distanceKm } from './geo';

/**
 * 섬은 도시가 아니라 섬 하나가 여행 단위다.
 *
 * ## 무엇이 문제였나
 *
 * 아이템 수집이 도시 단위였다. 마요르카는 팔마·소예르·포옌사 세 곳만 모았고,
 * 그 섬에서 가장 많이 찾는 곳들은 다른 자치시에 있어 데이터에 아예 없었다 —
 * 발데모사, 데이아, 드라크 동굴, 에스 트렌크, 트라문타나. 빠진 것은 채워
 * 넣었지만(pipeline/island-extras.mjs), 남은 문제가 하나 더 있다.
 *
 * 팔마만 골랐다면 소예르에 붙은 데이아와 트라문타나는 여전히 후보에조차
 * 오르지 않는다. 그런데 섬에서는 사정이 다르다 — 렌터카로 30~40분이면
 * 섬 반대편이고, 실제로 팔마에 묵으며 섬 전체를 돈다. 본토에서라면 다른
 * 도시지만 섬에서는 그냥 '오늘 갈 곳' 이다.
 *
 * ## 어떻게 하나
 *
 * 섬 도시를 하나라도 골랐으면 그 섬의 아이템을 전부 후보로 올리고, 고르지
 * 않은 도시의 아이템은 **가장 가까운 고른 도시로 옮겨 붙인다.** 그래야
 * 플래너가 그 아이템을 그 날의 후보로 본다(플래너는 아이템의 `city` 로
 * 그날 후보를 고른다).
 *
 * 옮겨 붙인 것은 표시를 남겨, 화면에서 '섬 안 · 소예르 방면' 처럼 어디쯤인지
 * 알 수 있게 한다. 팔마 한복판 성당과 40분 떨어진 산마을을 같은 얼굴로
 * 보여 주면 하루를 잘못 짠다.
 */

/** 이 여행에 섬이 끼어 있으면, 그 섬의 도시를 전부 불러와야 한다. */
export function expandIslandScope(slugs: string[], cities: City[], islands: Island[]): string[] {
  const byslug = new Map(cities.map((c) => [c.slug, c]));
  const want = new Set(slugs);
  for (const s of slugs) {
    const island = byslug.get(s)?.island;
    if (!island) continue;
    const def = islands.find((i) => i.id === island);
    for (const c of def?.cities ?? []) want.add(c);
  }
  return [...want];
}

/**
 * 고르지 않은 섬 도시의 아이템을 가장 가까운 고른 도시로 옮겨 붙인다.
 *
 * @param picked 사용자가 실제로 고른 도시 slug
 */
export function rehomeIslandItems(
  items: Item[], cities: City[], islands: Island[], picked: string[],
): Item[] {
  const byslug = new Map(cities.map((c) => [c.slug, c]));
  const chosen = new Set(picked);
  // 섬마다, 고른 도시가 하나라도 있는가.
  const hosts = new Map<string, City[]>();
  for (const i of islands) {
    const mine = i.cities.filter((c) => chosen.has(c)).map((c) => byslug.get(c)).filter((c): c is City => !!c);
    if (mine.length) hosts.set(i.id, mine);
  }
  if (hosts.size === 0) return items;

  return items.map((it) => {
    if (chosen.has(it.city)) return it;
    const from = byslug.get(it.city);
    if (!from?.island) return it;
    const candidates = hosts.get(from.island);
    if (!candidates?.length) return it;

    let host = candidates[0];
    let best = Infinity;
    for (const h of candidates) {
      const d = distanceKm({ lat: from.lat, lon: from.lon }, { lat: h.lat, lon: h.lon });
      if (d < best) { best = d; host = h; }
    }
    return {
      ...it,
      city: host.slug,
      /** 원래 어느 동네 것인지. 화면에서 '섬 안 · 소예르 방면' 으로 쓴다. */
      islandFrom: from.name,
    };
  });
}
