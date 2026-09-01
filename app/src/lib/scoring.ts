import type { Item, Preferences, Priorities } from '../types';

/**
 * 별점(3단계) 가중치.
 *
 * 0(또는 별을 준 적 없음)은 가산이 없을 뿐이고, 취향 점수만으로 후보에는
 * 남는다. 실제로 후보에서 빼는 것은 플래너 쪽이다 — 우선순위에 0 이
 * 적혀 있으면 4단계에서 뺀 것으로 보고 후보에서 제외한다(lib/planner.ts).
 */
const STAR_WEIGHT: Record<number, number> = { 1: 18, 2: 40, 3: 75 };

const BUDGET_CEILING: Record<Preferences['budget'], number> = { low: 15, mid: 40, high: 120 };

/**
 * 아이템 점수.
 * 3단계 별점이 가장 큰 축이고, 2단계 취향이 그다음이다.
 * 별점을 주지 않은 아이템도 취향만으로 후보에 남아 3개 옵션의 다양성을 만든다.
 */
export function scoreItem(item: Item, prefs: Preferences, priorities: Priorities): number {
  const star = priorities[item.id] ?? 0;
  let score = STAR_WEIGHT[star] ?? 0;

  score += (prefs.themes[item.theme] ?? 0) * 12;

  // 유명한 곳 ↔ 숨은 곳.
  // 기본값에서는 대표 명소가 앞에 와야 한다 — 처음 가는 도시에서 이름 모를
  // 동네 성당이 사그라다 파밀리아보다 위에 오면 목록을 신뢰할 수 없다.
  // discovery 를 올리면 이 계수가 음수로 뒤집혀 숨은 곳이 앞으로 나온다.
  const discoveryBias = (prefs.discovery - 1.5) / 1.5;
  score += (item.popularity - 2.5) * (6 - discoveryBias * 10);

  // 예산: 상한을 넘는 만큼 감점하고, 무료는 소폭 가산.
  const ceiling = BUDGET_CEILING[prefs.budget];
  if (item.priceEur !== null) {
    if (item.priceEur > ceiling) score -= Math.min(30, (item.priceEur - ceiling) * 1.2);
    else if (item.priceEur === 0) score += 4;
  }

  // 체력. 동행자와 이동 성향을 함께 본다.
  const energyBudget = prefs.mobility === 'limited' ? 2 : Math.min(5, 1 + prefs.pace);
  if (item.energy > energyBudget) score -= (item.energy - energyBudget) * 9;

  if (item.theme === 'nightlife') score += (prefs.nightlife - 1.5) * 10;
  if (prefs.photo >= 2 && (item.theme === 'landmark' || item.theme === 'nature')) score += prefs.photo * 3;
  if (prefs.companion === 'family' && item.energy >= 4) score -= 8;
  if (prefs.companion === 'parents' && item.energy >= 4) score -= 12;
  if (prefs.walkTolerance <= 2 && !item.indoor) score -= 3;

  // 음식 취향 태그가 겹치면 가산.
  if (item.theme === 'food' || item.theme === 'nightlife') {
    const hits = prefs.foodStyles.filter((s) => item.tags.includes(s)).length;
    score += hits * 9;
  }

  return score;
}

export interface ScoredItem { item: Item; score: number; star: number }

export function rankItems(items: Item[], prefs: Preferences, priorities: Priorities): ScoredItem[] {
  return items
    .map((item) => ({ item, score: scoreItem(item, prefs, priorities), star: priorities[item.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
