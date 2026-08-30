import type { Item, LastDayPlan, Plan, PlanDay, PlanEntry, PlanStyle, PlanTravel, Preferences, Priorities, Slot, ThemeId, TravelOption } from '../types';
import type { Itinerary } from './itinerary';
import type { Service } from './routing';
import { MODE_ICON, nextDeparture } from './routing';
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
  returnTo: string | null = null,
  returnMinutes = 0,
  returnAfter: 'afternoon' | 'dinner' = 'afternoon',
  /** 이 날 아침에 도시를 옮겼다면 그 구간. 일정은 도착 시각부터 시작한다. */
  travel: PlanTravel | null = null,
  sleepAt: string | null = null,
): PlanDay {
  const inCity = pool.filter((p) => !used.has(p.item.id) && p.item.city === city);
  const anchor = inCity.find((p) => p.item.theme !== 'food' && p.item.theme !== 'nightlife');
  if (!anchor) return { date, dayIndex, city, isDayTrip, returnTo, travel, sleepAt, entries: [], walkKm: 0 };

  const proximity = (item: Item) => {
    if (!hasCoords(item) || !hasCoords(anchor.item)) return 0.6;
    const km = distanceKm(item, anchor.item);
    return 1 / (1 + (km / spec.radiusKm) ** 2);
  };

  /*
   * 하루가 언제 시작하는가.
   *
   * 도시를 옮긴 날은 도착 시각부터다. 오전 9시 반에 시작한다고 해 놓고
   * 실제로는 오후 1시에 도착하는 도시에 오전 일정을 넣으면, 그 일정은
   * 현실에서 통째로 불가능하다. 이것이 '이동 시간을 고려하지 않은 일정'
   * 의 정체였다. 짐을 풀고 나오는 30분을 더 준다.
   */
  const arrival = travel ? travel.arriveAt + 30 : null;
  const base = DAY_START[prefs.dayStart] + (isDayTrip ? 75 : 0);
  const start = arrival !== null ? Math.max(base, arrival) : base;
  // 도착일 오전만 쓰는 경우 점심 전에 끝낸다.
  const specs = spec.slots(start).filter((s) => (morningOnly ? s.slot === 'morning' : true));
  // 거점으로 돌아와 저녁을 먹으므로 근교라고 해서 하루를 일찍 끊지 않는다.
  const lastCall = morningOnly ? 13 * 60 : isDayTrip && !returnTo ? 20 * 60 : 24 * 60 + 30;

  // 근교에서 하루를 보내도 저녁은 거점으로 돌아와 먹는다. 소도시는 저녁
  // 식당이 일찍 닫고, 돌아오는 막차도 있기 때문이다. 몬세라트처럼 볼거리가
  // 스무 개도 안 되는 곳은 아예 오후부터 거점으로 돌린다.
  const homePool = returnTo ? pool.filter((p) => p.item.city === returnTo) : [];
  const backAfter = new Set<Slot>(
    returnAfter === 'afternoon'
      ? ['afternoon', 'evening', 'dinner', 'night']
      : ['dinner', 'night'],
  );

  const entries: PlanEntry[] = [];
  let clock = start;
  let returned = false;

  for (const { slot, earliest, latest } of specs) {
    const away = returnTo !== null && backAfter.has(slot);
    const source = away ? homePool : inCity;
    const candidates = source
      .filter((p) => !used.has(p.item.id) && fitsSlot(p.item, slot))
      .map((p) => ({ ...p, adjusted: p.score * (away ? 1 : proximity(p.item)) }))
      .sort((a, b) => b.adjusted - a.adjusted);
    if (!candidates.length) continue;

    const prev = entries[entries.length - 1]?.item ?? null;
    const pick = candidates[0];
    // 도시를 옮기는 구간은 조사한 도시 간 이동 시간을 쓴다.
    const crossing = away && !returned;
    const travelMin = crossing ? returnMinutes : prev ? travelMinutes(prev, pick.item) : 0;

    const startMin = Math.max(clock + travelMin + (prev ? spec.slack : 0), earliest);
    if (startMin > latest || startMin + pick.item.durationMin > lastCall) continue;

    entries.push({
      slot, startMin, item: pick.item, travelMin,
      ...(crossing ? { returnLeg: { from: city, to: returnTo!, minutes: returnMinutes } } : {}),
    });
    if (crossing) returned = true;
    used.add(pick.item.id);
    clock = startMin + pick.item.durationMin;
  }

  return {
    date, dayIndex, city, isDayTrip, returnTo, travel, sleepAt, entries,
    walkKm: walkKmOf(entries.map((e) => e.item)),
  };
}

export interface PlanInput {
  items: Item[];
  /** 동선 엔진이 만든 여정 — 도시 순서·숙박·이동 수단. */
  itinerary: Itinerary;
  startDate: string;
  days: number;
  lastDayPlan: LastDayPlan;
  prefs: Preferences;
  priorities: Priorities;
}

/** 고른 근교를 다 넣지 못했을 때 알려 주기 위한 값. */
export interface PlanWarning { kind: 'daytrip-dropped'; cities: string[] }

/**
 * 여정(도시 순서·숙박·이동)을 달력에 편다.
 *
 * 예전에는 거점 묶음을 순서대로 늘어놓고 날짜만 잘랐다. 도시를 옮기는 데
 * 걸리는 시간이 어디에도 반영되지 않아, 오후 1시에 도착하는 도시에 오전
 * 일정이 들어가 있었다. 이제는 이동 구간이 하루를 차지하고, 도착 시각이
 * 그날 일정의 시작 시각이 된다.
 *
 * 날이 모자라면 잘라내지 않고 넘치는 만큼을 돌려준다 — 무엇을 뺄지는
 * 사용자가 정할 일이지 앱이 조용히 정할 일이 아니다.
 */
