import type { City, Item } from '../types';

/**
 * 도시와 무관한 전체 순위.
 *
 * ## 왜 필요한가
 *
 * 코스 크기가 '하루에 담을 수 있는 개수 × 일수' 였다. 순위와 무관하게
 * 1일치를 채우는 구조라, 볼 것이 넘치는 마드리드와 반나절이면 충분한
 * 소도시가 같은 규칙으로 잘렸다.
 *
 * 그래서 먼저 모든 아이템에 점수를 매겨 순위를 세우고, 코스는 그 순위를
 * 위에서부터 잘라 만든다. "며칠인가" 가 아니라 "여기까지는 꼭 봐야 하는가"
 * 가 기준이 된다.
 *
 * ## 점수 재료
 *
 * 평점·후기 데이터는 앱에 없다. 그러니 '만족감' 을 직접 재는 척하지 않고,
 * 서로 독립적인 세 가지 대리 지표를 합친다. 하나가 틀려도 나머지가 받친다.
 *
 *  - **명성**: 위키백과 언어판 수. 백과사전적 인지도다.
 *  - **대표 지정**: 도시 데이터의 `highlights` — 사람이 도시마다 꼽아 둔
 *    세 곳이다. 명성과 독립적이라 서로를 검증한다.
 *  - **여행자 검증**: 제대로 정리된 여행지인가. Wikivoyage 등재(여행자가
 *    여행자를 위해 쓴 가이드), 한국어 이름이 붙어 있는가, 그리고 실무
 *    정보가 하나라도 있는가를 본다.
 *
 *    처음에는 실무 정보(영업시간·요금·공식 홈페이지)의 충실도로 쟀는데
 *    틀렸다. 마요르 광장·에스파냐 광장·고딕 지구처럼 **무료로 열려 있는
 *    공간은 영업시간도 요금도 공식 홈페이지도 없다.** 대표 지정 210곳 중
 *    88곳이 그런 이유로 깎였고, 알함브라 궁전이 60위까지 밀렸다.
 *    없는 것이 흠이 아니라 그런 종류일 뿐이므로, 있으면 가산하되 없다고
 *    벌하지 않는 형태로 바꿨다.
 *
 * '예매 필요' 는 넣지 않았다. 그것은 수요가 몰린다는 신호이지 그 장소가
 * 좋다는 신호가 아니다. '대표 사진 보유' 도 넣지 않았다 — 그 사진을 고른
 * 기준이 인지도였으므로 명성을 두 번 세는 셈이다.
 */

/** 가중치. 합이 1 이 되게 둔다. 여기 숫자만 고치면 순위가 바뀐다. */
export const RANK_WEIGHTS = {
  fame: 0.40,
  must: 0.30,
  vetted: 0.30,
};

/**
 * '그 일정이 있어야만 가는 곳' 보정.
 *
 * 위키백과 명성은 여행 가치가 아니다. 축구장은 언어판이 수십 개라 명성만
 * 보면 프라도와 나란히 올라오는데, 경기가 없으면 갈 이유가 없다.
 *
 * 다만 이름으로 거르면 틀린다. 산 파우 병원은 이름이 병원이지만 유네스코
 * 모데르니스메 건축이고, 산 페르난도 왕립미술아카데미는 고야가 걸린
 * 미술관이다. 그래서 이름이 아니라 사람이 적어 둔 설명(`why`)에서
 * '그 일정이 있어야 한다' 고 말하는 것만 잡는다.
 */
const OCCASION_ONLY = /경기가 (있는|열리는) 날에만|경기 일정이 (맞|있)|예약제|예약해야|사전 예약이 필요|미리 예약하면|예약하면 볼 수|공연이 있는 날|미사 시간에만/;
/** 강한 보정 — 그날이 아니면 못 본다. */
const OCCASION_FACTOR = 0.45;
/** 약한 보정 — 볼 수는 있으나 관심사가 갈린다(구단 홈구장 등). */
const NICHE_FACTOR = 0.72;

