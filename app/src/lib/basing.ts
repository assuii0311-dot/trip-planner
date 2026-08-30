import type { City } from '../types';
import { buildTransitTable, transitBetween, isDayTrippable, type TransitLeg } from './transit';
import { josa, withJosa } from './korean';

/** 한 거점과 거기서 다녀올 근교들. */
export interface BaseGroup {
  base: City;
  /** 사용자가 고르지 않았는데 시스템이 거점으로 제안한 경우. */
  baseSuggested: boolean;
  dayTrips: { city: City; leg: TransitLeg }[];
  nights: number;
  /** 왜 이 도시를 거점으로 골랐는지. 화면에 그대로 보여 준다. */
  reason: string;
}

/** 거점이 될 수 있는 최소 조건. 숙소와 교통이 있어야 한다. */
const canHost = (city: City) => city.nights[1] > 0;

/** 거점으로서의 매력. 볼거리가 많고 여러 밤 묵을 만할수록 높다. */
function baseQuality(city: City): number {
  return city.itemCount * 0.35 + city.nights[1] * 12 + (city.isHub ? 15 : 0);
}

/**
 * 고른 도시들을 거점 단위로 묶는다.
 *
 * 하나씩 탐욕적으로 묶으면 숙소를 네 번 옮기는 계획이 나온다. 여행자에게
 * 중요한 것은 "숙소를 몇 번 옮기느냐"이므로, 고른 도시를 모두 담되 거점 수를
 * 최소로 하는 집합 덮개 문제로 푼다.
 *
 * 후보에는 고르지 않은 도시도 넣는다. 톨레도·세고비아·아빌라만 고른 경우
 * 정답은 '마드리드에 묵기'인데 마드리드는 사용자가 고르지 않았기 때문이다.
 * 다만 고른 도시를 우선하고, 밖에서 끌어온 경우에는 이유를 붙인다.
 */
export function assignBases(selected: City[], all: City[], totalDays: number): BaseGroup[] {
  if (selected.length === 0) return [];
  const table = buildTransitTable(all);
  const selectedSlugs = new Set(selected.map((c) => c.slug));

  const reach = (base: City, target: City) =>
    base.slug === target.slug || isDayTrippable(transitBetween(base, target, table));

  const candidates = all.filter(canHost).map((city) => ({
    city,
    isSelected: selectedSlugs.has(city.slug),
    covers: selected.filter((t) => reach(city, t)).map((t) => t.slug),
  }));

  const uncovered = new Set(selected.map((c) => c.slug));
  const chosen: { city: City; isSelected: boolean; covers: string[] }[] = [];

  while (uncovered.size > 0) {
    const scored = candidates
      .filter((c) => !chosen.some((x) => x.city.slug === c.city.slug))
      .map((c) => ({ ...c, gain: c.covers.filter((s) => uncovered.has(s)).length }))
      .filter((c) => c.gain > 0)
      .sort((a, b) =>
        // 더 많이 덮는 쪽 → 고른 도시 → 거점으로서 나은 쪽
        b.gain - a.gain
        || Number(b.isSelected) - Number(a.isSelected)
        || baseQuality(b.city) - baseQuality(a.city),
      );

    if (scored.length === 0) {
      // 어떤 거점으로도 닿지 않는 도시는 스스로 거점이 된다.
      const orphan = selected.find((c) => uncovered.has(c.slug))!;
      chosen.push({ city: orphan, isSelected: true, covers: [orphan.slug] });
      uncovered.delete(orphan.slug);
      continue;
    }

    const pick = scored[0];
    chosen.push(pick);
    pick.covers.forEach((s) => uncovered.delete(s));
  }

  // 각 거점에 실제로 배정할 근교를 정한다. 한 도시가 여러 거점에 걸치면
  // 이동 시간이 가장 짧은 거점에 붙인다.
  const groups: BaseGroup[] = chosen.map((c) => ({
    base: c.city,
    baseSuggested: !c.isSelected,
    dayTrips: [],
    nights: 0,
    reason: '',
  }));

  for (const city of selected) {
    if (groups.some((g) => g.base.slug === city.slug)) continue;
    const best = groups
      .map((g) => ({ g, leg: transitBetween(g.base, city, table) }))
      .filter((x) => isDayTrippable(x.leg))
      .sort((a, b) => a.leg.minutes - b.leg.minutes)[0];
    if (best) best.g.dayTrips.push({ city, leg: best.leg });
  }

  for (const g of groups) {
    g.dayTrips.sort((a, b) => a.leg.minutes - b.leg.minutes);
    g.reason = explain(g);
  }

  return distributeNights(groups, totalDays);
}