export interface DayPlanSlot {
  city: string;
  isDayTrip: boolean;
  returnTo: string | null;
  returnMinutes: number;
  returnAfter: 'afternoon' | 'dinner';
  travel: PlanTravel | null;
  sleepAt: string | null;
}

/** 이만큼도 안 되는 도시에 하루를 통째로 주면 오후가 빈다. 실측으로 정한 값이다. */
const HALF_DAY_ITEM_FLOOR = 20;

const toOption = (s: Service): TravelOption => ({
  mode: s.mode,
  label: s.label,
  icon: MODE_ICON[s.mode],
  totalMin: s.totalMin,
  rideMin: s.rideMin,
  costEur: s.costEur,
  transfers: s.transfers,
  estimated: s.estimated,
  note: s.note,
});

export function scheduleFromItinerary(
  itin: Itinerary, totalDays: number, dayStartMin: number,
): { schedule: DayPlanSlot[]; overflow: { city: string; name: string; days: number }[] } {
  const schedule: DayPlanSlot[] = [];
  const sleeping = itin.stops.filter((s) => s.sleep);
  const hopOf = new Map(itin.hops.map((h) => [`${h.from.slug}>${h.to.slug}`, h]));

  sleeping.forEach((stop, i) => {
    const prev = sleeping[i - 1];
    const hop = prev ? hopOf.get(`${prev.city.slug}>${stop.city.slug}`) : undefined;

    let travel: PlanTravel | null = null;
    if (hop) {
      const dep = nextDeparture(hop.chosen, dayStartMin);
      const alive = hop.options.filter((o) => nextDeparture(o, dayStartMin) !== null);
      travel = {
        from: hop.from.slug,
        to: hop.to.slug,
        chosen: toOption(hop.chosen),
        leaveAt: dep?.leaveAt ?? dayStartMin,
        departAt: dep?.departAt ?? dayStartMin,
        arriveAt: dep?.arriveAt ?? dayStartMin + hop.chosen.totalMin,
        waitMin: dep?.waitMin ?? 0,
        options: alive.map(toOption),
        unavailable: hop.options.filter((o) => !alive.includes(o)).map((o) => o.label),
      };
    }

    // 이 숙박지에 붙은 당일치기들.
    const trips = itin.stops.filter((x) => !x.sleep && x.base === stop.city.slug);
    const baseDays = Math.max(1, stop.nights - trips.length);

    for (let d = 0; d < baseDays; d++) {
      schedule.push({
        city: stop.city.slug, isDayTrip: false, returnTo: null, returnMinutes: 0,
        returnAfter: 'dinner',
        travel: d === 0 ? travel : null,
        sleepAt: stop.city.slug,
      });
    }
    // 근교는 거점 일정 사이에 끼운다. 이동한 날 바로 근교로 보내지 않는다.
    const insertAt = schedule.length - baseDays + Math.min(1, baseDays);
    trips.forEach((t, k) => {
      schedule.splice(insertAt + k, 0, {
        city: t.city.slug,
        isDayTrip: true,
        returnTo: stop.city.slug,
        returnMinutes: Math.round(t.dayTripMin / 2),
        returnAfter: t.city.itemCount < HALF_DAY_ITEM_FLOOR ? 'afternoon' : 'dinner',
        travel: null,
        sleepAt: stop.city.slug,
      });
    });
  });

  // 날이 모자라면 잘라내되, 무엇이 밀려났는지 돌려준다.
  const overflow: { city: string; name: string; days: number }[] = [];
  if (schedule.length > totalDays) {
    const cut = schedule.splice(totalDays);
    const byCity = new Map<string, number>();
    for (const c of cut) byCity.set(c.city, (byCity.get(c.city) ?? 0) + 1);
    for (const [slug, days] of byCity) {
      const st = itin.stops.find((x) => x.city.slug === slug);
      overflow.push({ city: slug, name: st?.city.name ?? slug, days });
    }
  }
  while (schedule.length < totalDays && schedule.length > 0) {
    // 날이 남으면 마지막 숙박지에서 더 머문다. 새 도시를 끼워 넣지 않는다 —
    // 사용자가 고르지 않은 도시를 앱이 밀어 넣는 것은 월권이다.
    const last = schedule[schedule.length - 1];
    schedule.push({ ...last, travel: null });
  }
  return { schedule, overflow };
}

export function buildPlans(input: PlanInput): {
  plans: Plan[];
  overflow: { city: string; name: string; days: number }[];
} {
  const ranked = rankItems(input.items, input.prefs, input.priorities).filter((r) => r.score > -20);
  const { schedule, overflow } = scheduleFromItinerary(
    input.itinerary, input.days, DAY_START[input.prefs.dayStart],
  );

  const plans = STYLES.map((spec) => {
    const used = new Set<string>();
    const days: PlanDay[] = schedule.map((s, i) => {
      const isLast = i === schedule.length - 1;
      const lastDay = isLast ? input.lastDayPlan : 'full';
      if (lastDay === 'none') {
        return {
          date: addDays(input.startDate, i), dayIndex: i + 1, city: s.city,
          isDayTrip: s.isDayTrip, returnTo: null, travel: s.travel, sleepAt: s.sleepAt,
          entries: [], walkKm: 0,
        };
      }
      return buildDay(
        ranked, used, spec, input.prefs, addDays(input.startDate, i), i + 1,
        s.city, s.isDayTrip, lastDay === 'morning', s.returnTo, s.returnMinutes, s.returnAfter,
        s.travel, s.sleepAt,
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

  return { plans, overflow };
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '오전', lunch: '점심', afternoon: '오후', evening: '저녁 무렵', dinner: '저녁 식사', night: '밤',
};
