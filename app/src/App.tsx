import { useEffect, useMemo, useRef, useState } from 'react';
import type { Basics, CourseId, Item, PlanStyle, Preferences, Priorities, ThemeId, TripState } from './types';
import { loadCountry, loadItemsFor, loadRail, type CountryIndex } from './lib/data';
import type { RailTable } from './lib/rail';
import { clearState, defaultState, exportState, importState, isInstalled, loadState, saveState } from './lib/store';
import { hardRefetch } from './lib/refetch';
import { newerBuild } from './lib/update';
import { isOff, offList, urlWith } from './lib/rendermode';
import { DiagPanel } from './components/DiagPanel';
import { TroubleBanner } from './components/TroubleBanner';
import { mark } from './lib/diag';
import type { SaveResult } from './lib/store';
import { SaveStatus } from './components/SaveStatus';
import { ResumeBanner, StorageWarning } from './components/ResumeBanner';
import { airportOf, cityForAirport } from './lib/airports';
import { buildItinerary, measuredTable } from './lib/itinerary';
import { fastest } from './lib/routing';
import { expandIslandScope, rehomeIslandItems } from './lib/island';
import { buildPlans } from './lib/planner';
import { inferHints, inferThemes } from './lib/taste';
import { arrivalLeg, departureLeg, parseHm, tripWindow } from './lib/airporttime';
import Step1Basics, { tripDays } from './steps/Step1Basics';
import Step2Preferences from './steps/Step2Preferences';
import Step3Course from './steps/Step3Course';
import Step5Plans from './steps/Step5Plans';
import Step6Guide from './steps/Step6Guide';
import { weekdayOf } from './lib/caldate';
import { homeHref } from './lib/route';

const STEP_TITLES = ['기초 정보', '취향 확인', '코스 선택', '계획 3안', '이동·예약'];
const LAST_STEP = STEP_TITLES.length;