/** 왕복 3시간이 넘으면 하루가 이동으로 상당 부분 사라진다. */
const LONG_DAY_MIN = 90;

/**
 * 왜 이 도시에 묵는지 설명한다.
 *
 * 검증할 수 없는 말을 쓰지 않는다. 도시마다 숙소 사정이 어떤지는 가진
 * 데이터로 알 수 없으므로 "숙소가 마땅치 않다" 같은 문장은 넣지 않는다.
 * 대신 확실히 아는 것만 말한다 — 숙소를 몇 번 옮기게 되는지, 이동이 몇 분인지.
 */
function explain(g: BaseGroup): string {
  if (g.dayTrips.length === 0) {
    return `${withJosa(g.base.name, '은는')} 볼거리가 ${g.base.itemCount}개라 이 도시만으로 며칠을 채울 수 있습니다.`;
  }

  const names = g.dayTrips.map((t) => t.city.name).join('·');
  const last = g.dayTrips[g.dayTrips.length - 1].city.name;
  const long = g.dayTrips.filter((t) => t.leg.minutes >= LONG_DAY_MIN);

  const head = g.baseSuggested
    ? `고르신 ${names}${josa(last, '은는')} 각각에 묵으면 숙소를 ${g.dayTrips.length}번 옮겨야 합니다. `
      + `고르지 않으셨지만 ${g.base.name}에 묵으면 한 곳에서 모두 다녀올 수 있습니다.`
    : `${g.base.name}에 묵으면 ${names}${josa(last, '을를')} 당일치기로 다녀올 수 있습니다.`;

  if (long.length === 0) return head;
  const longNames = long
    .map((t) => `${t.city.name} 왕복 ${Math.round((t.leg.minutes * 2) / 30) / 2}시간`)
    .join(', ');
  return `${head} 다만 ${longNames}이라 그날은 이동이 깁니다.`;
}

/**
 * 일수를 거점에 나눈다.
 * 거점 자체에 필요한 밤 수와 근교 개수에 비례해 배분하고,
 * 남는 날은 볼거리가 가장 많은 거점에 준다.
 */
function distributeNights(groups: BaseGroup[], totalDays: number): BaseGroup[] {
  const weights = groups.map((g) => Math.max(1, g.base.nights[1]) + g.dayTrips.length);
  const sum = weights.reduce((a, b) => a + b, 0);

  let assigned = 0;
  groups.forEach((g, i) => {
    g.nights = Math.max(1, Math.floor((totalDays * weights[i]) / sum));
    assigned += g.nights;
  });

  let diff = totalDays - assigned;
  const order = groups
    .map((g, i) => ({ i, size: g.base.itemCount + g.dayTrips.length * 20 }))
    .sort((a, b) => b.size - a.size);
  let cursor = 0;
  let guard = 0;
  while (diff !== 0 && order.length > 0 && guard++ < 500) {
    const target = groups[order[cursor % order.length].i];
    if (diff > 0) { target.nights++; diff--; }
    else if (target.nights > 1) { target.nights--; diff++; }
    cursor++;
  }
  return groups;
}

/**
 * 입국·출국 도시에 맞춰 거점 순서를 돌린다.
 *
 * 마드리드로 들어와 바르셀로나에서 나가는 사람에게 바르셀로나부터 도는
 * 일정을 주면, 첫날과 마지막 날에 대륙을 가로지르는 이동이 붙는다.
 * 어느 그룹에도 없는 도시를 지정했으면 아무것도 하지 않는다.
 */
export function orderGroups(
  groups: BaseGroup[], startCity: string | null, endCity: string | null,
): BaseGroup[] {
  const has = (g: BaseGroup, slug: string) =>
    g.base.slug === slug || g.dayTrips.some((t) => t.city.slug === slug);

  const out = [...groups];
  if (startCity) {
    const i = out.findIndex((g) => has(g, startCity));
    if (i > 0) out.unshift(...out.splice(i, 1));
  }
  if (endCity) {
    const i = out.findIndex((g) => has(g, endCity));
    // 입국 도시와 같은 그룹이면 옮기지 않는다 - 왕복이라 순서가 무의미하다.
    if (i >= 0 && i < out.length - 1 && !(startCity && has(out[i], startCity))) {
      out.push(...out.splice(i, 1));
    }
  }
  return out;
}
