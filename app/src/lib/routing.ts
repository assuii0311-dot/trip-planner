import type { City } from '../types';
import { distanceKm } from './geo';
import type { RailDeparture } from './rail';
import { railBetween, railOnDay } from './rail';

/**
 * 도시 간 이동 엔진.
 *
 * ## 무엇을 계산하는가
 *
 * 두 도시 사이를 실제로 어떻게 가는지를 수단별로 만들어 내고, '문 앞에서
 * 문 앞까지' 걸리는 시간으로 줄을 세운다. 탑승 시간만 보면 비행기가 늘
 * 이기지만, 공항까지 가고 두 시간 일찍 도착해 짐을 찾고 시내로 들어오는
 * 시간을 더하면 500km 안쪽에서는 고속철이 거의 항상 빠르다.
 *
 * ## 무엇을 지어내지 않는가
 *
 * 스페인 철도(Renfe)와 버스(ALSA)는 공개된 시간표 API 가 없다. 화면을
 * 긁는 것은 약관 위반이고, 긁어 온 시간표는 며칠이면 틀린 값이 된다.
 * 그래서 이 엔진은 **시간표가 아니라 운행 패턴**을 쓴다 —
 * 첫차·막차·배차 간격은 노선 성격에서 나온 값이고, 개별 열차의 실제
 * 출발 시각이 아니다. 화면에는 항상 '추정' 으로 표시하고, 예약 링크로
 * 실제 시간표를 확인하게 한다.
 *
 * 조사해 둔 51개 구간(거점↔근교)은 실측값이라 그대로 쓴다.
 *
 * ## 동선 원칙
 *
 * 이동 시간 효율이 가장 우선이다. 값이 싸거나 경치가 좋아도, 하루를
 * 이동으로 버리면 여행이 아니라 이동이 된다.
 */

export type Mode = 'ave' | 'train' | 'bus' | 'flight' | 'car' | 'ferry';

export const MODE_LABEL: Record<Mode, string> = {
  ave: '고속열차',
  train: '일반열차',
  bus: '버스',
  flight: '국내선 항공',
  car: '렌터카',
  ferry: '페리',
};

export const MODE_ICON: Record<Mode, string> = {
  ave: '🚄', train: '🚆', bus: '🚌', flight: '✈️', car: '🚗', ferry: '⛴️',
};

/**
 * 한 구간을 한 수단으로 가는 방법.
 *
 * total = access + ride + egress. 대기 시간은 출발 시각을 정할 때
 * 따로 붙는다 — 몇 시에 나서느냐에 따라 달라지기 때문이다.
 */
export interface Service {
  mode: Mode;
  label: string;
  /** 역·공항까지 가고 수속하는 시간(분). */
  accessMin: number;
  /** 실제 타고 있는 시간(분). */
  rideMin: number;
  /** 내려서 시내로 들어오는 시간(분). */
  egressMin: number;
  /** access + ride + egress. 대기 제외. */
  totalMin: number;
  transfers: number;
  /** 1인 편도 예상 요금(유로). */
  costEur: number;
  /** 첫차·막차 출발 시각(분, 0시 기준). */
  firstDep: number;
  lastDep: number;
  /** 배차 간격(분). 0 이면 아무 때나 출발할 수 있다(렌터카). */
  headwayMin: number;
  /** 시간표를 확인한 값이 아니라 운행 패턴에서 추정한 값인가. */
  estimated: boolean;
  note?: string;
  /**
   * 실제 시간표(Renfe GTFS). 있으면 첫차·배차 대신 이 목록에서 고른다.
   * 없는 구간만 운행 패턴으로 어림한다.
   */
  timetable?: RailDeparture[];
}

/** 실제로 몇 시에 타고 몇 시에 닿는지. */
export interface Departure {
  service: Service;
  /** 숙소에서 나서는 시각(분). */
  leaveAt: number;
  /** 탈것이 출발하는 시각(분). */
  departAt: number;
  /** 목적지 도심에 닿는 시각(분). */
  arriveAt: number;
  /** 역·공항에서 기다리는 시간(분). */
  waitMin: number;
  /** 나서서 닿을 때까지 전체(분). */
  doorToDoorMin: number;
}

