/** 활동 테마 — 여행 아이템을 묶는 상위 분류 (3단계). */
export type ThemeId =
  | 'history' | 'art' | 'landmark' | 'nature'
  | 'food' | 'nightlife' | 'activity' | 'shopping';

export type Slot = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'dinner' | 'night';

/**
 * 아이템의 실무 정보.
 * duration/price/closed 는 수집한 구조화 필드에서 계산하고,
 * booking/busy 는 출처가 실제로 말해준 경우에만 채운다.
 */
export interface Practical {
  /** 예약·시간 지정 입장이 필요한 경우. */
  booking: string | null;
  /** 휴관일. 영업시간 문자열에서 역산한다. */
  closed: string | null;
  /** 붐비는 시간. */
  busy: string | null;
  /** 예상 소요. 항상 있다. */
  duration: string;
  /** 요금. 정보가 없으면 null. */
  price: string | null;
  /** 원문 영업시간. */
  hours: string | null;
}

/** 여행 아이템 — 하나의 완결된 활동. */
export interface Item {
  id: string;
  name: string;
  nameEn: string;
  nameLocal: string | null;
  city: string;
  district: string | null;
  theme: ThemeId;
  /** 목록에서 한 줄로 보이는 요약. 40자 안팎. */
  summary: string;
  /** 왜 가는가 — 이 장소의 핵심 가치. 1~2문장. */
  why: string;
  /** 실무 정보. 지어내지 않는다. 모르는 항목은 null 로 비워 둔다. */
  practical: Practical;
  /** 주의점. 있을 때만. */
  caution: string | null;
  lat: number | null;
  lon: number | null;
  /** 예상 소요 시간(분). 이동 시간은 포함하지 않는다. */
  durationMin: number;
  /** 1인 예상 비용(유로). 0은 무료, null은 정보 없음. */
  priceEur: number | null;
  hours: string | null;
  /** 이 활동이 가장 잘 맞는 시간대. */
  bestSlots: Slot[];
  indoor: boolean;
  /** 1 = 잘 안 알려진 곳, 5 = 누구나 아는 대표 명소. */
  popularity: number;
  /** 1 = 앉아서 즐김, 5 = 체력 소모가 큼. */
  energy: number;
  tags: string[];
  url: string | null;
  wikidata: string | null;
  source: 'wikivoyage' | 'osm' | 'manual';
  attribution: string;
}

/** 근교 당일치기 연결. */
export interface DayTrip {
  city: string;
  transitMin: number;
  mode: string;
  note: string;
}

export interface Season { best: string; note: string }

export interface City {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  /** 목록을 훑을 수 있게 15개 지역을 6개 권역으로 묶은 값. */
  macroRegion: string;
  lat: number;
  lon: number;
  /** '보통 이렇게 묵는다'는 참고값. 실제 거점은 선택 조합을 보고 다시 정한다. */
  isHub: boolean;
  hub: string | null;
  dayTrips: DayTrip[];
  itemCount: number;
  themes: Partial<Record<ThemeId, number>>;
  transitGuide: TransitGuide;

  /** ── 도시 성격. 1단계 카드와 취향 역산에 쓴다. ── */
  tagline: string;
  suitedFor: string | null;
  highlights: string[];
  season: Season | null;
  /** 사람이 판단해 적은 테마별 성격 점수 0~3. 수집된 아이템 수가 아니다. */
  profile: Record<ThemeId, number> | null;
  /** [최소, 권장] 박수. 0 이면 당일치기로 충분하다는 뜻. */
  nights: [number, number];
  firstTimer: boolean;
  tags: string[];
  photo: string | null;
  photoCredit: { author: string | null; license: string | null; source: string } | null;
  wikidata: string | null;
}

export interface MacroRegion { id: string; name: string; regions: string[] }

export interface TransitGuide {
  passes: { name: string; price: string; note: string }[];
  apps: { name: string; note: string }[];
  tips: string[];
}

/** 도착일에 일정을 얼마나 넣을지. 오후 비행기가 가장 흔해 기본은 오전만. */
export type LastDayPlan = 'none' | 'morning' | 'full';

/** 1단계 — 기초 정보. */
export interface Basics {
  country: string;
  /** 사용자가 고른 도시. 거점인지 근교인지는 앱이 판정한다. */
  cities: string[];
  startDate: string;
  endDate: string;
  lastDayPlan: LastDayPlan;
  partySize: number;
}

export type Budget = 'low' | 'mid' | 'high';
export type Companion = 'solo' | 'couple' | 'family' | 'friends' | 'parents';

/** 2단계 — 취향 정보. */
export interface Preferences {
  themes: Record<ThemeId, number>;
  pace: number;
  budget: Budget;
  dayStart: 'early' | 'normal' | 'late';
  nightlife: number;
  discovery: number;
  walkTolerance: number;
  companion: Companion;
  foodStyles: string[];
  mobility: 'normal' | 'limited';
  photo: number;
  transport: string[];
  dayTripAppetite: number;
}

/** 4단계 — 우선순위. 0 은 제외(체크 해제), 1~3 은 별점. */
export type Priorities = Record<string, 0 | 1 | 2 | 3>;

export interface PlanEntry {
  slot: Slot;
  startMin: number;
  item: Item;
  travelMin: number;
  /** 반나절 근교에서 거점으로 돌아오는 이동이 이 앞에 끼는지. */
  returnLeg?: { from: string; to: string; minutes: number };
}

export interface PlanDay {
  date: string;
  dayIndex: number;
  city: string;
  isDayTrip: boolean;
  /** 반나절 근교인 경우 오후에 돌아올 거점. 몬세라트는 오전만으로 충분하다. */
  returnTo: string | null;
  entries: PlanEntry[];
  walkKm: number;
}

export type PlanStyle = 'packed' | 'balanced' | 'relaxed';

export interface Plan {
  style: PlanStyle;
  title: string;
  summary: string;
  days: PlanDay[];
  stats: { items: number; walkKm: number; costEur: number; themeMix: Partial<Record<ThemeId, number>> };
}

export interface TripState {
  version: 1;
  step: number;
  basics: Basics;
  prefs: Preferences;
  priorities: Priorities;
  chosenPlan: PlanStyle | null;
  savedPlans: Plan[];
  /** 앱이 제안한 거점을 사용자가 바꿨을 때. 그룹 인덱스 → 도시 slug. */
  baseOverrides: Record<number, string>;
  /** 2단계에서 역산 결과를 한 번이라도 확인했는지. */
  tasteConfirmed?: boolean;
}
