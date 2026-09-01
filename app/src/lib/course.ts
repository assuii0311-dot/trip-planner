import type { City, CourseId, Item, Preferences, ThemeId } from '../types';
import { THEME_LABEL } from './themes';
import { scoreItem } from './scoring';
import { estimateDays, isMeal } from './capacity';
import { rankAll, tiersOf, mustSeeOf, RANK_FLOOR, TIER_MAX_DAYS, type Ranked } from './rank';

/**
 * 도시별 추천 코스.
 *
 * ## 무엇이 바뀌었나
 *
 * 예전에는 두 가지가 잘못돼 있었다.
 *
 * 1. **코스 크기가 '하루에 담을 수 있는 개수 × 일수'** 였다. 순위와 무관하게
 *    1일치를 채우는 구조라, 볼 것이 넘치는 마드리드와 반나절이면 충분한
 *    네르하가 같은 규칙으로 잘렸다.
 * 2. **세 코스를 테마 강조로 나눴다.** 셋이 모두 같은 점수 정렬에서 나오고
 *    테마별 몫만 바꾼 것이라 중복률이 평균 80% 였고, 무엇보다 "이 도시를
 *    며칠 볼 것인가" 라는 실제 질문에 답하지 않았다.
 *
 * 지금은 {@link rankAll} 로 도시 구분 없이 전체를 순위화한 뒤, 그 순위를
 * 위에서부터 일수 상한까지 잘라 세 등급을 만든다.
 *
 *   꽉찬 — 최대 4일치. 값어치가 모자라면 거기서 끝난다.
 *   보통 — 최대 2일치.
 *   찍먹 — 이 도시에서 이것만은. 대표 지정을 먼저 넣는다.
 *
 * 도시가 반나절짜리면 등급이 하나만 나온다. 같은 목록에 다른 이름을 붙여
 * 세 장을 채우지 않는다.
 *
 * ## 미식
 *
 * 코스에 넣지 않는다. 점심과 저녁은 어차피 먹으므로 식당을 담았다고 여행이
 * 길어지지 않는데, 예전에는 미식이 소요 일수의 11~28% 를 차지해 숙박일과
 * 거점 판정까지 밀고 올라갔다. 미식은 동선이 만드는 끼니 자리에 배정될
 * 뿐이고, 3단계에서는 따로 후보로만 보여 준다.
 */
export interface Course {
  id: CourseId;
  title: string;
  /** 왜 이렇게 묶였는지. 화면에 그대로 보여 준다. */
  basis: string;
  items: Item[];
  /** 예상 소요 일수. */
  days: number;
  /** 테마별 개수 — 이 도시가 무엇으로 채워지는지 한눈에 보이게. */
  mix: { theme: ThemeId; label: string; count: number }[];
  /** 이 코스에 들어간 '꼭 가야 하는 곳' 이름. */
  mustNames: string[];
}

const TITLE: Record<CourseId, string> = { full: '꽉찬 코스', normal: '보통 코스', taste: '찍먹 코스' };

