import type { Item, Plan, PlanDay, PlanEntry, PlanStyle, PlanTravel, Preferences, Priorities, Slot, ThemeId, TravelOption } from '../types';
import type { Itinerary } from './itinerary';
import type { Service } from './routing';
import { MODE_ICON, nextDeparture, servicesBetween } from './routing';
import { rankItems } from './scoring';
import { dailyMinutes, isMeal, itemMinutes } from './capacity';
import { GRACE_MIN, packDays, type MoveTiming, type PackedDay } from './daypack';
import { distanceKm, hasCoords, travelMinutes, walkKmOf } from './geo';
import { addDays } from './caldate';

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

/**
 * 하루치 일정.
 * 그날 가장 점수가 높은 볼거리를 앵커로 잡고, 앵커에서 멀어질수록 점수를
 * 급격히 깎아 같은 동네 안에서 하루가 돌아가게 만든다.
 */
/**
 * 하루치 일정.
 *
 * 하루는 **구간(segment)의 줄** 이다. 한 날에 도시가 둘 이상 들어갈 수 있으므로
 * (반나절 도시 둘, 오후에 옮기는 날, 근교를 다녀오는 날) 구간을 순서대로
 * 소진하며 슬롯을 채운다.
 *
 * 두 가지를 지킨다.
 *
 * 1. **저녁식사와 밤은 언제나 그날 자는 도시에서.** 근교에 있든 옮기는 중이든
 *    저녁 자리는 `sleepAt` 의 후보에서 고른다. 소도시는 저녁 식당이 일찍 닫고
 *    돌아오는 막차도 있다.
 * 2. **마감에 60분 여유.** 앞 일정이 밀려 20분이 모자란다고 저녁을 통째로
 *    비우지 않는다. 다만 **공항 마감은 1분도 넘기지 않는다** — 비행기를
 *    놓치기 때문이다.
 *
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
  slot: DayPlanSlot,
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
   */
  longHaulArrival = false,
): PlanDay {
  const segments = slot.segments.length
    ? slot.segments
    : [{ city: slot.city, minutes: 0, inboundMin: 0, isDayTrip: false, base: null, roundTripMin: 0 }];
  /*
   * 근교에서 몇 시에 돌아오는가는 그날 일정이 정하고, 일정은 계획안(빡빡·
   * 보통·느긋)마다 다르다. 그래서 사본을 만들어 안마다 따로 채운다.
   */
  const travels: PlanTravel[] = slot.travels.map((t) => (t.kind === 'daytrip' ? { ...t } : t));
  const sleepAt = slot.sleepAt ?? segments[segments.length - 1].city;

  const bare = (): PlanDay => ({
    date, dayIndex, city: slot.city, isDayTrip: slot.isDayTrip, returnTo: slot.returnTo,
    travels, sleepAt: slot.sleepAt, dayTripMode: slot.dayTripMode,
    segments, moveTiming: slot.moveTiming, entries: [], walkKm: 0,
  });

  const free = (city: string) => pool.filter((p) => !used.has(p.item.id) && p.item.city === city);
  const anchor = free(segments[0].city).find((p) => p.item.theme !== 'food' && p.item.theme !== 'nightlife')
    ?? free(sleepAt).find((p) => p.item.theme !== 'food' && p.item.theme !== 'nightlife');
  if (!anchor) return bare();

  const proximity = (item: Item) => {
    if (!hasCoords(item) || !hasCoords(anchor.item)) return 0.6;
    const km = distanceKm(item, anchor.item);
    return 1 / (1 + (km / spec.radiusKm) ** 2);
  };

  /*
   * 하루가 언제 시작하는가.
   *
   * 도시를 아침에 옮긴 날은 도착 시각부터다. 오전 9시 반에 시작한다고 해
   * 놓고 실제로는 오후 1시에 도착하는 도시에 오전 일정을 넣으면, 그 일정은
   * 현실에서 통째로 불가능하다. 짐을 풀고 나오는 30분을 더 준다.
   */
  const morning = travels.find((t) => t.kind === 'move' && t.timing === 'morning');
  const arrival = morning ? morning.arriveAt + 30 : null;
  /*
   * 근교도 실제로 닿는 시각부터 시작한다.
   *
   * 예전에는 하루 시작 시각 + 75분이라는 어림수를 썼다. 이제 몇 시 편을
   * 타는지 화면에 적으므로, 09:48 에 닿는다고 써 놓고 09:15 부터 일정을
   * 넣으면 그 자리에서 어긋난 것이 보인다.
   */
  const trip = travels.find((t) => t.kind === 'daytrip');
  const tripArrive = segments[0].isDayTrip && trip ? trip.arriveAt : null;
  const base = DAY_START[prefs.dayStart] + (segments[0].isDayTrip && !tripArrive ? 75 : 0);
  const start = Math.max(base, arrival ?? 0, tripArrive ?? 0, startAtMin ?? 0);

  const specs = spec.slots(start)
    // 장거리 비행으로 내린 날은 밤 일정을 넣지 않는다.
    .filter((s) => !(longHaulArrival && s.slot === 'night'));

  const natural = longHaulArrival ? 22 * 60 : 24 * 60 + 30;
  /* 자연 마감은 60분까지 봐 주고, 공항 마감은 봐 주지 않는다. */
  const limit = endByMin !== null ? Math.min(natural + GRACE_MIN, endByMin) : natural + GRACE_MIN;

  const entries: PlanEntry[] = [];
  let clock = start;
  let segIdx = 0;
  let segSpent = 0;
  let returned = false;

  for (const { slot: s, earliest, latest } of specs) {
    /*
     * 저녁과 밤은 자는 도시에서. 그 밖에는 지금 구간의 도시에서 고른다.
     * 구간에 배정된 시간을 다 쓰면 다음 구간으로 넘어가고, 넘어가는 데
     * 드는 이동 시간을 시계에 더한다.
     */
    while (segIdx < segments.length - 1 && segSpent >= segments[segIdx].minutes) {
      segIdx += 1;
      segSpent = 0;
      clock += segments[segIdx].inboundMin;
    }
    const seg = segments[segIdx];
    const atHome = s === 'dinner' || s === 'night';
    const city = atHome ? sleepAt : seg.city;
    const candidates = free(city)
      .filter((p) => fitsSlot(p.item, s))
      .map((p) => ({ ...p, adjusted: p.score * (city === seg.city ? proximity(p.item) : 1) }))
      .sort((a, b) => b.adjusted - a.adjusted);
    if (!candidates.length) continue;

    const prev = entries[entries.length - 1]?.item ?? null;
    const pick = candidates[0];
    // 근교에서 자는 도시로 돌아오는 구간은 조사한 왕복 시간의 절반을 쓴다.
    const crossing = atHome && seg.isDayTrip && !returned;
    const travelMin = crossing ? Math.round(seg.roundTripMin / 2)
      : prev && prev.city === pick.item.city ? travelMinutes(prev, pick.item) : 0;

    const startMin = Math.max(clock + travelMin + (prev ? spec.slack : 0), earliest);
    // 여유 60분 — 비는 것보다 늦게라도 하는 편이 낫다. 공항 마감은 예외.
    if (startMin > latest + GRACE_MIN) continue;
    if (startMin + pick.item.durationMin > limit) continue;

    entries.push({
      slot: s, startMin, item: pick.item, travelMin,
      ...(crossing ? { returnLeg: { from: seg.city, to: sleepAt, minutes: Math.round(seg.roundTripMin / 2) } } : {}),
    });
    if (crossing) returned = true;
    used.add(pick.item.id);
    clock = startMin + pick.item.durationMin;
    if (!atHome) segSpent += pick.item.durationMin;
  }

  /*
   * 근교에서 거점으로 돌아오는 편. 저녁을 먹으러 돌아오는 자리에 붙어 있다.
   * 예전에는 이 시각이 화면 어디에도 없어, 몇 시 차를 타야 하는지 알 수 없었다.
   */
  const home = entries.find((e) => e.returnLeg);
  if (home && trip) {
    trip.back = { leaveAt: home.startMin - home.travelMin, arriveAt: home.startMin };
  }

  return {
    ...bare(),
    entries,
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
   * 사용자가 정한 이동 시점. `"출발도시>도착도시"` → 아침/오후/저녁.
   * 없으면 규칙대로 자동으로 고른다.
   */
  moveTiming?: Record<string, MoveTiming>;
  /** 사용자가 고른 교통수단. 근교 왕복 안내도 이것을 따른다. */
  modePicks?: Record<string, string>;
  /** 0=일요일. 그 요일에 안 다니는 편은 근교 안내에서도 뺀다. */
  weekday?: number | null;
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
/**
 * 하루 안의 한 구간.
 *
 * 하루가 한 도시라는 법이 없다. 반나절 도시 둘을 이어 붙이거나, 오후에
 * 도시를 옮기거나, 근교를 다녀오는 날은 한 날에 도시가 둘 이상 들어간다.
 */
export interface DaySegment {
  city: string;
  /** 이 구간에 배정된 볼거리 시간(분). */
  minutes: number;
  /** 이 구간으로 들어오는 데 드는 이동 시간(분). 첫 구간은 0. */
  inboundMin: number;
  /** 짐을 두고 다녀오는가. */
  isDayTrip: boolean;
  /** 당일치기라면 어디서 다녀오는가. */
  base: string | null;
  /** 당일치기 왕복 시간(분). */
  roundTripMin: number;
}

export interface DayPlanSlot {
  /** 그날의 구간들. 순서대로 소진한다. */
  segments: DaySegment[];
  /** 그날 밤을 보내는 도시. 저녁식사와 밤 일정도 여기서 한다. */
  sleepAt: string | null;
  /** 그날 실제로 타는 구간들 — 짐을 옮기는 이동과 근교 왕복 모두. */
  travels: PlanTravel[];
  /** 짐을 옮긴 날이면 마지막 이동을 하루의 어디에서 했는가. */
  moveTiming: MoveTiming | null;

  /* ── 아래는 화면 호환용 파생값 ── */
  city: string;
  isDayTrip: boolean;
  returnTo: string | null;
  returnMinutes: number;
  returnAfter: 'afternoon' | 'dinner';
  /** 근교를 다녀오는 날 무엇을 타고 가는가. */
  dayTripMode?: { icon: string; label: string; minutes: number };
}

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

/**
 * 여정을 날로 나눈다.
 *
 * 예전에는 도시마다 정수 날을 배정하는 '칸 나누기' 였다. 그래서 볼거리가
 * 반나절치인 도시도 하루를 통째로 먹고, 이동은 예산 밖에 있었다. 이제는
 * {@link packDays} 가 시간 축으로 채우고, 여기서는 그 결과를 하루 단위
 * 계획 칸으로 옮기기만 한다.
 */
export function scheduleFromItinerary(
  itin: Itinerary, totalDays: number, dayStartMin: number,
  needMinOf: (slug: string) => number,
  budgetMin: number,
  timingOf: (from: string, to: string) => MoveTiming | undefined = () => undefined,
  /** 첫날 실제로 쓸 수 있는 볼거리 시간(분). 저녁에 내리면 하루가 아니다. */
  firstDayMin: number | null = null,
  /** 사용자가 고른 교통수단. `"출발도시>도착도시"` → 수단. 근교 왕복에도 쓴다. */
  modePicks: Record<string, string> = {},
  /** 0=일요일. 그 요일에 실제로 다니는 편만 본다. 근교 왕복에도 쓴다. */
  weekday: number | null = null,
): {
  schedule: DayPlanSlot[];
  overflow: { city: string; name: string; days: number }[];
  /** 채우지 못하고 남은 날. 볼거리가 모자란다는 뜻이다. */
  spare: number;
  /** 당일치기로는 다 못 보고 남은 시간(분). */
  unseen: Map<string, number>;
  /** 계획을 다 담는 데 필요한 날. 3단계도 이 값을 쓴다. */
  needDays: number;
} {
  const packed = packDays(itin, needMinOf, budgetMin, timingOf, firstDayMin);
  const pickOf = (key: string) => modePicks[key];
  const hopOf = new Map(itin.hops.map((h) => [`${h.from.slug}>${h.to.slug}`, h]));
  const cityOf = new Map(itin.stops.map((s) => [s.city.slug, s.city]));

  const toSlot = (d: PackedDay): DayPlanSlot => {
    const segments: DaySegment[] = d.legs.map((l, i) => ({
      city: l.city,
      minutes: l.minutes,
      // 첫 구간으로 들어오는 이동은 travel 로 따로 다룬다.
      inboundMin: i === 0 ? 0 : l.isDayTrip ? Math.round(l.roundTripMin / 2) : 0,
      isDayTrip: l.isDayTrip,
      base: l.base,
      roundTripMin: l.roundTripMin,
    }));

    /*
     * 그날 타는 것을 모두 적는다.
     *
     * 짐을 옮기는 이동이 하루에 두 번일 수 있고(아침에 들어와 저녁에 나가는
     * 날), 근교 왕복도 실제로 타는 구간이다. 예전에는 이동을 하나만 담아
     * 뒤엣것이 앞엣것을 덮어썼고, 근교는 한 줄짜리 배지가 전부였다.
     */
    const travels: PlanTravel[] = [];

    for (const m of d.moves) {
      const hop = hopOf.get(`${m.from}>${m.to}`);
      if (!hop) continue;
      /*
       * 몇 시에 나서는가는 시점이 정한다.
       *
       * 예전에는 언제나 하루 시작 시각에 나섰다. 그래서 도시 간 이동이
       * 전부 아침에 몰렸다. 이제는 오후·저녁 이동이면 그 시각부터 편을 찾는다.
       */
      const readyAt = m.timing === 'evening' ? 19 * 60
        : m.timing === 'midday' ? 15 * 60 + 30
          : dayStartMin;
      const dep = nextDeparture(hop.chosen, readyAt);
      const alive = hop.options.filter((o) => nextDeparture(o, readyAt) !== null);
      travels.push({
        from: hop.from.slug,
        to: hop.to.slug,
        chosen: toOption(hop.chosen),
        leaveAt: dep?.leaveAt ?? readyAt,
        departAt: dep?.departAt ?? readyAt,
        arriveAt: dep?.arriveAt ?? readyAt + hop.chosen.totalMin,
        waitMin: dep?.waitMin ?? 0,
        options: alive.map(toOption),
        unavailable: hop.options.filter((o) => !alive.includes(o)).map((o) => o.label),
        kind: 'move',
        timing: m.timing,
        back: null,
      });
    }

    const trip = segments.find((x) => x.isDayTrip);
    let ride: Service | undefined;
    if (trip && trip.base) {
      const from = cityOf.get(trip.base);
      const to = cityOf.get(trip.city);
      if (from && to) {
        /*
         * 근교도 짐 옮기는 이동과 같은 안내를 받는다 — 몇 시 편을 타고,
         * 얼마이고, 다른 수단이 무엇인지. 사용자가 고른 수단이 있으면 그것을 쓴다.
         */
        const svc = servicesBetween(from, to, undefined, weekday);
        const wanted = pickOf(`${trip.base}>${trip.city}`);
        ride = svc.find((o) => o.mode === wanted) ?? svc.find((x) => x.mode !== 'car') ?? svc[0];
        if (ride) {
          // 근교는 아침 일찍 나선다. 하루 시작 시각부터 편을 찾는다.
          const dep = nextDeparture(ride, dayStartMin);
          const alive = svc.filter((o) => nextDeparture(o, dayStartMin) !== null);
          travels.push({
            from: trip.base,
            to: trip.city,
            chosen: toOption(ride),
            leaveAt: dep?.leaveAt ?? dayStartMin,
            departAt: dep?.departAt ?? dayStartMin,
            arriveAt: dep?.arriveAt ?? dayStartMin + ride.totalMin,
            waitMin: dep?.waitMin ?? 0,
            options: alive.map(toOption),
            unavailable: svc.filter((o) => !alive.includes(o)).map((o) => o.label),
            kind: 'daytrip',
            timing: null,
            // 돌아오는 시각은 그날 일정이 정한다. buildDay 에서 채운다.
            back: null,
          });
        }
      }
    }

    return {
      segments,
      sleepAt: d.sleepAt,
      travels,
      moveTiming: d.moves.length ? d.moves[d.moves.length - 1].timing : null,
      city: segments[0]?.city ?? d.sleepAt,
      isDayTrip: !!segments[0]?.isDayTrip,
      returnTo: trip ? d.sleepAt : null,
      returnMinutes: trip ? Math.round(trip.roundTripMin / 2) : 0,
      returnAfter: 'dinner',
      dayTripMode: trip && ride
        ? { icon: MODE_ICON[ride.mode], label: ride.label, minutes: ride.totalMin }
        : undefined,
    };
  };

  const schedule = packed.days.map(toSlot);
  const needDays = schedule.length;

  // 날이 모자라면 뒤에서 잘라내되, 무엇이 밀려났는지 돌려준다.
  const overflow: { city: string; name: string; days: number }[] = [];
  if (schedule.length > totalDays) {
    const cut = schedule.splice(totalDays);
    const byCity = new Map<string, number>();
    for (const c of cut) byCity.set(c.city, (byCity.get(c.city) ?? 0) + 1);
    for (const [slug, days] of byCity) {
      overflow.push({ city: slug, name: cityOf.get(slug)?.name ?? slug, days });
    }
  }

  /*
   * 날이 남으면 도시들에 고르게 나눈다.
   *
   * 볼거리 분량이 곧 날이므로 남는 날은 '고른 곳을 다 봐도 날이 남는다' 는
   * 뜻이다. 채울 것이 없다고 달력을 짧게 끝내지는 않는다 — 사용자는 그날에도
   * 스페인에 있다. 다만 남는 날을 전부 마지막 도시 뒤에 붙이면 '세비야 8박'
   * 처럼 한 도시에 몰린다. 도시마다 돌아가며 하루씩 얹는다.
   */
  const spare = Math.max(0, totalDays - schedule.length);
  if (spare > 0 && schedule.length > 0) {
    // 같은 도시에서 자는 날의 마지막 자리를 도시별로 찾는다.
    const tail = new Map<string, number>();
    schedule.forEach((d, i) => { if (d.sleepAt) tail.set(d.sleepAt, i); });
    const blocks = [...tail.entries()].sort((a, b) => a[1] - b[1]);
    let k = 0;
    while (schedule.length < totalDays && blocks.length) {
      const [slug, at] = blocks[k % blocks.length];
      const src = schedule[Math.min(at, schedule.length - 1)];
      /*
       * 남는 날은 그 도시에서 쉬는 날이다.
       *
       * 예전에는 앞 날을 통째로 베끼고 구간만 비웠다. 그런데 앞 날이 근교
       * 당일치기였으면 `city`·`isDayTrip`·`dayTripMode` 까지 따라와서, 남는
       * 날이 **가는 길도 없는 두 번째 세고비아 당일치기**가 되었다. 짐을 둔
       * 도시에서 쉬는 날이라고 말해야 할 자리에 안 가는 근교가 들어앉은 것이다.
       */
      schedule.splice(at + 1, 0, {
        segments: [], sleepAt: src.sleepAt, travels: [], moveTiming: null,
        city: src.sleepAt ?? src.city, isDayTrip: false,
        returnTo: null, returnMinutes: 0, returnAfter: 'dinner',
      });
      // 뒤 블록의 자리가 한 칸씩 밀린다.
      for (let j = 0; j < blocks.length; j++) if (blocks[j][1] > at) blocks[j][1] += 1;
      blocks[k % blocks.length][1] = at + 1;
      void slug;
      k += 1;
    }
  }

  return { schedule, overflow, spare, unseen: packed.unseen, needDays };
}

export function buildPlans(input: PlanInput): {
  plans: Plan[];
  overflow: { city: string; name: string; days: number }[];
  spare: number;
  /** 당일치기로는 다 못 보고 남은 시간(분). */
  unseen: Map<string, number>;
  /** 담은 것을 다 담는 데 필요한 날. 3단계와 4단계가 같은 값을 쓴다. */
  needDays: number;
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
  /*
   * 도시별로 그 도시에서 보낼 볼거리 시간(분).
   *
   * 담은 것(별을 준 것)만 센다. 미식은 빼고 센다 — 식사는 동선이 만드는
   * 끼니 자리에 들어갈 뿐 일정을 만들지 않는다.
   */
  const needMinOf = (slug: string) => input.items
    .filter((i) => i.city === slug && (input.priorities[i.id] ?? 0) > 0 && !isMeal(i))
    .reduce((a, i) => a + itemMinutes(i), 0);

  /*
   * 첫날은 착륙하고 입국심사·시내 이동·짐 풀기가 끝난 뒤에야 시작한다.
   * 날을 나누는 쪽도 그것을 알아야 한다 — 모르면 못 들어갈 일정을 첫날에
   * 얹고, 실제로 짜는 쪽이 그걸 말없이 버린다.
   */
  const dayEndMin = 22 * 60;
  const firstDayMin = input.firstDayStart != null
    ? Math.max(0, Math.min(dailyMinutes(input.prefs), dayEndMin - input.firstDayStart))
    : null;

  const { schedule, overflow, spare, unseen, needDays } = scheduleFromItinerary(
    input.itinerary, input.days, DAY_START[input.prefs.dayStart],
    needMinOf, dailyMinutes(input.prefs),
    (from, to) => input.moveTiming?.[`${from}>${to}`],
    firstDayMin,
    input.modePicks ?? {},
    input.weekday ?? null,
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
          isDayTrip: s.isDayTrip, returnTo: null, travels: s.travels, sleepAt: s.sleepAt,
          dayTripMode: s.dayTripMode, segments: s.segments, moveTiming: s.moveTiming,
          entries: [], walkKm: 0,
        };
      }
      return buildDay(
        ranked, used, spec, input.prefs, addDays(input.startDate, i), i + 1, s,
        startAt, endBy,
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

  return { plans, overflow, spare, unseen, needDays };
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
