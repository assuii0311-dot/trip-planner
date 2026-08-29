import type { Basics, Preferences, Priorities, ThemeId, TripState } from '../types';

const KEY = 'trip-planner.v1';

export const DEFAULT_THEMES: Record<ThemeId, number> = {
  history: 2, art: 2, landmark: 2, nature: 2, food: 2, nightlife: 1, activity: 1, shopping: 1,
};

export function defaultState(): TripState {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const basics: Basics = {
    country: 'spain',
    cities: [],
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    lastDayPlan: 'morning',
    partySize: 2,
  };
  const prefs: Preferences = {
    themes: { ...DEFAULT_THEMES },
    pace: 3,
    budget: 'mid',
    dayStart: 'normal',
    nightlife: 1,
    discovery: 2,
    walkTolerance: 3,
    companion: 'couple',
    foodStyles: [],
    mobility: 'normal',
    photo: 2,
    transport: ['walk', 'metro'],
    dayTripAppetite: 2,
  };
  return { version: 1, step: 1, basics, prefs, priorities: {}, chosenPlan: null, savedPlans: [], baseOverrides: {} };
}

/** localStorage 는 사파리 프라이빗 모드 등에서 던질 수 있으므로 항상 감싼다. */
export function loadState(): TripState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as TripState;
    // 1단계 구조가 바뀌어 예전 저장분은 복원하지 않는다.
    if (parsed?.version !== 1 || !Array.isArray((parsed.basics as Basics | undefined)?.cities)) {
      return defaultState();
    }
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      basics: { ...base.basics, ...parsed.basics },
      prefs: { ...base.prefs, ...parsed.prefs, themes: { ...base.prefs.themes, ...parsed.prefs?.themes } },
      priorities: parsed.priorities ?? {},
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: TripState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 실패는 앱 동작을 막지 않는다. */
  }
}

export function clearState(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/** 계획을 파일로 내보낸다. 아이패드 ↔ 폰 이동과 동행자 공유에 쓴다. */
export function exportState(state: TripState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trip-${state.basics.country}-${state.basics.startDate}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importState(file: File): Promise<TripState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as TripState;
  if (parsed?.version !== 1 || !parsed.basics) throw new Error('여행 계획 파일 형식이 아닙니다.');
  const base = defaultState();
  return {
    ...base,
    ...parsed,
    basics: { ...base.basics, ...parsed.basics },
    prefs: { ...base.prefs, ...parsed.prefs, themes: { ...base.prefs.themes, ...parsed.prefs?.themes } },
  };
}

export type { Priorities };
