import type { City, Item, Preferences } from '../types';
import { THEMES } from './themes';
import { scoreItem } from './scoring';

/**
 * 3단계 추천 — "여행자 선호도가 높은 곳".
 *
 * 근거는 두 가지뿐이고 둘 다 실제 데이터다.
 *
 *  1. 국제적 인지도 — 위키데이터 항목이 실린 위키백과 언어판 수를 5단계로
 *     접은 값(popularity). 40개 이상이 5, 18개 이상이 4다. 여행자 평점은
 *     구글 지도 약관 때문에 저장할 수 없어 이 값을 대신 쓴다.
 *  2. 이 사람의 취향 점수 — 2단계 답으로 계산한 scoreItem.
 *
 * 근거를 지어내지 않는다. 화면에도 이 두 가지를 그대로 적는다.
 * '숨은 곳 위주로'를 고른 사람에게는 인지도 축을 뒤집는 대신 추천 자체를
 * 접는다. 발견을 원하는 사람에게 대표 명소를 들이미는 것은 방해다.
 */
export interface Recommendation {
  item: Item;
  city: City | undefined;
  /** 왜 추천하는지 — 화면에 그대로 보여 준다. */
  reason: string;
}

/** 인기도 단계 → 사람이 읽을 수 있는 근거. */
function fameReason(popularity: number): string | null {
  if (popularity >= 5) return '위키백과 40개 이상 언어판에 실린 곳';
  if (popularity >= 4) return '위키백과 18개 이상 언어판에 실린 곳';
  return null;
}

/** 한 도시에 몰리지 않도록 도시당 상한을 둔다. */
const PER_CITY = 2;
const LIMIT = 8;

export function recommend(
  items: Item[],
  cities: City[],
  prefs: Preferences,
): Recommendation[] {
  // 숨은 곳을 원하는 사람에게는 추천하지 않는다.
  if (prefs.discovery >= 2.5) return [];

  const themeLabel = new Map(THEMES.map((t) => [t.id, t.label]));
  const famous = items.filter((i) => i.popularity >= 4);
  const scored = famous
    .map((item) => ({ item, score: scoreItem(item, prefs, {}) }))
    .sort((a, b) => b.item.popularity - a.item.popularity || b.score - a.score);

  const perCity = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const { item } of scored) {
    if (out.length >= LIMIT) break;
    const n = perCity.get(item.city) ?? 0;
    if (n >= PER_CITY) continue;
    perCity.set(item.city, n + 1);

    const parts = [fameReason(item.popularity)].filter(Boolean) as string[];
    // 취향이 겹칠 때만 덧붙인다. 관심도 0인 테마에 "관심 있다"고 쓰면 거짓말이 된다.
    if ((prefs.themes[item.theme] ?? 0) >= 2) {
      parts.push(`관심 있다고 답한 ${themeLabel.get(item.theme) ?? item.theme}`);
    }
    out.push({
      item,
      city: cities.find((c) => c.slug === item.city),
      reason: parts.join(' · '),
    });
  }
  return out;
}
