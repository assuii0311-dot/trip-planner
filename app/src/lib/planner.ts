import type { City, Item, Plan, PlanDay, PlanEntry, PlanStyle, Preferences, Priorities, Slot, ThemeId } from '../types';
import { rankItems } from './scoring';
import { distanceKm, hasCoords, travelMinutes, walkKmOf } from './geo';

const DAY_START: Record<Preferences['dayStart'], number> = { early: 8 * 60, normal: 9.5 * 60, late: 11 * 60 };

/**
 * A slot is a window, not just an order.
 * Without a latest time an itinerary drifts — five short stops in a row put
 * "저녁 무렵" at 13:33 — and without an earliest time lunch lands at 11:00.
 */
interface SlotSpec { slot: Slot; earliest: number; latest: number }

const S = (slot: Slot, earliest: number, latest: number): SlotSpec => ({ slot, earliest, latest });

const MEAL_SLOTS = new Set<Slot>(['lunch', 'dinner']);

interface StyleSpec {
  style: PlanStyle;
  title: string;
  summary: string;
  /** 하루 슬롯 구성. 같은 slot 이 두 번 오면 그 시간대에 두 곳을 넣는다. */
  slots: (start: number) => SlotSpec[];
  /** 이 반경(km)을 넘어가면 같은 날에 묶는 점수가 급격히 떨어진다. */
  radiusKm: number;
  /** 활동 사이 여유 시간(분). */
  slack: number;
}

/** 스페인 기준 식사 시간. 점심 14시, 저녁 21시가 현지 리듬이다. */
const STYLES: StyleSpec[] = [
  {
    style: 'packed',
    title: '알찬형',
    summary: '고른 곳을 최대한 많이 담습니다. 하루 여섯 곳 안팎으로 이동이 잦고 하루가 깁니다.',
    slots: (start) => [
      S('morning', start, 11 * 60 + 30),
      S('morning', start + 90, 12 * 60 + 30),
      S('lunch', 13 * 60, 15 * 60 + 30),
      S('afternoon', 15 * 60, 18 * 60),
      S('afternoon', 16 * 60, 19 * 60),
      S('evening', 18 * 60, 20 * 60 + 30),
      S('dinner', 20 * 60 + 30, 22 * 60 + 30),
      S('night', 22 * 60, 24 * 60 + 30),
    ],
    radiusKm: 3,
    slack: 0,
  },
  {
    style: 'balanced',
    title: '균형형',
    summary: '핵심은 놓치지 않으면서 이동과 휴식의 균형을 맞춥니다. 하루 네 곳 안팎입니다.',
    slots: (start) => [
      S('morning', start, 12 * 60),
      S('lunch', 13 * 60, 15 * 60 + 30),
      S('afternoon', 15 * 60 + 30, 18 * 60 + 30),
      S('afternoon', 16 * 60 + 30, 19 * 60 + 30),
      S('dinner', 20 * 60 + 30, 22 * 60 + 30),
      S('night', 22 * 60, 24 * 60),
    ],
    radiusKm: 2.5,
    slack: 20,
  },
  {
    style: 'relaxed',
    title: '여유형',
    summary: '하루 두 곳만 천천히. 한 동네에 머물며 쉬는 시간을 넉넉히 둡니다.',
    slots: (start) => [
      S('morning', start + 30, 12 * 60 + 30),
      S('lunch', 13 * 60 + 30, 15 * 60 + 30),
      S('afternoon', 16 * 60, 19 * 60),
      S('dinner', 20 * 60 + 30, 22 * 60 + 30),
    ],
    radiusKm: 1.8,
    slack: 45,
  },
];