const hm = (h: number, m = 0) => h * 60 + m;

/**
 * 고속철 축.
 *
 * 같은 축 위에 있으면 갈아타지 않고 간다. 스페인 고속철은 마드리드를
 * 중심으로 한 방사형이라, 축이 다르면 대개 마드리드에서 갈아탄다.
 * 빌바오·산세바스티안은 아직 고속철이 들어오지 않았다(바스크 Y 공사 중).
 */
/**
 * minPerKm 은 직선거리 1km 당 탑승 분이다. 선로는 직선이 아니고 축마다
 * 속도가 다르므로 축별로 따로 잡았다. 알려진 소요 시간에 맞춰 둔 값이다.
 *
 *   마드리드~바르셀로나 505km 2시간 50분 → 0.34
 *   지중해 축(바르셀로나~발렌시아) 303km 2시간 55분 → 0.58
 *     — 같은 '고속철' 이라도 이 축은 아직 전 구간이 고속화되지 않았다.
 *       하나의 계수로 묶으면 바르셀로나~발렌시아가 1시간 55분으로 나와,
 *       실제로는 불가능한 당일치기를 시스템이 추천하게 된다.
 *   마드리드~그라나다 360km 3시간 20분 → 0.55 (안테케라 이후 저속)
 */
const AVE_CORRIDORS: { cities: string[]; minPerKm: number }[] = [
  { cities: ['madrid', 'zaragoza', 'tarragona', 'barcelona'], minPerKm: 0.34 },
  { cities: ['madrid', 'toledo'], minPerKm: 0.47 },
  { cities: ['madrid', 'segovia'], minPerKm: 0.40 },
  { cities: ['madrid', 'cordoba', 'seville'], minPerKm: 0.36 },
  { cities: ['madrid', 'cordoba', 'malaga'], minPerKm: 0.38 },
  { cities: ['madrid', 'cordoba', 'granada'], minPerKm: 0.55 },
  { cities: ['madrid', 'cuenca', 'valencia'], minPerKm: 0.36 },
  { cities: ['madrid', 'alicante'], minPerKm: 0.38 },
  { cities: ['madrid', 'ourense', 'santiago'], minPerKm: 0.40 },
  { cities: ['barcelona', 'zaragoza', 'cordoba', 'seville'], minPerKm: 0.36 },
  { cities: ['barcelona', 'zaragoza', 'cordoba', 'malaga'], minPerKm: 0.37 },
  { cities: ['barcelona', 'tarragona', 'valencia', 'alicante'], minPerKm: 0.58 },
];

/** 고속철역이 있는 도시 전체. */
const AVE_STATIONS = new Set(AVE_CORRIDORS.flatMap((c) => c.cities));

/** 두 도시가 같은 축 위에 있으면 그 축의 계수를, 아니면 null. */
function corridorSpeed(a: string, b: string): number | null {
  const hit = AVE_CORRIDORS
    .filter((c) => c.cities.includes(a) && c.cities.includes(b))
    .sort((x, y) => x.minPerKm - y.minPerKm)[0];
  return hit ? hit.minPerKm : null;
}

/**
 * 국내선이 있는 공항 도시.
 * 이 목록에 없으면 비행기를 타려고 다른 도시로 이동해야 해서, 국내선을
 * 후보로 내지 않는다.
 */
const FLIGHT_CITIES = new Set([
  'madrid', 'barcelona', 'seville', 'malaga', 'valencia', 'alicante', 'bilbao',
  'granada', 'santiago', 'a-coruna', 'vigo', 'oviedo', 'santander', 'zaragoza',
  'palma', 'las-palmas', 'santa-cruz-tenerife', 'jerez', 'pamplona', 'san-sebastian',
]);

/** 편수가 많은 굵은 노선의 양 끝. 배차 간격이 다르다. */
const TRUNK_AIR = new Set([
  'madrid', 'barcelona', 'malaga', 'palma', 'valencia', 'seville',
  'bilbao', 'las-palmas', 'santa-cruz-tenerife', 'alicante',
]);

const isIsland = (c: City) => c.macroRegion === 'island';