function mixOf(items: Item[]): Course['mix'] {
  const n = new Map<ThemeId, number>();
  for (const i of items) n.set(i.theme, (n.get(i.theme) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({ theme, label: THEME_LABEL[theme], count }));
}

/**
 * 순위를 취향으로 살짝 기울인다.
 *
 * 순위는 취향과 무관한 절대값이라 프라도는 미술에 관심이 없어도 마드리드
 * 1위다 — 그게 맞다. 다만 상한에 걸려 잘리는 자리에서는 취향이 갈라야
 * 하므로, ±25% 안에서만 순서를 흔든다. 이 폭에서는 대표 명소가 밀려나지
 * 않으면서 중위권이 취향대로 바뀐다.
 */
function tilt(r: Ranked, prefs: Preferences): number {
  const interest = prefs.themes[r.item.theme] ?? 0;
  return r.score * (0.75 + (interest / 3) * 0.5);
}

/** 이 도시 아이템을 순위 순으로. 미식은 뺀다. */
function rankedFor(city: City, cityItems: Item[], prefs: Preferences, cities: City[]): Ranked[] {
  return rankAll(cityItems.filter((i) => !isMeal(i)), cities.length ? cities : [city])
    .sort((a, b) => tilt(b, prefs) - tilt(a, prefs))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * 한 도시의 추천 코스.
 * @param cities 순위 계산에 도시의 `highlights` 가 필요하다.
 */
export function coursesFor(
  city: City, cityItems: Item[], prefs: Preferences, cities: City[] = [city],
): Course[] {
  if (cityItems.length < 2) return [];
  const ranked = rankedFor(city, cityItems, prefs, cities);
  const worth = ranked.filter((r) => r.score >= RANK_FLOOR);

  return tiersOf(ranked).map((t) => {
    const must = t.items.filter((i) => ranked.find((r) => r.item.id === i.id)?.must);
    const basis = t.id === 'full'
      ? worth.length > t.items.length
        ? `${city.name}에서 볼 만한 곳을 순위대로 ${TIER_MAX_DAYS.full}일치까지 담았습니다.`
        : `${city.name}에서 볼 만한 곳을 전부 담았습니다. 이 도시는 ${t.days}일이면 충분합니다.`
      : t.id === 'normal'
        ? `상위권만 ${TIER_MAX_DAYS.normal}일치로 줄였습니다.`
        : `${city.name}에서 이것만은 보고 가는 구성입니다.`;
    return {
      id: t.id,
      title: TITLE[t.id],
      basis,
      items: t.items,
      days: t.days,
      mix: mixOf(t.items),
      mustNames: must.map((i) => i.name),
    };
  });
}

/**
 * 일수를 정해 주면 그 일수에 맞는 아이템을 골라 준다.
 *
 * 등급이 정해 준 것보다 더 보거나 덜 보고 싶을 때 쓴다. 순위 상위부터
 * 담되 정한 일수에서 멈춘다 — 값어치가 모자라면 그만큼만 담고, 없는 것을
 * 채워 넣지 않는다.
 */
export function itemsForDays(
  city: City, cityItems: Item[], prefs: Preferences, days: number,
  _keep: CourseId | undefined, cities: City[] = [city],
): Item[] {
  const ranked = rankedFor(city, cityItems, prefs, cities).filter((r) => r.score >= RANK_FLOOR);
  const out: Item[] = [];
  let min = 0;
  for (const r of ranked) {
    const c = r.item.durationMin + 18;
    if (out.length && min + c > days * 504) break;
    out.push(r.item);
    min += c;
  }
  return out;
}

/**
 * 이 도시의 '값어치' — 기준선을 넘는 곳을 다 봤을 때 며칠인가.
 *
 * 이보다 늘려 봐야 담을 것이 없다. 그때 ＋ 를 눌러도 아무 일이 없으면
 * 고장으로 보이므로, 화면에서 버튼을 잠그고 이유를 적는다.
 */
export function cityWorthDays(
  city: City, cityItems: Item[], prefs: Preferences, cities: City[] = [city],
): number {
  const worth = rankedFor(city, cityItems, prefs, cities).filter((r) => r.score >= RANK_FLOOR);
  return Math.round((worth.reduce((a, r) => a + r.item.durationMin + 18, 0) / 504) * 10) / 10;
}

/**
 * 이 도시에서 꼭 가야 하는 곳.
 * 도시 데이터에 사람이 꼽아 둔 대표와 전체 순위 상위권을 함께 본다.
 */
export function mustSeeFor(
  city: City, cityItems: Item[], prefs: Preferences, cities: City[] = [city],
): Item[] {
  return mustSeeOf(rankedFor(city, cityItems, prefs, cities)).map((r) => r.item);
}

/**
 * 미식 후보.
 *
 * 코스에 넣지 않고 따로 보여 준다. 담아 두면 계획에서 점심·저녁 자리에
 * 배정되고, 자리보다 많이 담으면 남는 것은 후보로 남는다 — 그것 때문에
 * 다른 일정이 밀리지는 않는다.
 */
export function foodPicksFor(cityItems: Item[], prefs: Preferences, limit = 8): Item[] {
  return cityItems
    .filter((i) => i.theme === 'food')
    .map((i) => ({ i, v: scoreItem(i, prefs, {}) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit)
    .map((x) => x.i);
}

/** 담은 것으로 계산한 일수. 식사는 세지 않는다. */
export const daysOf = (items: Item[], prefs: Preferences) => estimateDays(items, prefs);

/**
 * 이 도시에 기본으로 며칠을 쓸 것인가.
 *
 * 이제는 코스 등급이 분량을 정하므로 코스 크기에는 쓰이지 않는다. 3단계
 * 일수 조절기의 시작값으로만 쓴다. 도시 데이터의 권장 숙박일에서 뽑되,
 * 밤 수라 당일치기 도시는 0 이므로 쓰는 날로는 하루다.
 */
export function defaultCityDays(city: City): number {
  return Math.max(1, city.nights?.[0] ?? 1);
}
