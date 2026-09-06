import type { City, Item, Preferences } from '../types';
import type { Service } from './routing';
import { bestFrom, fastest, nextDeparture, servicesBetween } from './routing';
import { clampDayStart, estimateDays } from './capacity';
import { chooseBases, explainBase, DAY_TRIP_MAX_MIN } from './basecity';

/**
 * 도시 순서 · 숙박 · 도시 간 이동을 한꺼번에 정하는 엔진.
 *
 * ## 원칙: 이동 시간 효율이 가장 우선
 *
 * 값이 싸거나 경치가 좋아도 하루를 이동으로 버리면 여행이 아니라 이동이다.
 * 그래서 도시 순서는 '도시 간 총 이동 시간 최소' 로 푼다. 출발 공항에서
 * 시작해 도착 공항에서 끝나는 것만 고정하고 나머지는 자유롭게 재배열한다.
 *
 * 예전에는 사용자가 고른 순서와 권역 묶음을 그대로 따라가서, 바르셀로나 →
 * 세비야 → 빌바오처럼 나라를 두 번 가로지르는 일정이 나왔다.
 *
 * ## 숙박
 *
 * 한 도시에서 이틀 이상 보낼 만큼 볼 것이 있으면 거기서 잔다. 짧게 볼
 * 도시는 가까운 숙박지에서 당일치기로 다녀온다. 안달루시아를 돌면서
 * 말라가와 세비야에 각각 묵는 것처럼, 숙박지가 여럿일 수 있다.
 */

export interface Stop {
  city: City;
  /** 고른 아이템으로 계산한 소요 일수(소수 가능). */
  itemDays: number;
  /** 달력에서 차지하는 일수(정수). 당일치기는 0. */
  nights: number;
  /** 여기서 자는가. */
  sleep: boolean;
  /** 당일치기라면 어느 도시에서 다녀오는가. */
  base: string | null;
  /** 왕복 이동 시간(당일치기일 때만). */
  dayTripMin: number;
  /** 왜 이렇게 잡혔는지 한 줄. 화면에서 그대로 보여 준다. */
  why: string;
}

export interface Hop {
  from: City;
  to: City;
  /** 시간 효율 순 대안. 첫 번째가 기본. */
  options: Service[];
  /** 사용자가 고른 수단. 없으면 그 시각에 가장 일찍 닿는 것. */
  chosen: Service;
  /**
   * 나서서 닿을 때까지 실제로 드는 시간(분) — **대기 포함**.
   *
   * 예전에는 날 계산이 `chosen.totalMin` 을 썼다. 그것은 대기를 뺀 값이라,
   * 하루 세 편뿐인 구간을 '2시간 7분' 으로 세어 놓고 화면에는 8시간 45분
   * 이라고 적었다. 세는 숫자와 보여 주는 숫자가 같아야 한다.
   */
  doorToDoorMin: number;
}

export interface Itinerary {
  stops: Stop[];
  hops: Hop[];
  /** 아이템을 다 보려면 필요한 날. 이동일 포함. */
  daysNeeded: number;
  /** 도시 간 총 이동 시간(분). */
  transitMin: number;
}


/** 조사해 둔 구간표. dayTrips 에 들어 있는 실측값이다. */
export function measuredTable(cities: City[]): Map<string, { minutes: number; mode: string }> {
  const t = new Map<string, { minutes: number; mode: string }>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const c of cities) {
    for (const d of c.dayTrips) t.set(key(c.slug, d.city), { minutes: d.transitMin, mode: d.mode });
  }
  return t;
}

const mkey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 도시 간 이동 시간 행렬. 최선 수단의 문앞~문앞 시간을 쓴다.
 * 이 값으로 순서를 정하므로, 수단마다 다른 시간을 여기서 이미 반영한다.
 */
function costMatrix(cities: City[], measured: Map<string, { minutes: number; mode: string }>): number[][] {
  return cities.map((a) => cities.map((b) => (
    a.slug === b.slug ? 0 : fastest(a, b, measured.get(mkey(a.slug, b.slug))).totalMin
  )));
}

/**
 * 총 이동 시간이 가장 짧은 순서를 찾는다.
 *
 * 도시가 10곳 이하면 정확히 푼다(Held-Karp). 그보다 많으면 가까운 곳부터
 * 잇고 2-opt 로 다듬는다 — 여행 도시가 열 곳을 넘는 경우는 드물고, 그때는
 * 최적해와 몇 분 차이일 뿐이라 정확히 풀 이유가 없다.
 */