/**
 * 바다를 건너는가 — 건너면 배나 비행기뿐이다.
 *
 * 예전에는 자치주(`region`)로 판단했다. 그런데 테네리페와 그란카나리아는
 * 둘 다 '카나리아' 라, 대서양 60km 를 사이에 두고 **렌터카 2시간 3분**
 * 이라고 안내했다. 섬은 자치주가 아니라 섬이 단위다.
 */
function crossesSea(a: City, b: City): boolean {
  if (isIsland(a) !== isIsland(b)) return true;
  if (!isIsland(a)) return false;
  // 섬 id 가 있으면 그것으로, 없으면(예전 데이터) 자치주로 어림한다.
  if (a.island && b.island) return a.island !== b.island;
  return a.region !== b.region;
}

/**
 * 이 구간에 철도가 있는가.
 *
 * 섬에는 대개 철도가 없다. 그란카나리아는 아예 없고, 마요르카는 팔마~소예르
 * 옛 열차와 팔마~인카 근교선뿐이다. 그런데 교통 엔진은 거리만 보고 '일반열차'
 * 를 지어내, 라스팔마스~마스팔로마스를 열차 1시간 34분이라고 안내했다.
 *
 * 어느 섬에 철도가 있는지는 데이터가 알려 준다(`islands[].rail`). 그 값을
 * 앱까지 들고 오지 않았을 때를 대비해, 섬이면 기본적으로 없다고 본다.
 */
function hasRail(a: City, b: City, islandRail: Map<string, boolean>): boolean {
  if (!isIsland(a) && !isIsland(b)) return true;
  if (!a.island || a.island !== b.island) return false;
  return islandRail.get(a.island) ?? false;
}

/**
 * 섬별 철도 유무. 데이터를 읽을 때 채운다.
 * 비어 있으면 섬에는 철도가 없다고 본다 — 없는 열차를 만들어 내는 것보다
 * 있는 열차를 놓치는 편이 낫다(버스나 렌터카로 안내된다).
 */
const ISLAND_RAIL = new Map<string, boolean>();
export function setIslandRail(islands: { id: string; rail?: boolean }[]): void {
  ISLAND_RAIL.clear();
  for (const i of islands) ISLAND_RAIL.set(i.id, !!i.rail);
}

/**
 * 도로 거리는 직선 거리보다 길다. 스페인 고속도로망 기준으로 1.25배.
 * 산악 구간(안달루시아 내륙, 피레네)은 더 걸리지만 평균으로 잡는다.
 */
const ROAD_FACTOR = 1.25;

function carService(km: number): Service {
  const road = km * ROAD_FACTOR;
  // 고속도로 실효 105km/h, 시내 진출입 20분, 250km 마다 15분 휴식.
  const ride = Math.round((road / 105) * 60 + 20 + Math.floor(road / 250) * 15);
  return {
    mode: 'car',
    label: '렌터카',
    accessMin: 25, // 영업소 수령·반납 대기
    rideMin: ride,
    egressMin: 15, // 주차 찾기
    totalMin: ride + 40,
    transfers: 0,
    costEur: Math.round(road * 0.11 + 35), // 연료·통행료·일일 렌트비 분담
    firstDep: hm(0), lastDep: hm(23, 59),
    headwayMin: 0, // 아무 때나 출발
    estimated: true,
    note: '아무 때나 출발할 수 있지만 도심 주차가 비싸고 어렵습니다.',
  };
}

/**
 * 섬 사이 고속선.
 *
 * 가까운 섬끼리만 만든다. 본토에서 발레아레스(200km 이상)는 야간 배가 있지만
 * 여행 일정에 쓰이지 않아 넣지 않는다.
 */
function ferryService(km: number): Service | null {
  if (km > 150) return null;
  // 카나리아 제도 고속선 실효 55km/h, 항구 수속 40분, 내려서 시내 20분.
  const ride = Math.round((km / 55) * 60);
  return {
    mode: 'ferry',
    label: '고속 페리',
    accessMin: 40,
    rideMin: ride,
    egressMin: 20,
    totalMin: ride + 60,
    transfers: 0,
    costEur: Math.round(km * 0.55 + 20),
    firstDep: hm(6, 30),
    lastDep: hm(20, 30),
    headwayMin: 150,
    estimated: true,
    note: '날씨가 나쁘면 결항합니다. 차를 실을 수 있어 렌터카를 그대로 가져갈 수 있습니다.',
  };
}

