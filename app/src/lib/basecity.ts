import type { City } from '../types';
import { servicesBetween } from './routing';

/**
 * 어느 도시에 묵고 어느 도시를 당일치기로 다녀올 것인가.
 *
 * ## 왜 다시 만들었나
 *
 * 예전 기준은 두 줄이었다 — "담은 아이템이 0.75일 이상이면 거기서 잔다,
 * 아니면 여정 순서에서 바로 앞뒤에 있는 숙박 도시로 붙인다."
 *
 * 여기에는 세 가지 문제가 있었다.
 *
 *  1. 도시 순서를 먼저 정하고 숙박을 나중에 정했다. 순서는 '총 이동 시간
 *     최소' 로 풀리므로 마드리드 → 세고비아 → 톨레도 같은 한 줄이 나오고,
 *     세고비아에서 톨레도로 가는 렌터카 2시간 26분짜리 구간이 생긴다.
 *     실제로 그렇게 가는 사람은 없다. 둘 다 마드리드에서 다녀온다.
 *  2. 붙일 후보가 '순서상 앞뒤' 뿐이었다. 실제 거점이 두 칸 떨어져 있으면
 *     아무리 가까워도 붙일 수 없었다.
 *  3. 0.75일 문턱은 사실상 모든 도시를 통과시켰다. 소도시 기본 코스가 딱
 *     1.0일이라 톨레도도 세고비아도 '잘 만한 곳' 으로 판정됐다.
 *
 * ## 지금 기준
 *
 * 순서를 정하기 전에 거점을 먼저 고른다. 거점은 아래 다섯 요소의
 * 가중합으로 점수를 매겨 고르고, 편도 {@link DAY_TRIP_MAX_MIN} 분 안에
 * 닿는 도시는 그 거점이 흡수한다. 거점끼리만 순서를 정하므로 있지도 않은
 * 소도시 간 구간이 생기지 않는다.
 *
 * 가중치는 실제 여행자들이 거점을 고르는 기준을 참고해 잡았다(Rick Steves
 * 포럼 등에서 반복해 나오는 것들): 근교를 여럿 품는 교통 허브인가,
 * 저녁과 밤을 보낼 만한가, 며칠 묵을 만한 곳인가, 다음 목적지로 나가기
 * 쉬운가, 그리고 그 도시 자체에 볼 것이 얼마나 있는가.
 *
 * 값은 언제든 고칠 수 있게 한곳에 모아 두었다.
 */

/** 요소별 가중치. 합이 1 이 되게 둔다. */
export const BASE_WEIGHTS = {
  /** 근교를 여럿 품는가. 거점의 존재 이유 자체다. */
  reach: 0.30,
  /** 저녁·밤에 할 것이 있는가. 자는 도시에서 저녁을 먹기 때문이다. */
  evening: 0.25,
  /** 며칠 묵을 만한 곳인가. */
  lodging: 0.20,
  /** 다음 목적지로 나가기 쉬운가. */
  onward: 0.15,
  /** 그 도시 자체의 볼 것 분량. */
  volume: 0.10,
};

/**
 * 당일치기로 흡수할 편도 한계(분). 왕복 4시간.
 *
 * 하루 활동 8시간 중 4시간이 이동이면 절반이다. 그보다 멀면 거기서
 * 자는 편이 낫다. 여행자 커뮤니티에서 흔히 말하는 한계(편도 1시간 30분
 * ~2시간)의 위쪽을 잡았다.
 */
export const DAY_TRIP_MAX_MIN = 120;

/**
 * 이만큼 볼 것이 있으면 짐을 옮길 값어치가 있다.
 *
 * 숙소를 옮기는 데는 체크아웃·짐·체크인으로 반나절 가까이 든다.
 * 하루치를 보자고 그 값을 치르지는 않는다.
 */
export const MOVE_WORTH_DAYS = 1.5;

