import type { Item, Plan, PlanDay, PlanEntry, PlanStyle, PlanTravel, Preferences, Priorities, Slot, ThemeId, TravelOption } from '../types';
import type { Itinerary } from './itinerary';
import type { Service } from './routing';
import { MODE_ICON, nextDeparture, servicesBetween } from './routing';
import { rankItems } from './scoring';
import { isMeal } from './capacity';
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

/**
 * 이 자리에 들어갈 수 있는가.
 *
 * 식사는 점심·저녁 자리에만 들어간다. 그래야 식당을 많이 담아도 다른
 * 일정이 밀리지 않는다 — 미식은 동선이 만드는 끼니 기회에 배정될 뿐,
 * 일정을 만들어 내지 않는다.
 *
 * 간식은 예외다. 츄러스나 시장 군것질은 끼니가 아니라 오전·오후에 끼우는
 * 일정이고, 데이터에도 그렇게 적혀 있다(bestSlots 에 morning/afternoon).
 */
function fitsSlot(item: Item, slot: Slot): boolean {
  const meal = isMeal(item);
  if (MEAL_SLOTS.has(slot)) return item.theme === 'food';
  if (slot === 'night') return item.theme === 'nightlife';
  if (meal) return false;
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
  dayTripMode: PlanDay['dayTripMode'] = undefined,
  /**
   * 공항 때문에 정해지는 그날의 앞뒤 한계(분).
   *
   * 첫날은 착륙하고 입국심사·시내 이동·짐 풀기가 끝난 뒤에야 시작할 수
   * 있고, 마지막 날은 공항으로 출발하기 전에 끝내야 한다. 달력 날짜만
   * 세면 오후 4시에 내리는 날에 오전 일정이 들어간다.
   */
  startAtMin: number | null = null,
  endByMin: number | null = null,
  /**
   * 장거리 비행으로 도착한 날인가.
   *
   * 한국에서 스페인은 직항 14시간, 경유면 16~20시간이다. 그렇게 내린 날
   * 밤 10시에 라운지 일정을 넣는 것은 — 실제로 그렇게 나왔다 — 몸으로는
   * 새벽 5시에 술을 마시라는 말이다. 도착일은 저녁까지만 쓴다.
   *
   * 비행 시간을 따로 묻지 않는 이유는, 한국에서 스페인으로 오는 길에
   * 짧은 것이 없기 때문이다. 물어봐야 답이 달라지지 않는다.
   */
  longHaulArrival = false,
): PlanDay {
  const inCity = pool.filter((p) => !used.has(p.item.id) && p.item.city === city);
  const anchor = inCity.find((p) => p.item.theme !== 'food' && p.item.theme !== 'nightlife');
  if (!anchor) return { date, dayIndex, city, isDayTrip, returnTo, travel, sleepAt, dayTripMode, entries: [], walkKm: 0 };

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
  const start = Math.max(base, arrival ?? 0, startAtMin ?? 0);
  // 도착일 오전만 쓰는 경우 점심 전에 끝낸다.
  const specs = spec.slots(start)
    .filter((s) => (morningOnly ? s.slot === 'morning' : true))
    // 장거리 비행으로 내린 날은 밤 일정을 넣지 않는다.
    .filter((s) => !(longHaulArrival && s.slot === 'night'));
  // 거점으로 돌아와 저녁을 먹으므로 근교라고 해서 하루를 일찍 끊지 않는다.
  const natural = morningOnly ? 13 * 60
    : longHaulArrival ? 22 * 60
      : isDayTrip && !returnTo ? 20 * 60 : 24 * 60 + 30;
  const lastCall = endByMin !== null ? Math.min(natural, endByMin) : natural;

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
    date, dayIndex, city, isDayTrip, returnTo, travel, sleepAt, dayTripMode, entries,
    walkKm: walkKmOf(entries.map((e) => e.item)),
  };
}