function fitsSlot(item: Item, slot: Slot): boolean {
  if (MEAL_SLOTS.has(slot)) return item.theme === 'food';
  if (slot === 'night') return item.theme === 'nightlife';
  if (item.theme === 'food') return false;
  return item.bestSlots.length === 0 || item.bestSlots.includes(slot);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 하루치 일정.
 * 그날 가장 점수가 높은 볼거리를 앵커로 잡고, 앵커에서 멀어질수록 점수를
 * 급격히 깎아 같은 동네 안에서 하루가 돌아가게 만든다.
 */
function buildDay(
  pool: { item: Item; score: number }[],
  used: Set<string>,
  spec: StyleSpec,
  prefs: Preferences,
  date: string,
  dayIndex: number,
  city: string,
  isDayTrip: boolean,
): PlanDay {
  const inCity = pool.filter((p) => !used.has(p.item.id) && p.item.city === city);
  const anchor = inCity.find((p) => p.item.theme !== 'food' && p.item.theme !== 'nightlife');
  if (!anchor) return { date, dayIndex, city, isDayTrip, entries: [], walkKm: 0 };

  const proximity = (item: Item) => {
    if (!hasCoords(item) || !hasCoords(anchor.item)) return 0.6;
    const km = distanceKm(item, anchor.item);
    return 1 / (1 + (km / spec.radiusKm) ** 2);
  };

  // 당일치기는 오가는 시간이 있어 하루가 늦게 시작하고 일찍 끝난다.
  const start = DAY_START[prefs.dayStart] + (isDayTrip ? 75 : 0);
  const specs = spec.slots(start);
  const lastCall = isDayTrip ? 20 * 60 : 24 * 60 + 30;

  const entries: PlanEntry[] = [];
  let clock = start;

  for (const { slot, earliest, latest } of specs) {
    const candidates = inCity
      .filter((p) => !used.has(p.item.id) && fitsSlot(p.item, slot))
      .map((p) => ({ ...p, adjusted: p.score * proximity(p.item) }))
      .sort((a, b) => b.adjusted - a.adjusted);
    if (!candidates.length) continue;

    const prev = entries[entries.length - 1]?.item ?? null;
    const pick = candidates[0];
    const travelMin = prev ? travelMinutes(prev, pick.item) : 0;

    const startMin = Math.max(clock + travelMin + (prev ? spec.slack : 0), earliest);
    if (startMin > latest || startMin + pick.item.durationMin > lastCall) continue;

    entries.push({ slot, startMin, item: pick.item, travelMin });
    used.add(pick.item.id);
    clock = startMin + pick.item.durationMin;
  }

  return { date, dayIndex, city, isDayTrip, entries, walkKm: walkKmOf(entries.map((e) => e.item)) };
}

export interface PlanInput {
  items: Item[];
  cities: City[];
  baseCities: string[];
  startDate: string;
  days: number;
  prefs: Preferences;
  priorities: Priorities;
}

/**
 * 여행 일수를 도시에 배분한다.
 * 거점 도시를 순서대로 채우고, 당일치기 의향이 있으면 3일차 이후 하루를
 * 근교 도시에 내준다.
 */
function assignCities(input: PlanInput): { city: string; isDayTrip: boolean }[] {
  const { baseCities, days, prefs, cities, items } = input;
  const byCity = new Map(cities.map((c) => [c.slug, c]));
  const itemCityCount = new Map<string, number>();
  for (const it of items) itemCityCount.set(it.city, (itemCityCount.get(it.city) ?? 0) + 1);

  const schedule: { city: string; isDayTrip: boolean }[] = [];
  const perCity = Math.max(1, Math.floor(days / baseCities.length));
  for (const slug of baseCities) {
    for (let i = 0; i < perCity && schedule.length < days; i++) schedule.push({ city: slug, isDayTrip: false });
  }
  while (schedule.length < days) schedule.push({ city: baseCities[baseCities.length - 1], isDayTrip: false });

  if (prefs.dayTripAppetite >= 2 && days >= 3) {
    const swaps = prefs.dayTripAppetite >= 3 ? Math.min(2, Math.floor(days / 3)) : 1;
    let done = 0;
    for (let i = 2; i < schedule.length && done < swaps; i++) {
      const hub = byCity.get(schedule[i].city);
      const trip = hub?.dayTrips
        .filter((t) => (itemCityCount.get(t.city) ?? 0) >= 8)
        .sort((a, b) => (itemCityCount.get(b.city) ?? 0) - (itemCityCount.get(a.city) ?? 0))[0];
      if (!trip) continue;
      if (schedule.some((s) => s.city === trip.city)) continue;
      schedule[i] = { city: trip.city, isDayTrip: true };
      done++;
    }
  }
  return schedule;
}

export function buildPlans(input: PlanInput): Plan[] {
  const ranked = rankItems(input.items, input.prefs, input.priorities).filter((r) => r.score > -20);
  const schedule = assignCities(input);

  return STYLES.map((spec) => {
    const used = new Set<string>();
    const days: PlanDay[] = schedule.map((s, i) =>
      buildDay(ranked, used, spec, input.prefs, addDays(input.startDate, i), i + 1, s.city, s.isDayTrip),
    );

    const all = days.flatMap((d) => d.entries.map((e) => e.item));
    const themeMix: Partial<Record<ThemeId, number>> = {};
    for (const it of all) themeMix[it.theme] = (themeMix[it.theme] ?? 0) + 1;

    return {
      style: spec.style,
      title: spec.title,
      summary: spec.summary,
      days,
      stats: {
        items: all.length,
        walkKm: Math.round(days.reduce((a, d) => a + d.walkKm, 0) * 10) / 10,
        costEur: all.reduce((a, i) => a + (i.priceEur ?? 0), 0),
        themeMix,
      },
    };
  });
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '오전', lunch: '점심', afternoon: '오후', evening: '저녁 무렵', dinner: '저녁 식사', night: '밤',
};