function aveService(a: City, b: City, km: number): Service | null {
  if (!AVE_STATIONS.has(a.slug) || !AVE_STATIONS.has(b.slug)) return null;
  const speed = corridorSpeed(a.slug, b.slug);
  const direct = speed !== null;
  const transfers = direct ? 0 : 1;
  // 축이 다르면 대개 마드리드에서 갈아탄다. 그때는 느린 쪽 계수로 본다.
  const ride = Math.round(km * (speed ?? 0.45) + 12 + transfers * 40);
  return {
    mode: 'ave',
    label: direct ? '고속열차 직통' : '고속열차 (1회 환승)',
    accessMin: 30, // 역 도착·검색대. 공항보다 훨씬 짧다.
    rideMin: ride,
    egressMin: 15,
    totalMin: ride + 45,
    transfers,
    costEur: Math.round(km * 0.11 + 15),
    firstDep: hm(6, 20), lastDep: hm(21, 0),
    headwayMin: direct ? 75 : 120,
    estimated: true,
    note: 'Renfe 는 90일 전 예매가 가장 쌉니다. 당일 요금은 두세 배가 됩니다.',
  };
}

function trainService(a: City, b: City, km: number): Service {
  // 일반열차(Media Distancia). 정차가 많아 km 당 시간이 길다.
  const hub = AVE_STATIONS.has(a.slug) || AVE_STATIONS.has(b.slug);
  const transfers = km > 250 && !hub ? 2 : km > 150 ? 1 : 0;
  // 마드리드~빌바오 323km 가 Alvia 로 5시간이다. 고속선이 아닌 구간은 이만큼 느리다.
  const ride = Math.round(km * 0.78 + 20 + transfers * 35);
  return {
    mode: 'train',
    label: transfers === 0 ? '일반열차' : `일반열차 (${transfers}회 환승)`,
    accessMin: 25,
    rideMin: ride,
    egressMin: 15,
    totalMin: ride + 40,
    transfers,
    costEur: Math.round(km * 0.07 + 6),
    firstDep: hm(6, 0), lastDep: hm(21, 30),
    headwayMin: km <= 60 ? 45 : 120,
    estimated: true,
  };
}

function busService(km: number): Service {
  // ALSA 시외버스. 도로를 그대로 달리고 중간 정차가 있다.
  const ride = Math.round((km * ROAD_FACTOR / 78) * 60 + 15);
  return {
    mode: 'bus',
    label: '시외버스',
    accessMin: 25,
    rideMin: ride,
    egressMin: 10,
    totalMin: ride + 35,
    transfers: 0,
    costEur: Math.round(km * 0.055 + 4),
    firstDep: hm(7, 0), lastDep: hm(22, 0),
    headwayMin: km <= 100 ? 60 : 180,
    estimated: true,
    note: '기차가 없는 소도시는 버스가 유일한 경우가 많습니다.',
  };
}

function flightService(a: City, b: City, km: number): Service | null {
  const sea = crossesSea(a, b);
  if (!sea && km < 350) return null;           // 짧은 구간은 기차가 늘 빠르다
  if (!FLIGHT_CITIES.has(a.slug) || !FLIGHT_CITIES.has(b.slug)) {
    if (!sea) return null;
    // 섬인데 공항 도시가 아니면, 섬 안에서 공항까지 가는 시간을 더 얹는다.
  }
  const ride = Math.round(km * 0.085 + 40);    // 순항 + 이착륙
  return {
    mode: 'flight',
    label: '국내선 항공',
    accessMin: 135, // 공항까지 45 + 수속·보안 90
    rideMin: ride,
    egressMin: 60,  // 하기·수하물·시내 진입
    totalMin: ride + 195,
    transfers: 0,
    costEur: Math.round(km * 0.06 + 45),
    firstDep: hm(7, 0), lastDep: hm(21, 0),
    // 마드리드~바르셀로나처럼 굵은 노선은 30분~1시간 간격이고,
    // 지방 소도시끼리는 하루 두세 편뿐이다. 한 값으로 묶으면 둘 다 틀린다.
    headwayMin: TRUNK_AIR.has(a.slug) && TRUNK_AIR.has(b.slug) ? 60 : sea ? 120 : 200,
    estimated: true,
    note: sea ? '섬으로는 사실상 유일한 수단입니다.' : '수속 시간을 넣으면 500km 안쪽에서는 고속철이 대개 더 빠릅니다.',
  };
}