export function orderCities(
  cities: City[], startSlug: string | null, endSlug: string | null,
  measured: Map<string, { minutes: number; mode: string }>,
): City[] {
  const n = cities.length;
  if (n <= 2) return cities;
  const cost = costMatrix(cities, measured);
  const idx = (slug: string | null) => (slug ? cities.findIndex((c) => c.slug === slug) : -1);
  const start = idx(startSlug);
  let end = idx(endSlug);

  /*
   * 왕복(입국·출국 공항이 같은 도시)이면 고리를 푸는 문제다.
   * 끝을 안 묶으면 마지막 도시에서 출발 도시로 돌아오는 구간이 계산에서
   * 빠져, 가장 먼 도시에서 끝나는 순서를 최적이라고 내놓는다.
   * 돌아오는 비용을 넣어 고리로 풀되, 도시를 두 번 세지 않는다.
   */
  const roundTrip = start >= 0 && start === end;
  if (roundTrip) end = -1;

  const order = n <= 10
    ? exactOrder(n, cost, start, end, roundTrip ? start : -1)
    : heuristicOrder(n, cost, start, end, roundTrip ? start : -1);
  return order.map((i) => cities[i]);
}

function pathCost(cost: number[][], path: number[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += cost[path[i - 1]][path[i]];
  return sum;
}

/** Held-Karp. 양 끝이 고정될 수 있으므로 그것만 다르다. */
function exactOrder(n: number, cost: number[][], start: number, end: number, returnTo = -1): number[] {
  const free = [...Array(n).keys()].filter((i) => i !== start && i !== end);
  const first = start >= 0 ? start : -1;
  const last = end >= 0 && end !== start ? end : -1;

  // 시작이 고정되지 않았으면 모든 시작을 시도한다.
  const starts = first >= 0 ? [first] : [...Array(n).keys()].filter((i) => i !== last);
  let best: number[] = [];
  let bestCost = Infinity;

  for (const s of starts) {
    const mid = free.filter((i) => i !== s);
    const m = mid.length;
    const size = 1 << m;
    // dp[mask][j] = s 에서 출발해 mask 를 다 돌고 mid[j] 에 서 있을 때 최소 비용
    const dp = Array.from({ length: size }, () => new Float64Array(m).fill(Infinity));
    const prev = Array.from({ length: size }, () => new Int16Array(m).fill(-1));
    for (let j = 0; j < m; j++) dp[1 << j][j] = cost[s][mid[j]];
    for (let mask = 1; mask < size; mask++) {
      for (let j = 0; j < m; j++) {
        if (!(mask & (1 << j)) || dp[mask][j] === Infinity) continue;
        for (let k = 0; k < m; k++) {
          if (mask & (1 << k)) continue;
          const nm = mask | (1 << k);
          const v = dp[mask][j] + cost[mid[j]][mid[k]];
          if (v < dp[nm][k]) { dp[nm][k] = v; prev[nm][k] = j; }
        }
      }
    }
    const full = size - 1;
    if (m === 0) {
      const path = last >= 0 ? [s, last] : [s];
      const c = pathCost(cost, path) + (returnTo >= 0 && path.length > 1 ? cost[path[path.length - 1]][returnTo] : 0);
      if (c < bestCost) { bestCost = c; best = path; }
      continue;
    }
    for (let j = 0; j < m; j++) {
      // returnTo 가 있으면 마지막 도시에서 출발 도시로 돌아오는 비용까지 센다.
      const tail = (last >= 0 ? cost[mid[j]][last] : 0)
        + (returnTo >= 0 ? cost[mid[j]][returnTo] : 0);
      const total = dp[full][j] + tail;
      if (total >= bestCost) continue;
      // 역추적
      const seq: number[] = [];
      let mask = full;
      let cur = j;
      while (cur >= 0) { seq.push(mid[cur]); const p = prev[mask][cur]; mask ^= 1 << cur; cur = p; }
      seq.reverse();
      const path = [s, ...seq, ...(last >= 0 ? [last] : [])];
      bestCost = total;
      best = path;
    }
  }
  return best;
}

/** 가까운 곳부터 잇고 2-opt 로 다듬는다. */
function heuristicOrder(n: number, cost: number[][], start: number, end: number, returnTo = -1): number[] {
  const s = start >= 0 ? start : 0;
  const left = new Set([...Array(n).keys()]);
  left.delete(s);
  if (end >= 0 && end !== s) left.delete(end);
  const path = [s];
  let cur = s;
  while (left.size) {
    let best = -1;
    let bestC = Infinity;
    for (const i of left) if (cost[cur][i] < bestC) { bestC = cost[cur][i]; best = i; }
    path.push(best); left.delete(best); cur = best;
  }
  if (end >= 0 && end !== s) path.push(end);

  // 2-opt. 양 끝은 고정이므로 안쪽만 뒤집는다.
  const lo = 1;
  const hi = end >= 0 && end !== s ? path.length - 2 : path.length - 1;
  const total = (pp: number[]) => pathCost(cost, pp)
    + (returnTo >= 0 && pp.length > 1 ? cost[pp[pp.length - 1]][returnTo] : 0);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j <= hi; j++) {
        const next = path.slice();
        next.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
        if (total(next) < total(path) - 0.5) {
          path.splice(0, path.length, ...next);
          improved = true;
        }
      }
    }
  }
  return path;
}

