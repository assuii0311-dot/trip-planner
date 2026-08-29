import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Basics, Item, Plan, PlanStyle, Preferences, Priorities, ThemeId, TripState } from './types';
import { loadCountry, loadItemsFor, type CountryIndex } from './lib/data';
import { clearState, defaultState, exportState, importState, loadState, saveState } from './lib/store';
import { assignBases } from './lib/basing';
import { inferHints, inferThemes } from './lib/taste';
import Step1Basics, { tripDays } from './steps/Step1Basics';
import Step2Preferences from './steps/Step2Preferences';
import Step3Items from './steps/Step3Items';
import Step4Priority, { minimumPicks } from './steps/Step4Priority';
import Step5Plans from './steps/Step5Plans';
import Step6Guide from './steps/Step6Guide';

const STEP_TITLES = ['기초 정보', '취향 확인', '아이템', '우선순위', '계획 3안', '이동·예약'];

export default function App() {
  const [state, setState] = useState<TripState>(() => loadState());
  const [index, setIndex] = useState<CountryIndex | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const plansRef = useRef<Plan[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    loadCountry(state.basics.country).then(setIndex).catch((e: Error) => setError(e.message));
  }, [state.basics.country]);

  const days = tripDays(state.basics);
  const selectedCities = useMemo(
    () => (index ? index.cities.filter((c) => state.basics.cities.includes(c.slug)) : []),
    [index, state.basics.cities],
  );

  /** 1단계에서 고른 도시를 거점 단위로 묶는다. 사용자가 거점을 바꾼 경우를 반영한다. */
  const groups = useMemo(() => {
    if (!index) return [];
    const base = assignBases(selectedCities, index.cities, days);
    return base.map((g, i) => {
      const override = state.baseOverrides[i];
      if (!override || override === g.base.slug) return g;
      const swap = [g.base, ...g.dayTrips.map((t) => t.city)].find((c) => c.slug === override);
      if (!swap) return g;
      const rest = [g.base, ...g.dayTrips.map((t) => t.city)].filter((c) => c.slug !== override);
      return {
        ...g,
        base: swap,
        baseSuggested: false,
        dayTrips: rest.map((c) => ({ city: c, leg: g.dayTrips.find((t) => t.city.slug === c.slug)?.leg
          ?? { minutes: 60, mode: '이동', measured: false } })),
        reason: `${swap.name}에 묵는 것으로 바꾸셨습니다.`,
      };
    });
  }, [index, selectedCities, days, state.baseOverrides]);

  /** 거점으로 제안된 도시는 사용자가 고르지 않았어도 아이템이 필요하다. */
  const cityScope = useMemo(() => {
    const set = new Set(state.basics.cities);
    for (const g of groups) {
      set.add(g.base.slug);
      g.dayTrips.forEach((t) => set.add(t.city.slug));
    }
    return [...set];
  }, [state.basics.cities, groups]);

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

  /** 고른 도시에서 역산한 테마 관심도. 2단계의 기본값이 된다. */
  const inferred = useMemo<Record<ThemeId, number>>(() => inferThemes(selectedCities), [selectedCities]);

  const patchBasics = (patch: Partial<Basics>) =>
    setState((s) => ({ ...s, basics: { ...s.basics, ...patch } }));
  const patchPrefs = (patch: Partial<Preferences>) =>
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
  const setPriority = (id: string, v: 0 | 1 | 2 | 3) =>
    setState((s) => {
      const next = { ...s.priorities };
      if (v === 0) delete next[id]; else next[id] = v;
      return { ...s, priorities: next };
    });
  const setPriorities = (next: Priorities) => setState((s) => ({ ...s, priorities: next }));
  const setOverride = (i: number, slug: string) =>
    setState((s) => ({ ...s, baseOverrides: { ...s.baseOverrides, [i]: slug } }));

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

  const handlePlans = useCallback((plans: Plan[]) => { plansRef.current = plans; }, []);
  const choosePlan = (style: PlanStyle) => setState((s) => ({ ...s, chosenPlan: style }));

  const picked = Object.values(state.priorities).filter((v) => v > 0).length;
  const canAdvance = (() => {
    switch (state.step) {
      case 1: return state.basics.cities.length > 0 && days > 0;
      case 2: return true;
      case 3: return items.length > 0;
      case 4: return picked >= minimumPicks(days);
      case 5: return state.chosenPlan !== null || plansRef.current.length > 0;
      default: return false;
    }
  })();

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

  const chosenPlan = plansRef.current.find((p) => p.style === state.chosenPlan) ?? null;

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
          <span>{state.step} / 6</span>
        </div>
      </header>

      <main>
        {state.step === 1 && (
          <Step1Basics
            basics={state.basics} cities={index.cities} macroRegions={index.macroRegions}
            overrides={state.baseOverrides} onChange={patchBasics} onOverride={setOverride}
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
            : <Step3Items items={items} cities={index.cities} prefs={state.prefs} />
        )}
        {state.step === 4 && (
          <Step4Priority
            items={items} cities={index.cities} prefs={state.prefs}
            priorities={state.priorities} days={days}
            onSet={setPriority} onBulk={setPriorities}
          />
        )}
        {state.step === 5 && (
          <Step5Plans
            items={items} cities={index.cities} groups={groups}
            startDate={state.basics.startDate} days={days}
            lastDayPlan={state.basics.lastDayPlan}
            prefs={state.prefs} priorities={state.priorities}
            chosen={state.chosenPlan} onChoose={choosePlan} onPlans={handlePlans}
          />
        )}
        {state.step === 6 && <Step6Guide plan={chosenPlan} cities={index.cities} />}

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
          {state.step < 6 ? (
            <button type="button" className="primary" disabled={!canAdvance} onClick={() => goto(state.step + 1)}>
              {state.step === 4 ? '계획 세우기' : state.step === 5 ? '이 계획으로 진행' : '다음'}
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => exportState(state)}>계획 저장하기</button>
          )}
        </div>
      </nav>
    </div>
  );
}