/**
 * Renfe 실제 시간표에서 서비스를 만든다.
 *
 * 소요 시간은 편마다 다르므로(마드리드~바르셀로나 3시간 2분~3시간 48분)
 * 대표값으로 중앙값을 쓴다. 실제로 몇 시에 타고 몇 시에 닿는지는
 * nextDeparture 가 목록에서 골라 정확히 계산한다.
 */
function railService(list: RailDeparture[]): Service {
  const rides = list.map((r) => r.a - r.d).sort((a, b) => a - b);
  const ride = rides[Math.floor(rides.length / 2)];
  const kinds = [...new Set(list.map((r) => r.n))];
  const fast = kinds.some((k) => /AVE|AVLO|AVANT|EUROMED|ALVIA/i.test(k));
  return {
    mode: fast ? 'ave' : 'train',
    label: kinds.slice(0, 2).join('·'),
    accessMin: 30,
    rideMin: ride,
    egressMin: 15,
    totalMin: ride + 45,
    transfers: 0,
    // 요금은 시간표에 없다. 좌석 등급과 예매 시점에 따라 몇 배가 달라지므로
    // 지어내지 않고 0(모름)으로 둔다. 화면에서는 요금 줄을 아예 안 보여 준다.
    costEur: 0,
    firstDep: Math.min(...list.map((r) => r.d)),
    lastDep: Math.max(...list.map((r) => r.d)),
    headwayMin: 0,
    estimated: false,
    note: `하루 ${list.length}편. Renfe 공개 시간표입니다.`,
    timetable: list,
  };
}

/**
 * 실측 구간을 서비스 하나로 바꾼다.
 * 조사해 둔 51개 구간은 소요 시간이 확인된 값이라 추정 대신 이것을 쓴다.
 */
function measuredService(minutes: number, mode: string, note?: string): Service {
  const guess: Mode = /고속|AVE/i.test(mode) ? 'ave'
    : /버스/.test(mode) ? 'bus'
      : /항공|비행/.test(mode) ? 'flight' : 'train';
  return {
    mode: guess,
    label: mode,
    accessMin: guess === 'flight' ? 135 : 25,
    rideMin: minutes,
    egressMin: guess === 'flight' ? 60 : 12,
    totalMin: minutes + (guess === 'flight' ? 195 : 37),
    transfers: 0,
    costEur: 0,
    firstDep: guess === 'bus' ? hm(7) : hm(6, 30),
    lastDep: hm(21, 30),
    headwayMin: guess === 'ave' ? 75 : 90,
    estimated: false,
    note,
  };
}

/**
 * 두 도시 사이의 이동 방법을 전부 만들어 시간 순으로 돌려준다.
 *
 * measured 는 조사해 둔 구간(있으면 맨 앞에 놓는다).
 * 이동 시간 효율이 원칙이므로 door-to-door 총 시간으로 정렬한다.
 */