/**
 * 거점과 당일치기를 배정한다.
 *
 * 기준은 {@link chooseBases} 에 있다 — 다섯 요소의 가중합으로 거점을 고르고
 * 편도 {@link DAY_TRIP_MAX_MIN} 분 안의 도시를 흡수한다. 여기서는 그 결과를
 * 방문 순서에 맞춰 Stop 으로 옮기고 날 수를 센다.
 *
 * 중요한 것은 이 함수가 '순서를 정하기 전에' 불린다는 점이다. 예전에는
 * 순서를 먼저 정하고 숙박을 나중에 정해서, 세고비아 → 톨레도처럼 실제로는
 * 아무도 타지 않는 구간이 생겼다.
 */
export function assignLodging(
  ordered: City[], itemDaysOf: (slug: string) => number,
  measured: Map<string, { minutes: number; mode: string }>,
  overrides: Record<string, 'sleep' | 'daytrip'> = {},
  endpoints: (string | null)[] = [],
  /** 사용자가 고른 교통수단. 근교 왕복 시간도 이것을 따른다. */
  picks: Record<string, string> = {},
  /** 0=일요일. 그 요일에 안 다니는 편은 빼고 센다. */
  weekday: number | null = null,
): Stop[] {
  const { bases, attach, scores } = chooseBases(ordered, itemDaysOf, measured, endpoints, overrides);
  const isBase = new Set(bases.map((b) => b.slug));
  const nameOf = (slug: string) => ordered.find((c) => c.slug === slug)?.name ?? slug;

  /**
   * 근교 왕복에 드는 시간.
   *
   * ## 방향을 지킨다 — 이것이 고친 것
   *
   * 가는 길과 오는 길은 방향이 다르고, 실제 시간표도 다르다. 예전에는
   * `servicesBetween(city, home)` — 실은 **오는** 방향 하나만 만들어 놓고
   * `totalMin * 2` 로 셌다. 어림 배차만 쓰던 때는 두 방향이 같은 값이라
   * 티가 나지 않았지만, 실제 시간표를 보게 된 뒤로는 다른 값이 된다.
   * 그라나다↔세비야가 오는 쪽 3시간 25분, 가는 쪽 3시간 35분이다.
   *
   * ## 여기서는 대기를 넣지 않는다 — 알면서 두는 것
   *
   * 이 숫자는 '몇 시에 나서는 하루' 가 아니라 **그 근교가 왕복 얼마짜리인가**
   * 이다. 당일치기가 될 만한 거리인지 재고(`DAY_TRIP_MAX_MIN`), 하루 예산에
   * 들어가는지 보는 데 쓴다. 그리고 이 앱의 하루 모델은 이 값을 **절반씩
   * 나눠** 네 군데에 쓴다(`roundTripMin / 2`). 한쪽 대기만 얹으면 그 절반이
   * 반대 방향 시간으로도 새어 든다.
   *
   * 화면에 뜨는 출발·도착 시각은 `planner` 가 실제 시간표로 따로 계산한다
   * (`bestFrom` · `nextDeparture`). 그래서 이 어림이 시각을 틀리게 하지
   * 않는다. 대기를 예산에까지 반영하려면 왕복을 반으로 접지 말고 가는 편·
   * 오는 편을 따로 들고 다녀야 하는데, 그건 하루 모델을 바꾸는 일이다.
   */
  const dayTripRound = (city: City, home: City, m?: { minutes: number; mode: string }) => {
    const wanted = picks[`${home.slug}>${city.slug}`] ?? picks[`${city.slug}>${home.slug}`];
    const outList = servicesBetween(home, city, m, weekday);
    const out = outList.find((o) => o.mode === wanted) ?? outList[0] ?? fastest(home, city, m);
    const backList = servicesBetween(city, home, m, weekday);
    const back = backList.find((o) => o.mode === out.mode) ?? backList[0] ?? out;
    return Math.round(out.totalMin + back.totalMin);
  };

  const stops: Stop[] = ordered.map((city) => {
    const sleep = isBase.has(city.slug);
    const base = sleep ? null : attach.get(city.slug) ?? null;
    const sc = scores.get(city.slug);
    return {
      city,
      itemDays: itemDaysOf(city.slug),
      nights: 0,
      sleep,
      base,
      /*
       * 근교 왕복도 사용자가 고른 수단을 따른다.
       *
       * 예전에는 언제나 가장 빠른 편으로 셌다. 그래서 4단계에서 근교 수단을
       * 바꿔도 왕복 시간이 그대로였고, 화면이 말하는 것과 계산이 어긋났다.
       */
      dayTripMin: base
        ? dayTripRound(city, ordered.find((c) => c.slug === base)!,
          measured.get(mkey(city.slug, base)))
        : 0,
      why: sc ? explainBase(sc, sleep, base ? nameOf(base) : undefined) : '',
    };
  });

  /*
   * 거점이 차지하는 날 = 자기 아이템 일수 + 자기에게 붙은 당일치기 수.
   * 당일치기는 낮을 통째로 쓰고 저녁에 거점으로 돌아오므로 하루로 센다.
   */
  for (const s of stops) {
    if (!s.sleep) continue;
    const attached = stops.filter((x) => !x.sleep && x.base === s.city.slug);
    s.nights = Math.max(1, Math.round(s.itemDays) + attached.length);
  }
  return stops;
}