const norm = (s: string) => s.replace(/[(（].*$/, '').replace(/\s+/g, '').toLowerCase();

/** 도시 데이터의 `highlights` 에 이름이 올라 있는가. */
export function isHighlight(item: Item, city: City | undefined): boolean {
  const n = norm(item.name);
  return (city?.highlights ?? []).map(norm).some((h) => h === n || h.includes(n) || n.includes(h));
}

const textOf = (i: Item) => `${i.summary ?? ''} ${i.why ?? ''}`;

function purposeFactor(item: Item, city: City | undefined): number {
  /*
   * 도시가 스스로 대표로 꼽은 곳은 보정하지 않는다.
   *
   * 알함브라는 설명에 '예약제' 라고 적혀 있어 규칙에 걸렸다. 그런데 그건
   * 표가 매진된다는 뜻이지 '그 일정이 있어야 간다' 는 뜻이 아니다. 도시가
   * 대표 세 곳에 꼽은 것을 앱이 뒤집을 이유는 없다.
   */
  if (isHighlight(item, city)) return 1;
  if (OCCASION_ONLY.test(textOf(item))) return OCCASION_FACTOR;
  if (item.theme === 'activity' && /홈구장|구단/.test(textOf(item))) return NICHE_FACTOR;
  return 1;
}

export interface RankParts { fame: number; must: number; vetted: number; purpose: number }

export function rankParts(item: Item, city: City | undefined): RankParts {
  /*
   * 제대로 정리된 여행지인가.
   *
   * 셋 다 '있으면 가산' 이다. 무료 개방 공간이 영업시간이 없다고 깎이지
   * 않아야 하고, 대량 수입된 미번역 항목은 한국어 이름이 없어 걸러진다
   * (미번역 132곳 중 130곳이 wikidata 수입분이다).
   */
  const named = /[가-힣]/.test(item.name) ? 0.4 : 0;
  const guide = item.source === 'wikivoyage' ? 0.3 : 0;
  const anyInfo = (item.url || item.hours || item.priceEur !== null || item.wikidata) ? 0.3 : 0;
  return {
    fame: (item.popularity - 1) / 4,
    must: isHighlight(item, city) ? 1 : 0,
    vetted: named + guide + anyInfo,
    purpose: purposeFactor(item, city),
  };
}

/** 0~1. 취향과 무관한 절대 점수다 — 2단계 취향은 그 위에 따로 얹힌다. */
export function rankScore(item: Item, city: City | undefined): number {
  const p = rankParts(item, city);
  const base = p.fame * RANK_WEIGHTS.fame + p.must * RANK_WEIGHTS.must + p.vetted * RANK_WEIGHTS.vetted;
  return base * p.purpose;
}

/**
 * 이 점수 아래는 코스에 넣지 않는다.
 *
 * 있다고 다 넣으면 '1일치를 채운다' 로 돌아간다. 값어치가 모자라면 코스를
 * 짧게 내놓는 편이 낫다 — 소도시는 원래 반나절이면 충분하다.
 *
 * 0.45 는 실측으로 정했다. 이 선에서 도시별 '값어치'(기준선을 넘는 것을 다
 * 봤을 때의 일수)가 사람의 감각과 맞는다:
 *
 *   마드리드 10.9일 · 바르셀로나 9.6일 → 상한 4일에 걸림
 *   세비야 3.3일 · 빌바오 3.5일 · 그라나다 3.0일 → 2~4일
 *   톨레도 2.2일 · 코르도바 1.7일 · 말라가 1.4일 → 하루~이틀
 *   세고비아 0.9일 · 론다 0.5일 · 네르하 0.4일 → 반나절
 */
export const RANK_FLOOR = 0.45;

export interface Ranked { item: Item; score: number; rank: number; must: boolean }

/**
 * 도시 구분 없이 전체를 순위화한다.
 * `rank` 는 1부터. 도시별 순위가 필요하면 걸러 낸 뒤 순서를 그대로 쓴다.
 */
export function rankAll(items: Item[], cities: City[]): Ranked[] {
  const cityOf = new Map(cities.map((c) => [c.slug, c]));
  return items
    .map((item) => {
      const c = cityOf.get(item.city);
      return { item, score: rankScore(item, c), rank: 0, must: isHighlight(item, c) };
    })
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * 이 도시에서 꼭 가야 하는 곳.
 *
 * 두 기준을 함께 본다 — 도시 데이터에 사람이 꼽아 둔 대표(`highlights`)와,
 * 전체 순위에서 이 도시의 상위권. 둘은 재료가 달라 서로를 검증한다.
 * 대표로 지정됐는데 순위가 낮으면(자료가 부실한 소도시 명소) 그래도 넣는다.
 */
export function mustSeeOf(cityItems: Ranked[], topN = 3): Ranked[] {
  const must = cityItems.filter((r) => r.must);
  const top = cityItems.filter((r) => !r.must).slice(0, Math.max(0, topN - must.length));
  return [...must, ...top].sort((a, b) => a.rank - b.rank);
}

/* ─────────────────────────────────────────────────────────────────────
 * 코스 3등급
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 등급별 일수 상한.
 *
 * 비율(상위 25%·45%)로 끊어 봤더니 도시의 값어치가 아니라 도시 안의 비중을
 * 재게 되어, 마드리드 상위 45% 가 5.1일이 나왔다. 사람이 실제로 쓰는 말은
 * "이 도시는 며칠짜리인가" 이므로 일수로 끊는다.
 *
 * 상한일 뿐이다. 기준선을 넘는 곳이 모자라면 상한에 못 미쳐도 거기서
 * 끝낸다 — 억지로 채우지 않는 것이 이 구조의 핵심이다.
 */
export const TIER_MAX_DAYS = { full: 4, normal: 2 };

/** 찍먹은 '이 도시에서 이것만은' 이다. 개수로 끊는다. */
export const TASTE_MAX = 3;

/** 하루에 쓸 수 있는 활동 시간(분)과 아이템 하나가 잡아먹는 시간은 capacity 와 같다. */
const DAY_MIN = 504;
const costOf = (i: Item) => i.durationMin + 18;

export type TierId = 'full' | 'normal' | 'taste';

export interface Tier {
  id: TierId;
  items: Item[];
  days: number;
}

/** 순위대로 담되 일수 상한에서 멈춘다. 한 곳도 못 담는 일은 없다. */
function take(list: Ranked[], maxDays: number): Ranked[] {
  const out: Ranked[] = [];
  let min = 0;
  for (const r of list) {
    const c = costOf(r.item);
    if (out.length && min + c > maxDays * DAY_MIN) break;
    out.push(r);
    min += c;
  }
  return out;
}

/**
 * 한 도시의 세 코스.
 *
 * @param cityRanked 이 도시 아이템을 순위 순으로. 미식은 미리 빼고 넘긴다 —
 *   식사는 동선이 만드는 기회에 배정할 뿐 코스 분량을 정하지 않는다.
 */
export function tiersOf(cityRanked: Ranked[]): Tier[] {
  const pool = cityRanked.filter((r) => r.score >= RANK_FLOOR);
  if (pool.length === 0) return [];

  const full = take(pool, TIER_MAX_DAYS.full);
  const normal = take(full, TIER_MAX_DAYS.normal);

  /*
   * 찍먹은 대표로 지정된 곳을 먼저 넣는다. 순위가 낮아도 넣는 이유는,
   * 자료가 부실한 소도시에서 사람이 꼽아 둔 명소가 점수로는 뒤에 있을 수
   * 있기 때문이다(그라나다 산 니콜라스 전망대: 위키백과 언어판 1개).
   */
  const must = cityRanked.filter((r) => r.must).slice(0, TASTE_MAX);
  const rest = full.filter((r) => !must.includes(r)).slice(0, Math.max(0, TASTE_MAX - must.length));
  const taste = [...must, ...rest].sort((a, b) => a.rank - b.rank);

  const mk = (id: TierId, list: Ranked[]): Tier => ({
    id,
    items: list.map((r) => r.item),
    days: Math.round((list.reduce((a, r) => a + costOf(r.item), 0) / DAY_MIN) * 10) / 10,
  });

  /*
   * 세 등급이 같아질 수 있다 — 값어치가 반나절뿐인 마을은 셋이 모두 같은
   * 목록이 된다. 그때는 같은 것을 세 번 보여 주지 않고 있는 만큼만 내놓는다.
   */
  const out = [mk('full', full)];
  if (normal.length < full.length) out.push(mk('normal', normal));
  if (taste.length < normal.length || (out.length === 1 && taste.length < full.length)) {
    out.push(mk('taste', taste));
  }
  return out;
}