export default function App() {
  const [state, setState] = useState<TripState>(() => loadState());
  const [index, setIndex] = useState<CountryIndex | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 도시 아이템 받기 실패. 나라 데이터 실패(error)와 달리 화면은 살아 있다. */
  const [itemsError, setItemsError] = useState<string | null>(null);
  /** 서버에 더 새 판이 올라와 있는가. 있으면 지금 화면은 낡은 것이다. */
  const [stale, setStale] = useState(false);
  /** '다시 받기' 를 누른 횟수. 같은 도시라도 효과를 다시 돌리는 열쇠다. */
  const [itemsTry, setItemsTry] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState<SaveResult | null>(null);
  // '방금 → 3분 전' 이 저절로 바뀌도록 1분마다 현재 시각만 다시 읽는다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const r = saveState(state);
    if (!r.ok) mark(`저장 실패: ${r.reason}`);
    setSaved(r);
    setNow(Date.now());
  }, [state]);

  /**
   * 지난번 것이 복원됐는지는 첫 렌더 때 한 번만 판단한다.
   * 1단계에서 아무것도 안 한 상태면 알릴 것이 없다.
   */
  const [showResume, setShowResume] = useState(() => {
    const s = loadState();
    return Boolean(s.savedAt) && (s.step > 1 || s.basics.cities.length > 0);
  });

  /**
   * 홈 화면 앱이 아니면 저장분이 7일 뒤 지워질 수 있다.
   * 다만 아직 아무것도 안 고른 사람에게는 잃을 것이 없으니 알릴 이유도 없다.
   * 실제로 손이 쌓이기 시작한 뒤에 한 번만 띄운다.
   */
  const [warnDismissed, setWarnDismissed] = useState(false);
  const pickedCount = Object.values(state.priorities).filter((v) => v > 0).length;
  const showStorageWarning = !warnDismissed && !isInstalled() && pickedCount >= 5;

  const [rail, setRail] = useState<RailTable | null>(null);
  useEffect(() => {
    loadCountry(state.basics.country).then(setIndex).catch((e: Error) => setError(e.message));
    // 실제 시간표는 없어도 앱이 돌아가므로 따로 받고 실패해도 넘어간다.
    loadRail(state.basics.country).then(setRail);
  }, [state.basics.country]);

  /*
   * 새 판이 올라왔는지 확인한다.
   *
   * 아이패드 사파리는 탭을 그대로 되살린다. 앱을 '다시 열어도' 새로
   * 받아오는 항해가 일어나지 않아, 고쳐 놓은 것이 영원히 도달하지 않는다.
   * 실제로 두 판 뒤진 것을 쓰면서 같은 문제를 계속 겪은 일이 있었다.
   * 열 때와, 다른 앱에 갔다 돌아올 때 확인한다.
   */
  useEffect(() => {
    let alive = true;
    const look = () => {
      if (document.visibilityState !== 'visible') return;
      void newerBuild().then((b) => { if (alive && b) setStale(true); });
    };
    look();
    document.addEventListener('visibilitychange', look);
    return () => { alive = false; document.removeEventListener('visibilitychange', look); };
  }, []);

  const days = tripDays(state.basics);
  const selectedCities = useMemo(
    () => (index ? index.cities.filter((c) => state.basics.cities.includes(c.slug)) : []),
    [index, state.basics.cities],
  );

  /**
   * 이번 여행에서 밟는 도시 = 사용자가 고른 도시.
   *
   * 예전에는 '앱이 거점으로 제안한 도시' 까지 넣었다. 그래서 바르셀로나를
   * 골랐는데 사라고사에 묵으며 바르셀로나를 당일치기로 다녀오는 계획이
   * 나왔다. 고르지도 않은 도시에서 자게 만드는 것은 월권이고, 실제로 아무도
   * 그렇게 여행하지 않는다. 어디서 잘지는 동선 엔진이 고른 도시들 사이에서
   * 정한다.
   */
  const tripCities = selectedCities;

  /**
   * 공항이 어느 도시로 이어지는지.
   *
   * 공항 도시가 이번 여행에 없으면(마드리드로 들어와 안달루시아만 도는 경우)
   * 고른 도시 중 가장 가까운 곳으로 붙이고 몇 km 인지 알린다.
   */
  const arrival = useMemo(
    () => cityForAirport(airportOf(state.basics.startAirport), tripCities),
    [state.basics.startAirport, tripCities],
  );
  const departure = useMemo(
    () => cityForAirport(airportOf(state.basics.endAirport), tripCities),
    [state.basics.endAirport, tripCities],
  );

  /**
   * 아이템을 받아올 도시.
   *
   * 섬을 골랐으면 그 섬의 도시를 전부 불러온다. 섬에서는 렌터카로 30~40분이면
   * 반대편이라, 팔마에 묵으면서 데이아와 트라문타나를 다녀오는 것이 보통이다.
   * 고른 도시만 불러오면 그 섬의 절반이 후보에조차 오르지 않는다.
   */
  const cityScope = useMemo(
    () => (index ? expandIslandScope(state.basics.cities, index.cities, index.islands ?? []) : state.basics.cities),
    [index, state.basics.cities],
  );

  /*
   * 아이템 받아오기.
   *
   * 예전에는 실패하면 error 에만 적었다. 그런데 error 는 나라 데이터가 아직
   * 없을 때만 화면에 나오므로, 도시 아이템 받기가 실패하면 **아무 말 없이**
   * 빈 목록이 됐다 — 3단계에 아무것도 없고 왜인지 알 길이 없다. 게다가
   * 고른 도시가 그대로면 이 효과는 다시 돌지 않아 스스로 낫지도 않았다.
   * 이제는 화면에 적고, 눌러서 다시 받을 수 있게 한다.
   */
  useEffect(() => {
    if (isOff('items')) { setItems([]); setItemsError(null); return; }
    if (cityScope.length === 0) { setItems([]); setItemsError(null); return; }
    let alive = true;
    setLoadingItems(true);
    setItemsError(null);
    loadItemsFor(cityScope)
      .then((list) => {
        if (!alive) return;
        // 고르지 않은 섬 도시의 아이템은 가장 가까운 고른 도시로 옮겨 붙인다.
        setItems(index
          ? rehomeIslandItems(list, index.cities, index.islands ?? [], state.basics.cities)
          : list);
      })
      .catch((e: Error) => { if (alive) setItemsError(e.message); })
      .finally(() => { if (alive) setLoadingItems(false); });
    return () => { alive = false; };
  }, [cityScope.join(','), itemsTry]);

  /** 아이템 id → 도시. 코스를 갈아 끼울 때 그 도시 것만 골라내는 데 쓴다. */
  const itemCityOf = useMemo(() => new Map(items.map((i) => [i.id, i.city])), [items]);

  /** 고른 도시에서 역산한 테마 관심도. 2단계의 기본값이 된다. */
  const inferred = useMemo<Record<ThemeId, number>>(() => inferThemes(selectedCities), [selectedCities]);

  const patchBasics = (patch: Partial<Basics>) =>
    setState((s) => {
      const basics = { ...s.basics, ...patch };
      // 도시를 빼면 그 도시의 코스 선택도 함께 지운다.
      // 공항은 도시 선택과 무관하므로 건드리지 않는다 - 표를 이미 끊은
      // 사람이 도시를 바꿨다고 항공권이 바뀌지는 않는다.
      const live = new Set(basics.cities);
      const courses = Object.fromEntries(
        Object.entries(s.courses).filter(([slug]) => live.has(slug)),
      );
      // 굳혀 둔 도시 순서에서 빠진 도시를 지운다. 더해진 도시가 있으면
      // 순서를 통째로 놓아 엔진이 다시 최적으로 정하게 한다.
      const kept = s.cityOrder.filter((c) => live.has(c));
      const cityOrder = kept.length === basics.cities.length ? kept : [];
      return { ...s, basics, courses, cityOrder };
    });
  const patchPrefs = (patch: Partial<Preferences>) =>
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
  const setPriority = (id: string, v: 0 | 1 | 2 | 3) =>
    setState((s) => {
      const next = { ...s.priorities };
      if (v === 0) delete next[id]; else next[id] = v;
      return { ...s, priorities: next };
    });
  const setPriorities = (next: Priorities) => setState((s) => ({ ...s, priorities: next }));

  const goto = (step: number) => {
    mark(`단계 이동 → ${step}`);
    setState((s) => {
      // 2단계에 처음 들어갈 때 역산한 값을 채운다. 이후에는 사용자의 수정을 지킨다.
      if (step === 2 && !s.tasteConfirmed) {
        return {
          ...s, step,
          tasteConfirmed: true,
          prefs: { ...s.prefs, ...inferHints(selectedCities), themes: { ...inferred } },
        };
      }
      return { ...s, step };
    });
    window.scrollTo({ top: 0 });
  };

  /**
   * 4단계에서 일정 하나를 다른 곳(들)로 바꾼다.
   *
   * 계획은 우선순위에서 다시 만들어지므로, 뺀 것을 지우고 넣을 것에 별을
   * 주면 그대로 반영된다. 넣는 쪽에 별 3개를 주는 이유는, 방금 직접 고른
   * 것이 다음 계산에서 밀려나면 바꾼 것이 사라진 것처럼 보이기 때문이다.
   */
  const swapEntry = (out: Item, inItems: Item[]) =>
    setState((s) => {
      const next = { ...s.priorities };
      // 별만 지우면 점수가 높은 곳은 그대로 다시 뽑힌다. 0 을 적어 뺀다.
      next[out.id] = 0;
      for (const i of inItems) next[i.id] = 3;
      return { ...s, priorities: next };
    });

  /** 도시 간 이동을 하루의 어디에서 할지 사용자가 정한다. */
  const setMoveTiming = (from: string, to: string, t: 'morning' | 'midday' | 'evening') =>
    setState((s) => ({ ...s, moveTiming: { ...s.moveTiming, [`${from}>${to}`]: t } }));

  /**
   * 4단계에서 아이템 하나를 일정에서 뺀다.
   *
   * 우선순위에 0 을 적는다. 별을 지우기만 하면 아무 일도 일어나지 않는다 —
   * 별이 없는 아이템도 취향 점수만으로 후보에 남기 때문에, 뺀 자리에 그대로
   * 다시 들어오거나 애초에 별이 없던 식당은 눌러도 사라지지 않는다.
   * 3단계로 돌아가 다시 체크하면 되돌릴 수 있다.
   */
  const dropItem = (item: Item) =>
    setState((s) => ({ ...s, priorities: { ...s.priorities, [item.id]: 0 } }));

  /**
   * 여정 — 도시 순서·숙박·이동 수단.
   *
   * 3단계에서 담은 아이템으로 각 도시에 며칠이 필요한지 계산하고, 도시 간
   * 총 이동 시간이 가장 짧은 순서를 찾는다. 1단계에서 보여 준 도시별 일수는
   * 가이드일 뿐이고, 실제 일수는 여기서 아이템에 맞춰 다시 정해진다.
   */
  const pickedItems = useMemo(
    () => items.filter((i) => (state.priorities[i.id] ?? 0) > 0),
    [items, state.priorities],
  );
  const itinerary = useMemo(() => {
    if (!index || tripCities.length === 0) return null;
    return buildItinerary(
      tripCities, pickedItems, state.prefs,
      arrival?.slug ?? null, departure?.slug ?? null, index.cities,
      {
        lodging: state.lodging,
        picks: state.modePicks,
        order: state.cityOrder,
        // 요일마다 안 다니는 편이 있다. 출발일 요일로 거른다.
        weekday: weekdayOf(state.basics.startDate),
      },
    );
  }, [index, tripCities, pickedItems, state.prefs, arrival?.slug, departure?.slug,
    state.lodging, state.modePicks, state.cityOrder, state.basics.startDate, rail]);

  const setMode = (from: string, to: string, mode: string) =>
    setState((s) => ({ ...s, modePicks: { ...s.modePicks, [`${from}>${to}`]: mode } }));
  const setLodging = (city: string, how: 'sleep' | 'daytrip') =>
    setState((s) => ({ ...s, lodging: { ...s.lodging, [city]: how } }));
  /** 날이 모자랄 때 도시를 뺀다. 그 도시에 딸린 선택도 함께 정리한다. */
  const dropCity = (city: string) =>
    setState((s) => {
      const next: Priorities = {};
      for (const [id, v] of Object.entries(s.priorities)) {
        if (itemCityOf.get(id) !== city) next[id] = v;
      }
      const courses = { ...s.courses };
      delete courses[city];
      const lodging = { ...s.lodging };
      delete lodging[city];
      const cityDays = { ...s.cityDays };
      delete cityDays[city];
      return {
        ...s,
        basics: { ...s.basics, cities: s.basics.cities.filter((c) => c !== city) },
        priorities: next, courses, lodging, cityDays,
        cityOrder: s.cityOrder.filter((c) => c !== city),
      };
    });

  /**
   * 도시 순서를 한 칸 옮긴다.
   *
   * 처음 손대는 순간 지금 순서를 그대로 굳혀 두고 거기서 옮긴다. 굳히지
   * 않으면 다음 계산에서 엔진이 다시 최적 순서로 되돌려, 사용자가 옮긴
   * 것이 사라진 것처럼 보인다. 옮긴 뒤에는 교통편을 다시 찾는다.
   */
  const moveCity = (city: string, dir: -1 | 1) =>
    setState((s) => {
      const cur = s.cityOrder.length
        ? s.cityOrder
        : (itinerary?.stops.map((x) => x.city.slug) ?? s.basics.cities);
      const i = cur.indexOf(city);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return s;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, cityOrder: next };
    });

  /** 하루 안에서 일정을 한 칸 옮긴다. 시각은 플래너가 다시 계산한다. */
  const moveEntry = (date: string, itemId: string, dir: -1 | 1) =>
    setState((s) => {
      const day = chosenPlan?.days.find((d) => d.date === date);
      const cur = s.dayOrder[date] ?? day?.entries.map((e) => e.item.id) ?? [];
      const i = cur.indexOf(itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return s;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...s, dayOrder: { ...s.dayOrder, [date]: next } };
    });

  /**
   * 계획 3안.
   *
   * 예전에는 4단계 화면 안에서 만들어 ref 에 넣어 두었다. 그래서 5단계에서
   * 새로고침하면 - 4단계 화면이 한 번도 그려지지 않으므로 - 계획이 없는
   * 상태가 되어 지도도 예약 안내도 빈 화면이 됐다. 저장해 둔 계획으로
   * 돌아왔는데 마지막 장이 비어 있는 것은 저장이 안 된 것과 같다.
   *
   * 이제 여기서 만든다. 어느 단계를 보고 있든 계획은 존재한다.
   */
  /**
   * 공항이 정하는 여행의 앞뒤.
   *
   * 첫날은 착륙하고 입국심사·시내 이동·짐 풀기가 끝나야 시작할 수 있고,
   * 마지막 날은 공항으로 나서기 전에 끝내야 한다. 달력 날짜만 세면 오후
   * 4시에 내리는 날에 오전 일정이 들어간다.
   */
  const airportWindow = useMemo(() => {
    const inAt = parseHm(state.basics.arrivalTime);
    const outAt = parseHm(state.basics.departureTime);
    if (inAt === null && outAt === null) return null;
    const inAp = airportOf(state.basics.startAirport);
    const outAp = airportOf(state.basics.endAirport);
    const inCity = index?.cities.find((c) => c.slug === (arrival?.slug ?? inAp?.city));
    /*
     * 마지막 날 실제로 있는 도시.
     *
     * 왕복 항공권으로 마드리드에서 나가는 일정이라도 마지막 밤을 세비야에서
     * 보내면, 공항까지는 40분이 아니라 세비야→마드리드까지 얹은 시간이다.
     * 예전에는 공항이 속한 도시로만 계산해 비행기를 놓칠 안내를 했다.
     */
    const lastStop = itinerary?.stops.filter((x) => x.sleep).slice(-1)[0]?.city;
    const apCity = index?.cities.find((c) => c.slug === (departure?.slug ?? outAp?.city));
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const interMin = lastStop && apCity && lastStop.slug !== apCity.slug && index
      ? Math.round(fastest(lastStop, apCity,
        measuredTable(index.cities).get(key(lastStop.slug, apCity.slug))).totalMin)
      : 0;
    const w = tripWindow(
      days, inAt, outAt,
      inAp ? arrivalLeg(inAp, inCity) : null,
      outAp ? departureLeg(outAp, apCity, interMin) : null,
      9.5 * 60, 22 * 60,
    );
    return {
      ...w,
      arrivalTime: state.basics.arrivalTime,
      departureTime: state.basics.departureTime,
      arrivalAirport: inAp ? `${inAp.name} (${inAp.iata})` : null,
      departureAirport: outAp ? `${outAp.name} (${outAp.iata})` : null,
    };
  }, [state.basics.arrivalTime, state.basics.departureTime, state.basics.startAirport,
    state.basics.endAirport, arrival?.slug, index, days, itinerary]);

  const built = useMemo(() => {
    // 이 계산은 1단계에서도 돈다. 그 자체가 용의자일 수 있어 끌 수 있게 둔다.
    if (isOff('plans') && state.step < 4) return null;
    if (!itinerary || items.length === 0) return null;
    return buildPlans({
      items, itinerary,
      startDate: state.basics.startDate,
      days,
      prefs: state.prefs,
      priorities: state.priorities,
      dayOrder: state.dayOrder,
      moveTiming: state.moveTiming,
      // 근교 왕복 안내도 고른 수단과 요일을 따른다.
      modePicks: state.modePicks,
      weekday: weekdayOf(state.basics.startDate),
      firstDayStart: airportWindow?.firstDayStart ?? null,
      lastDayEnd: airportWindow?.lastDayEnd ?? null,
    });
  }, [itinerary, items, state.basics.startDate, days, state.step,
    state.prefs, state.priorities, state.dayOrder, state.moveTiming,
    state.modePicks, airportWindow]);

  const plans = built?.plans ?? [];

  /**
   * 지금 보고 있는 계획.
   *
   * 고르지 않았으면 첫 번째다 - 4단계도 같은 규칙으로 보여 준다. 예전에는
   * 4단계가 '첫 번째' 를 보여 주면서 상태에는 아무것도 기록하지 않아,
   * 화면에는 선택된 것처럼 보이는데 5단계로 넘어가면 '고른 계획이 없다' 는
   * 화면이 나왔다.
   */
  const chosenPlan = plans.find((p) => p.style === state.chosenPlan) ?? plans[0] ?? null;
  const choosePlan = (style: PlanStyle) => setState((s) => ({ ...s, chosenPlan: style }));

  const picked = Object.values(state.priorities).filter((v) => v > 0).length;

  /**
   * 3단계에서 아무것도 담기지 않은 도시.
   *
   * 예전 조건은 '여행 일수 × 2 개 이상' 이었다. 그런데 등급이 분량을
   * 정하게 된 뒤로 이 조건이 등급과 정면으로 부딪혔다 — 여덟 날 여행을
   * 세 도시에서 전부 찍먹으로 잡으면 9곳이라, 사용자가 고를 수 있게 만들어
   * 둔 선택을 고르면 다음 버튼이 잠겼다. 게다가 왜 잠겼는지 아무 데도
   * 적혀 있지 않아, 화면이 그냥 죽은 것처럼 보였다.
   *
   * 분량은 사용자가 정한다. 계획을 세울 수 없는 경우는 하나뿐이다 —
   * 들를 도시인데 그 도시에 담은 것이 하나도 없는 경우.
   */
  const emptyCities = useMemo(() => {
    if (!itinerary) return [];
    const has = new Set(pickedItems.map((i) => i.city));
    // 애초에 후보가 없는 도시는 사람이 담을 방법이 없다. 그런 도시를 조건에
    // 넣으면 영영 풀 수 없는 잠금이 된다.
    const avail = new Set(items.map((i) => i.city));
    return itinerary.stops
      .filter((s) => avail.has(s.city.slug) && !has.has(s.city.slug))
      .map((s) => s.city.name);
  }, [itinerary, items, pickedItems]);

  const canAdvance = (() => {
    switch (state.step) {
      case 1: return state.basics.cities.length > 0 && days > 0;
      case 2: return true;
      case 3: return picked > 0 && emptyCities.length === 0;
      case 4: return plans.length > 0;
      default: return false;
    }
  })();

  /**
   * 다음으로 갈 수 없으면 왜인지 적는다.
   *
   * 잠긴 버튼만 두면 무엇을 해야 풀리는지 알 길이 없다. 버튼을 누를 수
   * 없는 이유는 언제나 화면에 있어야 한다.
   */
  const blockedWhy = (() => {
    if (canAdvance) return null;
    switch (state.step) {
      case 1:
        return state.basics.cities.length === 0
          ? '가고 싶은 도시를 한 곳 이상 골라 주세요.'
          : '여행 날짜를 넣어 주세요.';
      case 3:
        return picked === 0
          ? '아직 담은 곳이 없습니다. 코스를 고르거나 아래 목록에서 담아 주세요.'
          : `${emptyCities.join(' · ')}에 담은 곳이 없습니다. `
            + '코스를 고르시거나, 그 도시를 여행에서 빼 주세요.';
      case 4:
        return '계획을 세우지 못했습니다. 3단계에서 담은 곳을 확인해 주세요.';
      default:
        return null;
    }
  })();

  /**
   * 코스를 고르면 그 도시의 기존 선택을 갈아 끼운다.
   *
   * 더하기가 아니라 갈아 끼우기다. 코스를 바꿔 가며 비교하는데 앞서 고른
   * 것이 계속 남으면, 세 코스를 다 눌러 본 사람은 세 코스를 합친 목록을
   * 갖게 된다. 다른 도시의 선택은 건드리지 않는다.
   */
  /**
   * 일수를 정해 그 도시의 아이템을 갈아 끼운다.
   * 코스 선택과 같은 규칙이다 — 더하지 않고 그 도시 것만 바꾼다.
   */
  const setCityDays = (city: string, wantDays: number, nextItems: Item[]) =>
    setState((s) => {
      const next: Priorities = {};
      for (const [id, v] of Object.entries(s.priorities)) {
        if (itemCityOf.get(id) !== city) next[id] = v;
      }
      for (const it of nextItems) next[it.id] = 2;
      return { ...s, priorities: next, cityDays: { ...s.cityDays, [city]: wantDays } };
    });

  const chooseCourse = (city: string, course: CourseId, courseItems: Item[]) =>
    setState((s) => {
      const next: Priorities = {};
      for (const [id, v] of Object.entries(s.priorities)) {
        if (itemCityOf.get(id) !== city) next[id] = v;
      }
      for (const it of courseItems) next[it.id] = 2;
      // 코스를 새로 고르면 손으로 맞춰 둔 일수는 놓아 준다.
      // 안 놓으면 4일치 코스를 담아 놓고 조절기가 '2일' 이라고 우긴다.
      const cityDays = { ...s.cityDays };
      delete cityDays[city];
      return { ...s, priorities: next, courses: { ...s.courses, [city]: course }, cityDays };
    });

  const onImport = async (file: File) => {
    try { setState(await importState(file)); }
    catch (e) { setError((e as Error).message); }
  };

  if (error && !index) {
    return (
      <div className="app"><main>
        <div className="empty">
          <p>{error}</p>
          <p className="help" style={{ marginTop: 8 }}>
            연결이 잠깐 끊겼을 수 있습니다. 다시 받아 보세요.
          </p>
          <div className="crash-btns" style={{ marginTop: 12 }}>
            <button type="button" className="primary" onClick={() => location.reload()}>다시 받기</button>
            <button type="button" onClick={() => void hardRefetch()}>받아 둔 것 비우고 새로 받기</button>
          </div>
        </div>
      </main></div>
    );
  }
  if (!index) {
    return <div className="app"><main><div className="spinner">여행지 데이터를 불러오는 중…</div></main></div>;
  }


  return (
    <div className="app">
      <header className="topbar">
        {/*
          나라 이름을 눌러 나라 고르는 곳으로 돌아간다.

          계획은 나라마다 따로 저장되므로 돌아갔다 와도 그대로 있다.
          그래서 '나갔다가 잃는다' 는 걱정 없이 눌러도 되고, 그 사실을
          작게 적어 둔다 — 안 적으면 아무도 안 누른다.
        */}
        <h1>
          <a className="country-back" href={homeHref()} title="다른 나라 고르기">
            {index.name} 여행 계획 <span aria-hidden="true">▾</span>
          </a>
        </h1>
        <div className="steps">
          {STEP_TITLES.map((t, i) => {
            const n = i + 1;
            return (
              <button
                key={t} type="button"
                aria-label={`${n}단계 ${t}`}
                data-state={n === state.step ? 'current' : n < state.step ? 'done' : 'todo'}
                disabled={n > state.step}
                onClick={() => goto(n)}
              />
            );
          })}
        </div>
        <div className="step-label">
          <span>{state.step}단계 · {STEP_TITLES[state.step - 1]}</span>
          <SaveStatus result={saved} now={now} />
          <span>{state.step} / {LAST_STEP}</span>
        </div>
      </header>

      <main>
        {/*
          스위치가 걸려 있으면 반드시 화면에 알린다. 모르고 쓰다가 '사진이
          안 나온다' 를 새 문제로 보고하게 되면 더 나빠진다.
        */}
        {offList().length > 0 && (
          <div className="mode-bar">
            문제 찾기 모드 — 끈 것: {offList().join(', ')} ·{' '}
            <a href={urlWith([])}>원래대로</a>
          </div>
        )}
        {showResume && (
          <ResumeBanner
            state={state} now={now}
            onDismiss={() => setShowResume(false)}
            onReset={() => {
              if (confirm('처음부터 다시 시작할까요? 지금까지 고른 것은 사라집니다.')) {
                clearState(); setState(defaultState()); setShowResume(false);
              }
            }}
          />
        )}
        {/*
          화면이 죽으면 아래쪽 진단 패널까지 내려갈 수가 없다. 다시 열렸을 때
          앱이 먼저 말해 주어야 그때 보낼 수 있다.
        */}
        <TroubleBanner />

        {stale && (
          <div className="notice update-bar">
            <b>새 판이 나와 있습니다.</b>
            <p className="help" style={{ margin: '6px 0 10px' }}>
              지금 보고 계신 화면은 예전 판입니다. 사파리가 탭을 그대로
              되살리면 새로 받아오지 않아, 고쳐 둔 것이 반영되지 않습니다.
            </p>
            <div className="crash-btns">
              <button type="button" className="primary" onClick={() => void hardRefetch()}>
                새 판으로 받기
              </button>
              <button type="button" onClick={() => setStale(false)}>나중에</button>
            </div>
          </div>
        )}
        {itemsError && (
          <div className="notice" style={{ marginBottom: 14 }}>
            <b>가볼 곳 목록을 받지 못했습니다.</b>
            <p className="help" style={{ margin: '6px 0 10px' }}>{itemsError}</p>
            <div className="crash-btns">
              <button type="button" className="primary" onClick={() => setItemsTry((n) => n + 1)}>
                다시 받기
              </button>
              <button type="button" onClick={() => void hardRefetch()}>받아 둔 것 비우고 새로 받기</button>
            </div>
          </div>
        )}
        {showStorageWarning && (
          <StorageWarning
            onExport={() => { exportState(state); setWarnDismissed(true); }}
            onDismiss={() => setWarnDismissed(true)}
          />
        )}

        {state.step === 1 && (
          <Step1Basics
            basics={state.basics} cities={index.cities} macroRegions={index.macroRegions}
            islands={index.islands}
            itinerary={itinerary} arrival={arrival} departure={departure}
            onChange={patchBasics}
          />
        )}
        {state.step === 2 && (
          <Step2Preferences
            prefs={state.prefs} selectedCities={selectedCities}
            inferred={inferred} onChange={patchPrefs}
          />
        )}
        {state.step === 3 && (
          loadingItems
            ? <div className="spinner">아이템을 모으는 중…</div>
            : (
              <Step3Course
                items={items} cities={index.cities} itinerary={itinerary}
                prefs={state.prefs} priorities={state.priorities}
                courses={state.courses} cityDays={state.cityDays} days={days}
                usableDays={airportWindow?.usableDays}
                firstDayStart={airportWindow?.firstDayStart ?? null}
                ui={state.ui ?? {}}
                onSet={setPriority} onBulk={setPriorities} onCourse={chooseCourse}
                onDays={setCityDays} onDropCity={dropCity}
                onCourseAll={(next) => setState((st) => ({
                  ...st,
                  courses: { ...st.courses, ...next },
                  // 일괄 적용은 손으로 맞춰 둔 일수를 놓아 준다.
                  cityDays: Object.fromEntries(
                    Object.entries(st.cityDays).filter(([slug]) => !(slug in next)),
                  ),
                }))}
                onUi={(next) => setState((s) => ({ ...s, ui: { ...s.ui, ...next } }))}
              />
            )
        )}
        {state.step === 4 && itinerary && chosenPlan && (
          <Step5Plans
            items={items} cities={index.cities} itinerary={itinerary!}
            days={days} prefs={state.prefs}
            plans={plans} overflow={built?.overflow ?? []} unseen={built?.unseen}
            needDays={built?.needDays ?? 0}
            chosen={chosenPlan.style} onChoose={choosePlan}
            onSwap={swapEntry} onMode={setMode} onTiming={setMoveTiming}
            onLodging={setLodging} onDropCity={dropCity}
            onDropItem={dropItem}
            onMoveCity={moveCity} onMoveEntry={moveEntry} manualOrder={state.dayOrder}
            airport={airportWindow}
          />
        )}
        {state.step === 5 && (
          <Step6Guide
            plan={chosenPlan} cities={index.cities} allItems={items}
            country={state.basics.country}
            attribution={index.attribution}
            tripName={`${index.name} ${state.basics.startDate}`}
            fileBase={`${state.basics.country}-${state.basics.startDate}`}
          />
        )}

        <div className="toolbar">
          <button type="button" onClick={() => exportState(state)}>계획 내보내기</button>
          <button type="button" onClick={() => fileRef.current?.click()}>가져오기</button>
          <button
            type="button"
            onClick={() => { if (confirm('처음부터 다시 시작할까요? 지금 계획은 사라집니다.')) { clearState(); setState(defaultState()); } }}
          >
            처음부터
          </button>
          <input
            ref={fileRef} type="file" accept="application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }}
          />
        </div>

        {/*
          아이패드 사파리에는 콘솔이 없다. 무엇이 잘못됐는지 알아내려면
          사용자가 화면에서 바로 꺼내 보낼 수 있어야 한다.
        */}
        <DiagPanel />

        <p className="footnote">
          장소 정보 출처: {index.attribution.join(' · ')}.
          도시 사진은 Wikimedia Commons 의 자유 라이선스 이미지이며 카드마다 저작자를 표기했습니다.
          영업시간·요금·평점은 변동되므로 방문 전 지도 링크로 확인하세요.
        </p>
      </main>

      <nav className="bottombar">
        {blockedWhy && <p className="bar-why">{blockedWhy}</p>}
        <div className="inner">
          {state.step > 1 && (
            <button type="button" className="ghost" onClick={() => goto(state.step - 1)}>이전</button>
          )}
          {state.step < LAST_STEP ? (
            <button type="button" className="primary" disabled={!canAdvance} onClick={() => goto(state.step + 1)}>
              {state.step === 3 ? '계획 세우기' : state.step === 4 ? '이 계획으로 진행' : '다음'}
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => exportState(state)}>계획 저장하기</button>
          )}
        </div>
      </nav>
    </div>
  );
}