export function servicesBetween(
  a: City, b: City, measured?: { minutes: number; mode: string; note?: string },
  /** 0=일요일. 주면 그 요일에 실제로 다니는 편만 본다. */
  weekday: number | null = null,
): Service[] {
  const km = Math.round(distanceKm(a, b));
  const out: Service[] = [];

  // 실제 시간표가 있으면 그것이 최우선이다.
  const rail = railBetween(a.slug, b.slug);
  const onDay = rail ? railOnDay(rail, weekday) : null;
  const real = onDay && onDay.length ? railService(onDay) : null;

  if (crossesSea(a, b)) {
    const f = flightService(a, b, km);
    if (f) out.push(f);
    /*
     * 가까운 섬끼리는 배가 정상이다.
     *
     * 예전에는 '배편은 반나절이 걸린다' 며 비행기만 내놓았다. 본토~발레아레스
     * 처럼 먼 구간에는 맞지만, 테네리페~그란카나리아는 60km 라 고속선이
     * 1시간대이고 실제로 대부분 배로 건넌다. 비행기만 남기면 4시간짜리
     * 공항 왕복을 하라는 안내가 된다.
     */
    const ferry = ferryService(km);
    if (ferry) out.push(ferry);
    return out.sort((x, y) => x.totalMin - y.totalMin);
  }

  const railExists = hasRail(a, b, ISLAND_RAIL);
  if (real) out.push(real);
  else if (measured) out.push(measuredService(measured.minutes, measured.mode, measured.note));
  if (!real && railExists) {
    const ave = aveService(a, b, km);
    if (ave) out.push(ave);
  }
  if (railExists) out.push(trainService(a, b, km));
  out.push(busService(km));
  const f = flightService(a, b, km);
  if (f) out.push(f);
  out.push(carService(km));

  // 같은 수단이 겹치면 빠른 쪽만 남긴다(실측과 추정이 겹치는 경우).
  const seen = new Set<Mode>();
  const dedup: Service[] = [];
  for (const s of out.sort((x, y) => x.totalMin - y.totalMin)) {
    if (seen.has(s.mode)) continue;
    seen.add(s.mode);
    dedup.push(s);
  }
  return dedup;
}

/**
 * 이 수단을 몇 시에 탈 수 있는지.
 *
 * 택시처럼 아무 때나 타는 것이 아니면 첫차·배차 간격에 맞춰 기다려야 한다.
 * 아침 9시에 나서도 첫차가 10시면 10시에 타는 것이고, 막차가 끊겼으면
 * 그날은 갈 수 없다(null).
 *
 * @param readyAt 숙소에서 나설 수 있는 가장 이른 시각(분).
 */
export function nextDeparture(service: Service, readyAt: number): Departure | null {
  // 역·공항에 닿는 시각. 이보다 이르게는 탈 수 없다.
  const atStation = readyAt + service.accessMin;

  /*
   * 실제 시간표가 있으면 그 목록에서 고른다.
   * 어림한 배차 간격으로 '35분 대기' 라고 말하는 것과, 실제로 09:24 열차가
   * 있다고 말하는 것은 다르다. 소요 시간도 편마다 다르므로 그 편의 값을 쓴다.
   */
  if (service.timetable && service.timetable.length) {
    const next = service.timetable.find((r) => r.d >= atStation);
    if (!next) return null;                    // 그날 남은 편이 없다
    const arriveAt = next.a + service.egressMin;
    return {
      service,
      leaveAt: readyAt,
      departAt: next.d,
      arriveAt,
      waitMin: next.d - atStation,
      doorToDoorMin: arriveAt - readyAt,
    };
  }

  let departAt: number;
  if (service.headwayMin === 0) {
    departAt = atStation;                     // 렌터카는 준비되는 대로
  } else {
    const first = service.firstDep;
    if (atStation <= first) departAt = first;
    else {
      const since = atStation - first;
      departAt = first + Math.ceil(since / service.headwayMin) * service.headwayMin;
    }
    if (departAt > service.lastDep) return null;   // 막차가 끊겼다
  }

  const waitMin = departAt - atStation;
  const arriveAt = departAt + service.rideMin + service.egressMin;
  return {
    service,
    leaveAt: readyAt,
    departAt,
    arriveAt,
    waitMin,
    doorToDoorMin: arriveAt - readyAt,
  };
}

/**
 * 그날 안에 갈 수 있는 방법들을, 실제로 닿는 시각 순으로.
 * 막차가 끊긴 수단은 빠진다.
 */
export function departuresFrom(services: Service[], readyAt: number): Departure[] {
  return services
    .map((s) => nextDeparture(s, readyAt))
    .filter((d): d is Departure => d !== null)
    .sort((a, b) => a.arriveAt - b.arriveAt);
}

/** 이동 시간 효율만 본 최선. 동선 계산의 기준값이다. */
export function fastest(
  a: City, b: City, measured?: { minutes: number; mode: string }, weekday: number | null = null,
): Service {
  const list = servicesBetween(a, b, measured, weekday);
  return list[0] ?? carService(Math.round(distanceKm(a, b)));
}

export const fmtHm = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const fmtDur = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}분` : m % 60 === 0 ? `${h}시간` : `${h}시간 ${m % 60}분`;
};
