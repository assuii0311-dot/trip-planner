/** 활동 테마 — 여행 아이템을 묶는 상위 분류 (3단계). */
export type ThemeId =
  | 'history' | 'art' | 'landmark' | 'nature'
  | 'food' | 'nightlife' | 'activity' | 'shopping';

export type Slot = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'dinner' | 'night';

/** 여행 아이템 — 하나의 완결된 활동. */
export interface Item {
  id: string;
  name: string;
  nameEn: string;
  nameLocal: string | null;
  city: string;
  district: string | null;
  theme: ThemeId;
  desc: string;
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

export interface City {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  lat: number;
  lon: number;
  /** 거점 도시면 true. 근교 도시는 hub 에 거점 slug 가 들어간다. */
  isHub: boolean;
  hub: string | null;
  dayTrips: DayTrip[];
  itemCount: number;
  themes: Partial<Record<ThemeId, number>>;
  blurb: string;
  transitGuide: TransitGuide;
}

export interface TransitGuide {
  passes: { name: string; price: string; note: string }[];
  apps: { name: string; note: string }[];
  tips: string[];
}

/** 1단계 — 기초 정보. */
export interface Basics {
  country: string;
  baseCities: string[];
  startDate: string;
  days: number;
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
}

export interface PlanDay {
  date: string;
  dayIndex: number;
  city: string;
  isDayTrip: boolean;
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
}