/** 순서대로 이동 구간을 만든다. 당일치기는 숙박지 사이 이동에 끼지 않는다. */
export function buildHops(
  stops: Stop[], measured: Map<string, { minutes: number; mode: string }>,
  picks: Record<string, string> = {},
  /** 왕복이면 마지막에 돌아갈 도시. 그 구간도 실제로 타야 하므로 넣는다. */
  returnTo?: City,
  /** 0=일요일. 주면 그 요일에 실제로 다니는 편만 본다. */
  weekday: number | null = null,
  /** 아침에 나서는 시각(분). 대기까지 넣어 고르려면 필요하다. */
  readyAt: number = 9 * 60 + 30,
): Hop[] {
  const sleeping = stops.filter((s) => s.sleep).map((s) => s.city);
  if (returnTo && sleeping.length && sleeping[sleeping.length - 1].slug !== returnTo.slug) {
    sleeping.push(returnTo);
  }
  const hops: Hop[] = [];
  for (let i = 1; i < sleeping.length; i++) {
    const from = sleeping[i - 1];
    const to = sleeping[i];
    const options = servicesBetween(from, to, measured.get(mkey(from.slug, to.slug)), weekday);
    const wanted = picks[`${from.slug}>${to.slug}`];
    /*
     * 대기까지 넣어 고른다. `options[0]` 은 대기를 뺀 순서의 첫 번째라,
     * 편이 드문 구간에서 몇 시간을 역에서 보내는 안을 '가장 빠른 것' 이라
     * 부르곤 했다.
     */
    const chosen = bestFrom(options, readyAt, { prefer: wanted }) ?? options[0];
    const dep = nextDeparture(chosen, readyAt);
    hops.push({
      from, to, options, chosen,
      doorToDoorMin: dep ? dep.doorToDoorMin : chosen.totalMin,
    });
  }
  return hops;
}

/**
 * 전체를 조립한다.
 *
 * daysNeeded 는 아이템을 다 보는 데 필요한 날 + 도시 간 이동으로 날아가는
 * 날이다. 이동이 4시간을 넘으면 그날은 반나절이 사라지므로 0.5일,
 * 8시간을 넘으면 하루가 통째로 날아간다.
 */