/**
 * 데이터에 '이 도시는 저 도시에서 다녀오는 곳' 이라고 적혀 있고 그 거점이
 * 이번 여행에 있으면, 짐을 옮길 문턱을 높인다.
 *
 * 톨레도는 꽉찬 코스를 담으면 2.2일치가 되어 1.5일 문턱을 넘는다. 그런데
 * 사람이 적어 둔 hub 가 마드리드이고 편도 1시간 10분이다. 실제로 대부분
 * 마드리드에 묵으며 다녀온다. 데이터에 적힌 판단을 0.7일 차이로 뒤집을
 * 이유는 없다.
 */
export const MOVE_WORTH_DAYS_NEAR_HUB = 2.5;

const mkey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
type Measured = Map<string, { minutes: number; mode: string }>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 두 도시 사이 문앞~문앞 최단 시간(분).
 *
 * 렌터카는 빼고 잰다. 거점에 묵으면서 근교를 다녀오는 데 하루짜리 차를
 * 빌리는 사람은 없다 — 당일치기는 열차나 버스로 간다. 차를 넣으면 기다리지
 * 않는다는 이유로 거의 언제나 차가 1순위가 되어(도시 쌍의 60.6%), 실제로는
 * 탈 수 없는 수단으로 '가깝다' 는 판정이 나온다.
 * 정기편이 아예 없는 구간에서만 차를 쓴다.
 */
function legMin(a: City, b: City, measured: Measured): number {
  if (a.slug === b.slug) return 0;
  const all = servicesBetween(a, b, measured.get(mkey(a.slug, b.slug)));
  const scheduled = all.filter((s) => s.mode !== 'car');
  return (scheduled[0] ?? all[0])?.totalMin ?? Infinity;
}

/**
 * 저녁·밤 점수.
 *
 * 자는 도시에서 저녁을 먹고 밤을 보내므로, 해가 진 뒤에 할 것이 있는지가
 * 거점의 조건이다. 도시 성격에 적힌 테마 개수와 태그로 잰다 — 담은
 * 아이템이 아니라 도시 자체의 성격이어야 코스를 바꿔도 흔들리지 않는다.
 */
function eveningScore(c: City): number {
  const t = c.themes ?? {};
  const nightlife = t.nightlife ?? 0;
  const food = t.food ?? 0;
  const n = Math.max(1, c.itemCount || 1);
  // 밤 전용 항목은 귀하므로 가중을 높게, 식당은 수가 많으므로 낮게 본다.
  const density = clamp01((nightlife * 3 + food) / (n * 0.35));
  const tags = new Set(c.tags);
  let bonus = 0;
  for (const [tag, v] of [['나이트라이프', 0.25], ['타파스', 0.15], ['미식', 0.12], ['대도시', 0.12]] as const) {
    if (tags.has(tag)) bonus += v;
  }
  return clamp01(density * 0.7 + bonus);
}

/**
 * 숙박 적합성 점수.
 *
 * 호텔 데이터는 앱에 없다. 그러니 호텔 수를 아는 척하지 않고, 아는 것으로
 * 대신한다 — 도시 데이터에 사람이 적어 둔 권장 숙박일(`nights`), 거점
 * 여부(`isHub`), 그리고 '당일치기' 태그다. 이것들은 "여기서 자는 것이
 * 보통인가" 에 대한 사람의 판단이라, 호텔 수보다 오히려 목적에 가깝다.
 * 다만 대리 지표라는 것은 화면에서 숨기지 않는다.
 */
function lodgingScore(c: City): number {
  const nights = c.nights?.[0] ?? 0;
  let s = clamp01(nights / 3) * 0.6;
  if (c.isHub) s += 0.3;
  if (c.tags.includes('당일치기')) s -= 0.35;
  if (c.tags.includes('리조트')) s += 0.1;
  return clamp01(s);
}

export interface BaseScore {
  city: City;
  total: number;
  parts: { reach: number; evening: number; lodging: number; onward: number; volume: number };
  /** 편도 한계 안에 닿는 다른 여행 도시들. */
  covers: string[];
  /** 이 도시에서 잘 만큼 볼 것이 있는가(짐을 옮길 값어치). */
  standalone: boolean;
}

