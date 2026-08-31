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

/**
 * 아이템 대표 사진 — 위키미디어 커먼즈.
 *
 * bundled 인 것은 앱에 함께 들어 있어 오프라인에서도 뜨고,
 * 아닌 것은 커먼즈에서 원격으로 받아온다(망이 없으면 안 뜬다).
 * author/license 는 표기 의무 때문에 반드시 함께 다닌다.
 */
export interface Photo {
  /** 커먼즈 파일명. 원격 URL과 출처 링크를 여기서 만든다. */
  file: string;
  /** 앱에 함께 넣은 사진인가. */
  bundled: boolean;
  author: string | null;
  license: string;
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
  /** 대표 사진. 없으면 null — 절반 남짓만 있다. */
  photo: Photo | null;
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
  /**
   * 입국 공항과 출국 공항의 IATA 코드.
   *
   * 도시가 아니라 공항 기준이다 — 비행기표를 먼저 끊고 일정을 짜기 때문에,
   * 이미 표를 들고 있는 사람에게 물어야 할 것은 도시가 아니라 공항이다.
   * 마드리드로 들어와 바르셀로나에서 나가는 일정과 둘 다 마드리드인 일정은
   * 도시 순서도 마지막 날 쓰는 법도 다르다.
   * null 이면 앱이 동선을 보고 알아서 정한다.
   */
  startAirport: string | null;
  endAirport: string | null;
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

/** 한 수단으로 도시를 옮기는 구간. 대안을 함께 담아 그 자리에서 바꿀 수 있다. */
export interface TravelOption {
  mode: string;
  label: string;
  icon: string;
  /** 문앞에서 문앞까지(분). 대기 제외. */
  totalMin: number;
  rideMin: number;
  costEur: number;
  transfers: number;
  estimated: boolean;
  note?: string;
}

export interface PlanTravel {
  from: string;
  to: string;
  chosen: TravelOption;
  /** 숙소에서 나서는 시각 / 탈것이 떠나는 시각 / 목적지 도심에 닿는 시각(분). */
  leaveAt: number;
  departAt: number;
  arriveAt: number;
  waitMin: number;
  /** 시간 효율 순 대안. chosen 을 포함한다. */
  options: TravelOption[];
  /** 그날 막차가 끊겨 갈 수 없는 수단들. */
  unavailable: string[];
}

export interface PlanDay {
  date: string;
  dayIndex: number;
  city: string;
  isDayTrip: boolean;
  /**
   * 근교를 다녀오는 날 무엇을 타고 가는가.
   * 지도와 하루 머리줄에 그대로 쓴다 — 예전에는 근교 왕복이 어디에도
   * 그려지지 않아, 실제로 타는 구간이 계획에서 통째로 빠져 있었다.
   */
  dayTripMode?: { icon: string; label: string; minutes: number };
  /** 반나절 근교인 경우 오후에 돌아올 거점. 몬세라트는 오전만으로 충분하다. */
  returnTo: string | null;
  /** 이 날 아침에 도시를 옮긴다면 그 구간. 일정은 도착 시각부터 시작한다. */
  travel: PlanTravel | null;
  /** 이 날 밤 어디서 자는가. */
  sleepAt: string | null;
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

/** 3단계에서 도시마다 고른 추천 코스. 값이 없으면 아직 안 고른 것. */
export type CourseId = 'balanced' | 'focusA' | 'focusB';

export interface TripState {
  version: 2;
  step: number;
  basics: Basics;
  prefs: Preferences;
  priorities: Priorities;
  chosenPlan: PlanStyle | null;
  savedPlans: Plan[];
  /** 앱이 제안한 거점을 사용자가 바꿨을 때. 그룹 인덱스 → 도시 slug. */
  baseOverrides: Record<number, string>;
  /** 도시 slug → 고른 코스. 코스를 고른 뒤 개별 아이템을 더하고 뺄 수 있다. */
  courses: Record<string, CourseId>;
  /** 도시 간 이동 수단을 직접 고른 경우. '출발>도착' → mode. */
  modePicks: Record<string, string>;
  /** 숙박을 직접 정한 경우. 도시 slug → 자기/당일치기. */
  lodging: Record<string, 'sleep' | 'daytrip'>;
  /**
   * 도시 순서를 직접 정한 경우.
   * 비어 있으면 동선 엔진이 이동 시간 기준으로 정한다.
   */
  cityOrder: string[];
  /**
   * 도시 slug → 이 도시에 쓸 일수. 사용자가 3단계에서 정한 값만 들어간다.
   * 비어 있으면 도시 데이터의 권장 일수를 쓴다.
   */
  cityDays: Record<string, number>;
  /**
   * 하루 안의 일정 순서를 직접 정한 경우. 날짜 → 아이템 id 순서.
   * 특수한 사정(예약 시각, 누구와 만나기로 한 시각)은 앱이 알 수 없다.
   */
  dayOrder: Record<string, string[]>;
  /** 2단계에서 역산 결과를 한 번이라도 확인했는지. */
  tasteConfirmed?: boolean;
  /** 마지막으로 저장된 시각(epoch ms). 저장할 때 store 가 찍는다. */
  savedAt?: number;
  /**
   * 화면 상태. 계획 내용은 아니지만, 이어서 할 때 보던 자리로 돌아가려면 필요하다.
   * 아이템이 2천 개라 4단계는 여러 번에 나눠 고르게 되고, 그때마다 첫 테마로
   * 튕겨 나가면 어디까지 봤는지 알 수 없다.
   */
  ui?: {
    /** 3단계에서 펼쳐 두었던 테마. */
    openTheme?: ThemeId | null;
    /** '고른 것만 보기' 를 켜 두었는지. */
    onlyPicked?: boolean;
    /** 3단계에서 보고 있던 도시. 도시가 여러 곳이면 한 번에 다 못 고른다. */
    openCity?: string | null;
  };
}