export function buildItinerary(
  cities: City[], items: Item[], prefs: Preferences,
  startSlug: string | null, endSlug: string | null,
  allCities: City[],
  opts: {
    lodging?: Record<string, 'sleep' | 'daytrip'>;
    picks?: Record<string, string>;
    /** 사용자가 직접 정한 도시 순서. 있으면 최적화 대신 이것을 쓴다. */
    order?: string[];
    /** 여행 시작 요일(0=일). 요일마다 운행이 다른 편이 있다. */
    weekday?: number | null;
  } = {},
): Itinerary {
  const measured = measuredTable(allCities);
  const byCity = new Map<string, Item[]>();
  for (const it of items) {
    const l = byCity.get(it.city) ?? [];
    l.push(it);
    byCity.set(it.city, l);
  }
  /**
   * 이 도시에 며칠이 필요한가.
   *
   * 담은 아이템으로 계산한다. 아직 아무것도 담지 않았으면(1단계 미리보기)
   * 도시 성격에 적힌 권장 숙박일을 쓴다 — 0일로 두면 모든 도시가 당일치기로
   * 판정돼 미리보기가 실제 계획과 전혀 다른 모양이 된다.
   */
  const itemDaysOf = (slug: string) => {
    const list = byCity.get(slug);
    if (list && list.length) return estimateDays(list, prefs);
    const c = cities.find((x) => x.slug === slug);
    return c?.nights?.[0] ?? 1.5;
  };

  /*
   * 사용자가 순서를 직접 정했으면 그대로 따른다.
   *
   * 이동 시간 효율이 원칙이지만 그것이 전부는 아니다 - 특정 날짜에만 열리는
   * 축제, 친구와 만나기로 한 날처럼 앱이 알 수 없는 사정이 있다. 다만
   * 사용자가 정한 순서에도 교통편은 다시 찾는다.
   */
  const manual = opts.order?.length
    ? opts.order.map((slug) => cities.find((c) => c.slug === slug)).filter((c): c is City => !!c)
    : null;

  /*
   * 거점을 먼저 고르고, 거점끼리만 순서를 정한다.
   *
   * 순서를 먼저 정하면 '총 이동 시간 최소' 가 도시를 한 줄로 꿰어, 마드리드
   * → 세고비아 → 톨레도 같은 순서가 나오고 세고비아에서 톨레도로 가는
   * 렌터카 2시간 26분 구간이 생긴다. 실제로는 둘 다 마드리드에서 다녀온다.
   * 거점을 먼저 정하면 그런 구간이 아예 만들어지지 않는다.
   */
  /*
   * 편을 고를 때 쓰는 '나서는 시각'. 사용자가 정한 하루 시작 시각이다.
   * 늦게 나서는 사람은 아침 편을 놓치므로, 고르는 것 자체가 달라진다.
   */
  const readyAt = clampDayStart(prefs.dayStart);
  const placed = assignLodging(cities, itemDaysOf, measured, opts.lodging, [startSlug, endSlug],
    opts.picks ?? {}, opts.weekday ?? null);
  const baseCities = placed.filter((s) => s.sleep).map((s) => s.city);
  const baseOrder = manual && manual.length === cities.length
    ? manual.filter((c) => baseCities.some((b) => b.slug === c.slug))
    : orderCities(baseCities, startSlug, endSlug, measured);

  /*
   * 화면에 보이는 순서: 거점 순서대로 놓되, 그 거점에서 다녀오는 당일치기
   * 도시를 바로 뒤에 붙인다. 여행자가 실제로 지나가는 순서다.
   */
  const ordered: City[] = [];
  for (const b of baseOrder) {
    ordered.push(b);
    for (const s of placed) if (!s.sleep && s.base === b.slug) ordered.push(s.city);
  }
  for (const s of placed) if (!ordered.some((c) => c.slug === s.city.slug)) ordered.push(s.city);

  const byOrder = new Map(ordered.map((c, i) => [c.slug, i]));
  const stops = [...placed].sort((a, b) =>
    (byOrder.get(a.city.slug) ?? 0) - (byOrder.get(b.city.slug) ?? 0));
  // 왕복이면 마지막 도시에서 출발 도시로 돌아오는 구간도 실제로 타야 한다.
  const back = startSlug && startSlug === endSlug
    ? ordered.find((c) => c.slug === startSlug)
    : undefined;
  const hops = buildHops(stops, measured, opts.picks, back, opts.weekday ?? null, readyAt);

  const transitMin = hops.reduce((a, h) => a + h.doorToDoorMin, 0);
  const travelDays = hops.reduce((a, h) => (
    a + (h.doorToDoorMin >= 480 ? 1 : h.doorToDoorMin >= 240 ? 0.5 : 0)
  ), 0);
  const stayDays = stops.reduce((a, s) => a + (s.sleep ? s.itemDays : Math.max(s.itemDays, 1)), 0);

  return {
    stops,
    hops,
    daysNeeded: Math.max(1, Math.round((stayDays + travelDays) * 10) / 10),
    transitMin,
  };
}