/**
 * 후보 도시마다 거점 점수를 매긴다.
 *
 * @param endpoints 입국·출국으로 잡힌 도시. 내려서 자는 곳이므로 가산한다.
 */
export function scoreBases(
  cities: City[], itemDaysOf: (slug: string) => number,
  measured: Measured, endpoints: (string | null)[] = [],
): BaseScore[] {
  const ends = new Set(endpoints.filter((x): x is string => !!x));
  const maxDays = Math.max(1, ...cities.map((c) => itemDaysOf(c.slug)));

  return cities.map((c) => {
    const others = cities.filter((x) => x.slug !== c.slug);
    const near = others.filter((x) => legMin(c, x, measured) <= DAY_TRIP_MAX_MIN);

    /*
     * 교통 허브성.
     *
     * 몇 곳을 품는가에 더해, 데이터에 사람이 적어 둔 hub 매핑을 크게 본다.
     * `톨레도.hub === 'madrid'` 는 "톨레도는 마드리드에서 다녀오는 곳" 이라는
     * 판단이고, 그것이 정확히 우리가 알고 싶은 것이다. 엔진은 지금까지
     * 이 값을 한 번도 쓰지 않았다.
     */
    const authored = others.filter((x) => x.hub === c.slug).length;
    const reach = clamp01(
      (others.length ? near.length / others.length : 0) * 0.55
      + (others.length ? authored / others.length : 0) * 0.35
      + (c.tags.includes('교통중심') ? 0.2 : 0),
    );

    /*
     * 다음 목적지로 나가기 쉬운가.
     * 다른 도시들까지의 최단 이동 시간 중앙값으로 잰다. 짧을수록 좋다.
     * 입·출국 도시는 어차피 거기 내리므로 크게 가산한다.
     */
    const legs = others.map((x) => legMin(c, x, measured)).sort((a, b) => a - b);
    const mid = legs.length ? legs[legs.length >> 1] : 0;
    const onward = clamp01((1 - Math.min(1, mid / 360)) * 0.75 + (ends.has(c.slug) ? 0.4 : 0));

    const parts = {
      reach,
      evening: eveningScore(c),
      lodging: lodgingScore(c),
      onward,
      volume: clamp01(itemDaysOf(c.slug) / maxDays),
    };
    const total = (Object.keys(BASE_WEIGHTS) as (keyof typeof BASE_WEIGHTS)[])
      .reduce((a, k) => a + parts[k] * BASE_WEIGHTS[k], 0);

    return {
      city: c, total, parts,
      covers: near.map((x) => x.slug),
      standalone: itemDaysOf(c.slug) >= (
        // 사람이 적어 둔 거점이 이번 여행에 있으면 문턱이 높다.
        c.hub && cities.some((x) => x.slug === c.hub)
          ? MOVE_WORTH_DAYS_NEAR_HUB : MOVE_WORTH_DAYS
      ),
    };
  }).sort((a, b) => b.total - a.total);
}

export interface BasePlan {
  /** 거점 도시들(순서는 아직 안 정해짐). */
  bases: City[];
  /** 당일치기 도시 slug → 어느 거점에서 다녀오는가. */
  attach: Map<string, string>;
  scores: Map<string, BaseScore>;
}

/**
 * 거점을 고르고 나머지를 붙인다.
 *
 * 점수가 높고 많이 품는 도시부터 거점으로 채택하는 탐욕법이다(가중 집합
 * 덮기). 도시 수가 열 몇 곳이라 정확히 풀 이유가 없고, 탐욕법이 사람의
 * 직관과도 잘 맞는다 — "제일 큰 데를 잡고 거기서 다녀온다".
 *
 * 다만 두 가지는 무조건이다.
 *  - 혼자 {@link MOVE_WORTH_DAYS} 일 이상 볼 것이 있는 도시는 스스로 거점이다.
 *  - 사용자가 직접 지정한 것은 점수와 무관하게 그대로 따른다.
 */
