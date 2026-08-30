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
    startCity: null,
    endCity: null,
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
  return { version: 2, step: 1, basics, prefs, priorities: {}, chosenPlan: null, savedPlans: [], baseOverrides: {}, courses: {} };
}

/**
 * 예전 저장분을 지금 구조로 옮긴다.
 *
 * v1 은 6단계였고 아이템 고르기가 3·4단계로 나뉘어 있었다. v2 에서 둘을
 * 합쳐 5단계가 됐으므로 6단계에 있던 사람은 5단계로 당긴다. 고른 아이템과
 * 취향은 그대로 쓸 수 있으니 버리지 않는다 - 2천 개에서 골라낸 것을
 * 구조가 바뀌었다는 이유로 날리면 안 된다.
 */
function migrate(parsed: TripState): TripState {
  const base = defaultState();
  const legacy = (parsed.version as number) < 2;
  // v1 의 3·4단계는 v2 의 3단계 하나다. 5·6단계는 4·5단계로 당겨진다.
  const step = legacy && parsed.step >= 4 ? parsed.step - 1 : parsed.step;
  return {
    ...base,
    ...parsed,
    version: 2,
    step: Math.min(5, Math.max(1, step || 1)),
    basics: { ...base.basics, ...parsed.basics },
    prefs: { ...base.prefs, ...parsed.prefs, themes: { ...base.prefs.themes, ...parsed.prefs?.themes } },
    priorities: parsed.priorities ?? {},
    courses: parsed.courses ?? {},
  };
}

/** localStorage 는 사파리 프라이빗 모드 등에서 던질 수 있으므로 항상 감싼다. */
export function loadState(): TripState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as TripState;
    if (!Array.isArray((parsed?.basics as Basics | undefined)?.cities)) return defaultState();
    return migrate(parsed);
  } catch {
    return defaultState();
  }
}

/**
 * 저장 결과.
 *
 * 저장은 실패할 수 있다 — 사파리 프라이빗 모드, 저장 공간 부족, 브라우저 설정.
 * 예전에는 조용히 삼켰는데, 그러면 사용자는 다 저장된 줄 알고 앱을 닫는다.
 * 아이템을 2천 개 중에서 고르는 일을 여러 번에 나눠 하는 이상, 저장이 안 되고
 * 있다는 사실은 반드시 화면에 나와야 한다.
 */
export type SaveResult =
  | { ok: true; at: number }
  | { ok: false; reason: string };

export function saveState(state: TripState): SaveResult {
  const at = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: at }));
    return { ok: true, at };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return {
      ok: false,
      reason: name === 'QuotaExceededError'
        ? '저장 공간이 가득 찼습니다'
        : '이 브라우저에서는 저장할 수 없습니다',
    };
  }
}

/**
 * 이 페이지가 홈 화면에 추가된 앱으로 실행 중인가.
 *
 * iOS 사파리는 홈 화면에 추가하지 않은 사이트의 저장분을 마지막 방문으로부터
 * 7일이 지나면 지운다(ITP). 며칠에 걸쳐 나눠 고를 계획이라면 이것이 실제 위험이다.
 * 홈 화면 앱은 예외라, 설치 여부로 경고할지 정한다.
 */
export function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
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
  if (!parsed?.basics || !Array.isArray(parsed.basics.cities)) {
    throw new Error('여행 계획 파일 형식이 아닙니다.');
  }
  return migrate(parsed);
}

export type { Priorities };
