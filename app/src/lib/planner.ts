import type { Item, LastDayPlan, Plan, PlanDay, PlanEntry, PlanStyle, Preferences, Priorities, Slot, ThemeId } from '../types';
import type { BaseGroup } from './basing';
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
  morningOnly = false,
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
  // 도착일 오전만 쓰는 경우 점심 전에 끝낸다.
  const specs = spec.slots(start).filter((s) => (morningOnly ? s.slot === 'morning' : true));
  const lastCall = morningOnly ? 13 * 60 : isDayTrip ? 20 * 60 : 24 * 60 + 30;

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
  /** 1단계에서 판정한 거점과 근교. 근교는 사용자가 직접 고른 곳이므로 반드시 넣는다. */
  groups: BaseGroup[];
  startDate: string;
  days: number;
  lastDayPlan: LastDayPlan;
  prefs: Preferences;
  priorities: Priorities;
}

/** 고른 근교를 다 넣지 못했을 때 알려 주기 위한 값. */
export interface PlanWarning { kind: 'daytrip-dropped'; cities: string[] }

/**
 * 일자별로 어느 도시에 있을지 정한다.
 *
 * 근교 도시는 사용자가 직접 고른 곳이므로 "여유가 되면"이 아니라 반드시 넣는다.
 * 거점에 최소 하루는 남겨야 하므로, 날이 모자라면 들어가지 못한 근교를 알려 준다.
 */
function assignCities(groups: BaseGroup[], totalDays: number): {
  schedule: { city: string; isDayTrip: boolean }[];
  dropped: string[];
} {
  const schedule: { city: string; isDayTrip: boolean }[] = [];
  const dropped: string[] = [];

  for (const g of groups) {
    const nights = Math.max(1, g.nights);
    // 거점에 최소 하루는 남긴다. 근교만 다니다 끝나면 묵는 의미가 없다.
    const tripSlots = Math.max(0, Math.min(g.dayTrips.length, nights - 1));
    const trips = g.dayTrips.slice(0, tripSlots);
    dropped.push(...g.dayTrips.slice(tripSlots).map((t) => t.city.name));

    const baseDays = nights - trips.length;
    // 첫날은 거점에서 시작한다. 도착 직후 먼 이동을 시키지 않기 위해서다.
    for (let i = 0; i < baseDays; i++) schedule.push({ city: g.base.slug, isDayTrip: false });
    const inserted = trips.map((t) => ({ city: t.city.slug, isDayTrip: true }));
    // 근교를 거점 일정 사이에 끼워 넣어 이동이 몰리지 않게 한다.
    inserted.forEach((d, i) => schedule.splice(Math.min(1 + i * 2, schedule.length), 0, d));
  }

  while (schedule.length > totalDays) schedule.pop();
  while (schedule.length < totalDays && schedule.length > 0) {
    schedule.push(schedule[schedule.length - 1]);
  }
  return { schedule, dropped };
}

export function buildPlans(input: PlanInput): { plans: Plan[]; dropped: string[] } {
  const ranked = rankItems(input.items, input.prefs, input.priorities).filter((r) => r.score > -20);
  const { schedule, dropped } = assignCities(input.groups, input.days);

  const plans = STYLES.map((spec) => {
    const used = new Set<string>();
    const days: PlanDay[] = schedule.map((s, i) => {
      const isLast = i === schedule.length - 1;
      const lastDay = isLast ? input.lastDayPlan : 'full';
      if (lastDay === 'none') {
        return { date: addDays(input.startDate, i), dayIndex: i + 1, city: s.city, isDayTrip: s.isDayTrip, entries: [], walkKm: 0 };
      }
      return buildDay(
        ranked, used, spec, input.prefs, addDays(input.startDate, i), i + 1,
        s.city, s.isDayTrip, lastDay === 'morning',
      );
    });

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

  return { plans, dropped };
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '오전', lunch: '점심', afternoon: '오후', evening: '저녁 무렵', dinner: '저녁 식사', night: '밤',
};
