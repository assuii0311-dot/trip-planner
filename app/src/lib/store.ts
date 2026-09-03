import type { Basics, Preferences, Priorities, ThemeId, TripState } from '../types';
import { AIRPORTS } from './airports';
import { addDays, todayISO } from './caldate';

/**
 * 저장 자리는 나라마다 따로다.
 *
 * 나라마다 주소가 다르지만 localStorage 는 출처(origin) 단위라 주소가 달라도
 * 같은 서랍을 본다. 열쇠를 나누지 않으면 스페인 계획을 짜다 일본을 열었을 때
 * 스페인 도시 slug 가 담긴 계획을 일본 데이터로 읽으려 든다.
 *
 *   trip-planner.v1.spain
 *   trip-planner.v1.japan
 *
 * 예전 열쇠(`trip-planner.v1`)에 들어 있던 것은 스페인 계획이다. 나라를
 * 쪼개기 전에는 스페인밖에 없었기 때문이다. 처음 읽을 때 한 번 옮긴다 —
 * 쓰던 사람의 계획이 사라지면 안 된다.
 */
const OLD_KEY = 'trip-planner.v1';
const keyOf = (country: string) => `${OLD_KEY}.${country}`;

/** 이 페이지가 다루는 나라. 주소에서 정해져 들어온다. */
let here = 'spain';
export const setStoreCountry = (country: string): void => { here = country; };
const KEY = () => keyOf(here);

/** 예전 한 나라 시절의 저장분을 스페인 자리로 옮긴다. 한 번만. */
function migrateSingleCountry(): void {
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old === null) return;
    if (localStorage.getItem(keyOf('spain')) === null) {
      localStorage.setItem(keyOf('spain'), old);
    }
    localStorage.removeItem(OLD_KEY);
  } catch { /* 저장이 막혀 있어도 앱은 돌아야 한다. */ }
}

export const DEFAULT_THEMES: Record<ThemeId, number> = {
  history: 2, art: 2, landmark: 2, nature: 2, food: 2, nightlife: 1, activity: 1, shopping: 1,
};

export function defaultState(): TripState {
  const start = addDays(todayISO(), 30);
  const end = addDays(start, 6);
  const basics: Basics = {
    country: here,
    cities: [],
    startDate: start,
    endDate: end,
    partySize: 2,
    startAirport: null,
    endAirport: null,
    arrivalTime: null,
    departureTime: null,
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
  return { version: 2, step: 1, basics, prefs, priorities: {}, chosenPlan: null, savedPlans: [], baseOverrides: {}, courses: {}, modePicks: {}, lodging: {}, cityOrder: [], cityDays: {}, dayOrder: {}, moveTiming: {} };
}

/**
 * 예전 저장분을 지금 구조로 옮긴다.
 *
 * v1 은 6단계였고 아이템 고르기가 3·4단계로 나뉘어 있었다. v2 에서 둘을
 * 합쳐 5단계가 됐으므로 6단계에 있던 사람은 5단계로 당긴다. 고른 아이템과
 * 취향은 그대로 쓸 수 있으니 버리지 않는다 - 2천 개에서 골라낸 것을
 * 구조가 바뀌었다는 이유로 날리면 안 된다.
 */
/**
 * v2 초기에는 출도착을 '도시' 로 받았다. 공항으로 바꾸면서, 예전에 고른
 * 도시에 공항이 있으면 그 공항으로 옮긴다. 없으면 비운다 - 엉뚱한 공항을
 * 짐작해 넣느니 앱이 알아서 정하게 두는 편이 낫다.
 */
function airportForCity(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return AIRPORTS.find((a) => a.city === slug)?.iata ?? null;
}

function migrate(parsed: TripState): TripState {
  const base = defaultState();
  const legacy = (parsed.version as number) < 2;
  const old = parsed.basics as unknown as { startCity?: string; endCity?: string };
  // v1 의 3·4단계는 v2 의 3단계 하나다. 5·6단계는 4·5단계로 당겨진다.
  const step = legacy && parsed.step >= 4 ? parsed.step - 1 : parsed.step;
  return {
    ...base,
    ...parsed,
    version: 2,
    step: Math.min(5, Math.max(1, step || 1)),
    basics: {
      ...base.basics,
      ...parsed.basics,
      startAirport: parsed.basics?.startAirport ?? airportForCity(old.startCity),
      endAirport: parsed.basics?.endAirport ?? airportForCity(old.endCity),
      arrivalTime: parsed.basics?.arrivalTime ?? null,
      departureTime: parsed.basics?.departureTime ?? null,
    },
    prefs: { ...base.prefs, ...parsed.prefs, themes: { ...base.prefs.themes, ...parsed.prefs?.themes } },
    priorities: parsed.priorities ?? {},
    /*
     * 코스 id 가 테마 강조(balanced/focusA/focusB)에서 분량(full/normal/
     * taste)으로 바뀌었다. 옛 id 는 뜻이 대응되지 않으므로 버린다 —
     * 담아 둔 아이템은 priorities 에 그대로 남으니 잃는 것은 '어느 코스를
     * 골랐었나' 뿐이고, 그건 화면에서 다시 고르면 된다.
     */
    courses: Object.fromEntries(
      Object.entries(parsed.courses ?? {})
        .filter(([, v]) => v === 'full' || v === 'normal' || v === 'taste'),
    ) as TripState['courses'],
    modePicks: parsed.modePicks ?? {},
    lodging: parsed.lodging ?? {},
    cityOrder: parsed.cityOrder ?? [],
    cityDays: parsed.cityDays ?? {},
    dayOrder: parsed.dayOrder ?? {},
    // 예전 저장분에는 없다. 없으면 규칙대로 자동으로 고른다.
    moveTiming: parsed.moveTiming ?? {},
  };
}

/** localStorage 는 사파리 프라이빗 모드 등에서 던질 수 있으므로 항상 감싼다. */
export function loadState(): TripState {
  try {
    migrateSingleCountry();
    const raw = localStorage.getItem(KEY());
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
    localStorage.setItem(KEY(), JSON.stringify({ ...state, savedAt: at }));
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
  try { localStorage.removeItem(KEY()); } catch { /* noop */ }
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
