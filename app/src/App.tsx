import { useEffect, useMemo, useRef, useState } from 'react';
import type { Basics, CourseId, Item, PlanStyle, Preferences, Priorities, ThemeId, TripState } from './types';
import { loadCountry, loadItemsFor, loadRail, type CountryIndex } from './lib/data';
import type { RailTable } from './lib/rail';
import { clearState, defaultState, exportState, importState, isInstalled, loadState, saveState } from './lib/store';
import type { SaveResult } from './lib/store';
import { SaveStatus } from './components/SaveStatus';
import { ResumeBanner, StorageWarning } from './components/ResumeBanner';
import { airportOf, cityForAirport } from './lib/airports';
import { buildItinerary } from './lib/itinerary';
import { buildPlans } from './lib/planner';
import { inferHints, inferThemes } from './lib/taste';
import Step1Basics, { tripDays } from './steps/Step1Basics';
import Step2Preferences from './steps/Step2Preferences';
import Step3Course from './steps/Step3Course';
import { minimumPicks } from './lib/course';
import Step5Plans from './steps/Step5Plans';
import Step6Guide from './steps/Step6Guide';

const STEP_TITLES = ['기초 정보', '취향 확인', '코스 선택', '계획 3안', '이동·예약'];
const LAST_STEP = STEP_TITLES.length;

export default function App() {
  const [state, setState] = useState<TripState>(() => loadState());
  const [index, setIndex] = useState<CountryIndex | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState<SaveResult | null>(null);
  // '방금 → 3분 전' 이 저절로 바뀌도록 1분마다 현재 시각만 다시 읽는다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setSaved(saveState(state)); setNow(Date.now()); }, [state]);

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

  /** 아이템을 받아올 도시 = 사용자가 고른 도시. */
  const cityScope = state.basics.cities;

  useEffect(() => {
    if (cityScope.length === 0) { setItems([]); return; }
    let alive = true;
    setLoadingItems(true);
    loadItemsFor(cityScope)
      .then((list) => { if (alive) setItems(list); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoadingItems(false); });
    return () => { alive = false; };
  }, [cityScope.join(',')]);

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
      delete next[out.id];
      for (const i of inItems) next[i.id] = 3;
      return { ...s, priorities: next };
    });

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
        weekday: new Date(`${state.basics.startDate}T00:00:00`).getDay(),
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
      return {
        ...s,
        basics: { ...s.basics, cities: s.basics.cities.filter((c) => c !== city) },
        priorities: next, courses, lodging,
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
  const built = useMemo(() => {
    if (!itinerary || items.length === 0) return null;
    return buildPlans({
      items, itinerary,
      startDate: state.basics.startDate,
      days,
      lastDayPlan: state.basics.lastDayPlan,
      prefs: state.prefs,
      priorities: state.priorities,
      dayOrder: state.dayOrder,
    });
  }, [itinerary, items, state.basics.startDate, days, state.basics.lastDayPlan,
    state.prefs, state.priorities, state.dayOrder]);

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
  const canAdvance = (() => {
    switch (state.step) {
      case 1: return state.basics.cities.length > 0 && days > 0;
      case 2: return true;
      case 3: return picked >= minimumPicks(days);
      case 4: return plans.length > 0;
      default: return false;
    }
  })();

  /**
   * 코스를 고르면 그 도시의 기존 선택을 갈아 끼운다.
   *
   * 더하기가 아니라 갈아 끼우기다. 코스를 바꿔 가며 비교하는데 앞서 고른
   * 것이 계속 남으면, 세 코스를 다 눌러 본 사람은 세 코스를 합친 목록을
   * 갖게 된다. 다른 도시의 선택은 건드리지 않는다.
   */
  const chooseCourse = (city: string, course: CourseId, courseItems: Item[]) =>
    setState((s) => {
      const next: Priorities = {};
      for (const [id, v] of Object.entries(s.priorities)) {
        if (itemCityOf.get(id) !== city) next[id] = v;
      }
      for (const it of courseItems) next[it.id] = 2;
      return { ...s, priorities: next, courses: { ...s.courses, [city]: course } };
    });

  const onImport = async (file: File) => {
    try { setState(await importState(file)); }
    catch (e) { setError((e as Error).message); }
  };

  if (error && !index) {
    return <div className="app"><main><div className="empty">{error}</div></main></div>;
  }
  if (!index) {
    return <div className="app"><main><div className="spinner">여행지 데이터를 불러오는 중…</div></main></div>;
  }


  return (
    <div className="app">
      <header className="topbar">
        <h1>{index.name} 여행 계획</h1>
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
        {showStorageWarning && (
          <StorageWarning
            onExport={() => { exportState(state); setWarnDismissed(true); }}
            onDismiss={() => setWarnDismissed(true)}
          />
        )}

        {state.step === 1 && (
          <Step1Basics
            basics={state.basics} cities={index.cities} macroRegions={index.macroRegions}
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
                courses={state.courses} days={days}
                ui={state.ui ?? {}}
                onSet={setPriority} onBulk={setPriorities} onCourse={chooseCourse}
                onUi={(next) => setState((s) => ({ ...s, ui: { ...s.ui, ...next } }))}
              />
            )
        )}
        {state.step === 4 && itinerary && chosenPlan && (
          <Step5Plans
            items={items} cities={index.cities} itinerary={itinerary!}
            days={days} prefs={state.prefs}
            plans={plans} overflow={built?.overflow ?? []} spare={built?.spare ?? 0}
            chosen={chosenPlan.style} onChoose={choosePlan}
            onSwap={swapEntry} onMode={setMode} onLodging={setLodging} onDropCity={dropCity}
            onMoveCity={moveCity} onMoveEntry={moveEntry} manualOrder={state.dayOrder}
          />
        )}
        {state.step === 5 && (
          <Step6Guide
            plan={chosenPlan} cities={index.cities} allItems={items}
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

        <p className="footnote">
          장소 정보 출처: {index.attribution.join(' · ')}.
          도시 사진은 Wikimedia Commons 의 자유 라이선스 이미지이며 카드마다 저작자를 표기했습니다.
          영업시간·요금·평점은 변동되므로 방문 전 지도 링크로 확인하세요.
        </p>
      </main>

      <nav className="bottombar">
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