export function chooseBases(
  cities: City[], itemDaysOf: (slug: string) => number,
  measured: Measured, endpoints: (string | null)[] = [],
  overrides: Record<string, 'sleep' | 'daytrip'> = {},
): BasePlan {
  const scored = scoreBases(cities, itemDaysOf, measured, endpoints);
  const byslug = new Map(scored.map((s) => [s.city.slug, s]));

  const bases: City[] = [];
  const takeBase = (c: City) => { if (!bases.some((b) => b.slug === c.slug)) bases.push(c); };

  // 1) 사용자가 '여기서 자기' 로 지정한 곳과, 혼자 설 만한 곳.
  for (const s of scored) {
    if (overrides[s.city.slug] === 'daytrip') continue;
    if (overrides[s.city.slug] === 'sleep' || s.standalone) takeBase(s.city);
  }

  const covered = new Set<string>();
  const markCovered = () => {
    covered.clear();
    for (const b of bases) {
      covered.add(b.slug);
      for (const s of byslug.get(b.slug)?.covers ?? []) covered.add(s);
    }
  };
  markCovered();

  // 2) 아직 안 덮인 도시가 있으면, 점수 × 새로 덮는 수가 가장 큰 곳을 더한다.
  const left = () => cities.filter((c) => !covered.has(c.slug) && overrides[c.slug] !== 'daytrip');
  let guard = cities.length + 1;
  while (left().length && guard-- > 0) {
    let best: { c: City; gain: number } | null = null;
    for (const s of scored) {
      if (bases.some((b) => b.slug === s.city.slug)) continue;
      if (overrides[s.city.slug] === 'daytrip') continue;
      const fresh = [s.city.slug, ...s.covers].filter((x) => !covered.has(x)).length;
      if (!fresh) continue;
      const gain = s.total * (1 + fresh);
      if (!best || gain > best.gain) best = { c: s.city, gain };
    }
    if (!best) break;
    takeBase(best.c);
    markCovered();
  }

  /*
   * 그래도 남는 도시는 당일치기로 붙일 거점이 없다는 뜻이다(편도 2시간
   * 넘게 떨어진 외딴 곳). 그런 곳은 짧게라도 거기서 잔다 — 왕복 5시간을
   * 쓰느니 자는 편이 낫다.
   */
  for (const c of left()) takeBase(c);

  // 3) 거점이 아닌 도시를 가장 가까운 거점에 붙인다.
  const attach = new Map<string, string>();
  for (const c of cities) {
    if (bases.some((b) => b.slug === c.slug)) continue;
    let pick: { slug: string; min: number } | null = null;
    for (const b of bases) {
      const t = legMin(c, b, measured);
      // 사람이 적어 둔 hub 가 후보에 있으면 20분치 우대한다.
      const adj = c.hub === b.slug ? t - 20 : t;
      if (!pick || adj < pick.min) pick = { slug: b.slug, min: adj };
    }
    if (pick) attach.set(c.slug, pick.slug);
  }

  return { bases, attach, scores: byslug };
}

/** 이 도시가 거점으로 뽑힌(또는 안 뽑힌) 이유를 한 줄로. */
export function explainBase(s: BaseScore, isBase: boolean, baseName?: string): string {
  const top = (Object.entries(s.parts) as [keyof typeof BASE_WEIGHTS, number][])
    .sort((a, b) => b[1] * BASE_WEIGHTS[b[0]] - a[1] * BASE_WEIGHTS[a[0]])[0];
  const LABEL = {
    reach: '근교를 여럿 품어서',
    evening: '저녁·밤에 할 것이 있어서',
    lodging: '며칠 묵기 좋아서',
    onward: '다음 목적지로 나가기 쉬워서',
    volume: '이 도시에 볼 것이 많아서',
  } as const;
  if (isBase) return `${LABEL[top[0]]} 거점으로 잡았습니다`;
  return baseName ? `${baseName}에서 다녀오는 편이 짐을 덜 옮깁니다` : '';
}