export interface PlanInput {
  items: Item[];
  /** 동선 엔진이 만든 여정 — 도시 순서·숙박·이동 수단. */
  itinerary: Itinerary;
  startDate: string;
  days: number;
  prefs: Preferences;
  priorities: Priorities;
  /** 사용자가 손으로 정한 하루 안 순서. 날짜 → 아이템 id 순서. */
  dayOrder?: Record<string, string[]>;
  /**
   * 공항이 정하는 여행의 앞뒤(분).
   * 첫날 일정을 시작할 수 있는 시각과, 마지막 날 끝내야 하는 시각.
   * 시각을 안 넣었으면 undefined 이고 예전처럼 달력 일수로 짠다.
   */
  firstDayStart?: number | null;
  lastDayEnd?: number | null;
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
  /** 근교를 다녀오는 날 무엇을 타고 가는가. */
  dayTripMode?: { icon: string; label: string; minutes: number };
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
): {
  schedule: DayPlanSlot[];
  overflow: { city: string; name: string; days: number }[];
  /** 채우지 못하고 남은 날. 볼거리가 모자란다는 뜻이다. */
  spare: number;
} {
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
      // 근교로 무엇을 타고 가는가. 렌터카는 뺀다 — 근교 하루를 위해 차를
      // 빌리지는 않는다. 정기편이 없는 구간에서만 차가 남는다.
      const svc = servicesBetween(stop.city, t.city);
      const ride = svc.find((x) => x.mode !== 'car') ?? svc[0];
      schedule.splice(insertAt + k, 0, {
        city: t.city.slug,
        isDayTrip: true,
        returnTo: stop.city.slug,
        returnMinutes: Math.round(t.dayTripMin / 2),
        returnAfter: t.city.itemCount < HALF_DAY_ITEM_FLOOR ? 'afternoon' : 'dinner',
        travel: null,
        sleepAt: stop.city.slug,
        dayTripMode: ride
          ? { icon: MODE_ICON[ride.mode], label: ride.label, minutes: ride.totalMin }
          : undefined,
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
  /*
   * 날이 남으면 숙박지들에 고르게 나눈다.
   *
   * 예전에는 마지막 도시 뒤에 붙였는데, 14일 일정에서 그라나다가 2박에서
   * 5박이 되어 1단계 미리보기와 전혀 다른 계획이 나왔다. 마지막 도시에서만
   * 나흘을 더 보내는 것은 아무도 원한 적 없는 배치다.
   *
   * 새 도시를 끼워 넣지는 않는다 — 사용자가 고르지 않은 도시를 앱이 밀어
   * 넣는 것은 월권이다.
   */
  let spare = 0;
  if (schedule.length > 0 && schedule.length < totalDays) {
    /*
     * 볼거리가 많은 도시에 더 준다.
     *
     * 처음에는 순번대로 돌렸는데, 작은 도시 넷을 고른 7일 일정에서 세고비아가
     * 4일을 받았다. 수도교 하나를 보러 나흘을 머물 사람은 없다. 각 도시에
     * 실제로 몇 일치가 있는지(itemDays)에 비례해 나눈다.
     */
    const sleepStops = itin.stops.filter((s) => s.sleep);
    const weights = sleepStops.map((s) => Math.max(0.2, s.itemDays));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let extra = totalDays - schedule.length;

    // 최대 몫 순으로 한 장씩 나눠 준다(최대 잔여법).
    const given = new Array(sleepStops.length).fill(0);
    while (extra > 0) {
      let best = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < sleepStops.length; i++) {
        // 이미 자기 몫보다 많이 받았으면 점수가 떨어진다.
        const score = weights[i] / totalW - given[i] / Math.max(1, totalDays - schedule.length);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      // 볼거리가 하루치도 안 되는 도시에는 더 주지 않는다.
      const stop = sleepStops[best];
      if (given[best] + stop.nights >= Math.ceil(stop.itemDays) + 2) {
        // 모든 도시가 배부르면 남은 날은 그대로 둔다.
        if (sleepStops.every((st, i) => given[i] + st.nights >= Math.ceil(st.itemDays) + 2)) break;
        weights[best] = 0.001;
        continue;
      }
      given[best] += 1;
      extra -= 1;
    }

    sleepStops.forEach((stop, i) => {
      for (let k = 0; k < given[i]; k++) {
        let insert = schedule.length;
        for (let j = schedule.length - 1; j >= 0; j--) {
          if (schedule[j].city === stop.city.slug) { insert = j + 1; break; }
        }
        const src = schedule.find((d) => d.city === stop.city.slug);
        if (src) schedule.splice(insert, 0, { ...src, travel: null });
      }
    });

    /*
     * 그래도 날이 남으면 마지막 도시에 붙인다.
     *
     * 채울 것이 없다고 달력을 짧게 끝내면 안 된다 - 사용자는 그날에도
     * 스페인에 있다. 며칠이 비는지는 spare 로 알려 화면에서 말하게 한다.
     */
    spare = totalDays - schedule.length;
    while (schedule.length < totalDays && schedule.length > 0) {
      schedule.push({ ...schedule[schedule.length - 1], travel: null });
    }
  }
  return { schedule, overflow, spare };
}

export function buildPlans(input: PlanInput): {
  plans: Plan[];
  overflow: { city: string; name: string; days: number }[];
  spare: number;
} {
  /*
   * 후보는 담은 것만이 아니다 — 별을 주지 않은 것도 취향 점수만으로 남아
   * 3안의 다양성을 만든다. 그래서 4단계에서 뺀 것을 그냥 별만 지우면
   * 아무 일도 일어나지 않았다. 빼도 그 자리에 다시 들어오거나, 애초에
   * 별이 없던 식당은 눌러도 사라지지 않았다.
   *
   * 우선순위에 0 이 **적혀 있는** 것은 '이건 빼 달라' 는 뜻이다. 키가
   * 아예 없는 것(별을 준 적 없음)과는 다르다.
   */
  const ranked = rankItems(input.items, input.prefs, input.priorities)
    .filter((r) => r.score > -20 && input.priorities[r.item.id] !== 0);
  const { schedule, overflow, spare } = scheduleFromItinerary(
    input.itinerary, input.days, DAY_START[input.prefs.dayStart],
  );

  const plans = STYLES.map((spec) => {
    const used = new Set<string>();
    const days: PlanDay[] = schedule.map((s, i) => {
      const isLast = i === schedule.length - 1;
      const startAt = i === 0 ? input.firstDayStart ?? null : null;
      const endBy = isLast ? input.lastDayEnd ?? null : null;
      /*
       * 마지막 날은 출국 시각이 정한다.
       *
       * 예전에는 '없음/오전만/종일' 을 사람에게 고르게 하고 기본을 '오전만'
       * 으로 두었다. 그건 "오후 비행기가 흔하니까" 라는 추측이었고, 실제로
       * 정하는 것은 비행기 시각이다. 시각을 넣었으면 그것을 쓰고, 안 넣었으면
       * 하루를 다 쓴다 — 모르면서 반나절을 잘라내지 않는다.
       */
      const lastDay = !isLast ? 'full'
        : endBy !== null && endBy <= DAY_START[input.prefs.dayStart] + 60 ? 'none' : 'full';
      if (lastDay === 'none') {
        return {
          date: addDays(input.startDate, i), dayIndex: i + 1, city: s.city,
          isDayTrip: s.isDayTrip, returnTo: null, travel: s.travel, sleepAt: s.sleepAt,
          dayTripMode: s.dayTripMode, entries: [], walkKm: 0,
        };
      }
      return buildDay(
        ranked, used, spec, input.prefs, addDays(input.startDate, i), i + 1,
        // '오전만' 은 더 이상 쓰지 않는다. 마지막 날은 출국 시각으로 잘린다.
        s.city, s.isDayTrip, false, s.returnTo, s.returnMinutes, s.returnAfter,
        s.travel, s.sleepAt, s.dayTripMode, startAt, endBy,
        // 첫날에 착륙 시각이 들어왔다면 장거리 비행으로 내린 날이다.
        i === 0 && startAt !== null,
      );
    });

    // 사용자가 손으로 바꾼 순서를 마지막에 반영한다. 시각은 다시 계산한다 —
    // 순서만 바꾸고 시각을 그대로 두면 15시 일정이 9시 일정보다 앞에 온다.
    const ordered = days.map((d) => reorderDay(d, input.dayOrder?.[d.date], spec, input.prefs));

    const all = ordered.flatMap((d) => d.entries.map((e) => e.item));
    const themeMix: Partial<Record<ThemeId, number>> = {};
    for (const it of all) themeMix[it.theme] = (themeMix[it.theme] ?? 0) + 1;

    return {
      style: spec.style,
      title: spec.title,
      summary: spec.summary,
      days: ordered,
      stats: {
        items: all.length,
        walkKm: Math.round(ordered.reduce((a, d) => a + d.walkKm, 0) * 10) / 10,
        costEur: all.reduce((a, i) => a + (i.priceEur ?? 0), 0),
        themeMix,
      },
    };
  });

  return { plans, overflow, spare };
}

/**
 * 하루 안의 일정 순서를 사용자가 정한 대로 바꾸고 시각을 다시 계산한다.
 *
 * 순서만 바꾸고 시각을 그대로 두면 15시 일정이 9시 일정보다 앞에 오는
 * 앞뒤가 안 맞는 표가 된다. 앞 일정이 끝나는 시각에 이동 시간을 더해
 * 다시 쌓는다. 슬롯 이름(오전·점심)은 새 시각에 맞춰 다시 붙인다.
 */
function reorderDay(
  day: PlanDay, order: string[] | undefined, spec: StyleSpec, prefs: Preferences,
): PlanDay {
  if (!order || order.length === 0 || day.entries.length < 2) return day;
  const byId = new Map(day.entries.map((e) => [e.item.id, e]));
  const seq = order.map((id) => byId.get(id)).filter((e): e is PlanEntry => !!e);
  for (const e of day.entries) if (!seq.includes(e)) seq.push(e);
  if (seq.length !== day.entries.length) return day;

  const first = day.entries[0];
  let clock = first.startMin;
  const entries: PlanEntry[] = seq.map((e, i) => {
    const prev = i > 0 ? seq[i - 1].item : null;
    const travelMin = e.returnLeg ? e.travelMin : prev ? travelMinutes(prev, e.item) : 0;
    const startMin = i === 0 ? first.startMin : clock + travelMin + spec.slack;
    clock = startMin + e.item.durationMin;
    return { ...e, startMin, travelMin, slot: slotAt(startMin, prefs) };
  });
  return { ...day, entries, walkKm: walkKmOf(entries.map((e) => e.item)) };
}

/** 시각에 맞는 시간대 이름. 순서를 바꾼 뒤 라벨을 다시 붙이는 데 쓴다. */
function slotAt(min: number, prefs: Preferences): Slot {
  const start = DAY_START[prefs.dayStart];
  if (min >= 22 * 60) return 'night';
  if (min >= 20 * 60 + 15) return 'dinner';
  if (min >= 18 * 60) return 'evening';
  if (min >= 15 * 60) return 'afternoon';
  if (min >= 13 * 60) return 'lunch';
  return min >= start ? 'morning' : 'morning';
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '오전', lunch: '점심', afternoon: '오후', evening: '저녁 무렵', dinner: '저녁 식사', night: '밤',
};
