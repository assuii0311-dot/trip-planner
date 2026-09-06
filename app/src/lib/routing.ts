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
  /**
   * 숙소에서 나서는 시각(분).
   *
   * 탈 것에 맞춘다 — `departAt - accessMin`. 나설 수 있게 된 시각보다
   * 이르지는 않다.
   *
   * ## 예전에 무엇이 잘못됐나
   *
   * 언제나 `readyAt` 이었다. 그래서 다음 편이 몇 시간 뒤여도 '지금 나서라'
   * 고 했다. 사용자가 보내 준 화면이 이렇다.
   *
   *   그라나다 → 바르셀로나
   *   09:00 숙소 출발 · 13:40 탑승 · 16:18 도착      7시간 18분
   *   국내선 항공 · 공항에서 대기 145분
   *   4.9시간 거리라 아침에 옮겨 바르셀로나를 길게 씁니다
   *
   * 09:00 에 숙소를 나서서 13:40 비행기를 타라는 말이다. 수속에 드는 135분을
   * 빼도 **145분을 공항에 앉아 있으라**는 안내였고, 머리 숫자(7시간 18분)와
   * 사유 줄(4.9시간)이 서로 다른 말을 했다. 11:25 에 나서면 될 일이다.
   */
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
  // 마드리드~바르셀로나 고속선은 지로나를 지나 피게레스까지 이어진다(2013).
  // 이 둘이 빠져 있어 그라나다→지로나 같은 구간에 고속철 후보가 아예 없었고,
  // 렌터카 10시간 52분만 남았다. 환승 계수(0.45)로도 7시간대다.
  { cities: ['madrid', 'zaragoza', 'tarragona', 'barcelona', 'girona', 'figueres'], minPerKm: 0.34 },
  { cities: ['madrid', 'toledo'], minPerKm: 0.47 },
  { cities: ['madrid', 'segovia'], minPerKm: 0.40 },
  { cities: ['madrid', 'cordoba', 'seville'], minPerKm: 0.36 },
  { cities: ['madrid', 'cordoba', 'malaga'], minPerKm: 0.38 },
  { cities: ['madrid', 'cordoba', 'granada'], minPerKm: 0.55 },
  { cities: ['madrid', 'cuenca', 'valencia'], minPerKm: 0.36 },
  { cities: ['madrid', 'alicante'], minPerKm: 0.38 },
  // 갈리시아 고속선은 오렌세에서 산티아고를 거쳐 라코루냐까지 간다.
  // 산티아고~라코루냐 55km 를 Avant 가 30분에 잇는데, 빠져 있어 렌터카
  // 1시간 39분으로 안내됐다.
  { cities: ['madrid', 'ourense', 'santiago', 'a-coruna'], minPerKm: 0.40 },
  // 비고 쪽은 오렌세 이후가 느리다. 마드리드~비고 실제 4시간 10분에 맞춘다.
  { cities: ['ourense', 'santiago', 'vigo'], minPerKm: 0.40 },
  { cities: ['madrid', 'vigo'], minPerKm: 0.50 },
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
/**
 * 한 종별이 하루에 이만큼은 다녀야 '그 열차로 계획한다' 고 말할 수 있다.
 * 하루 한두 편뿐인 특급 하나가 구간 전체의 기준이 되면 안 된다.
 */
const MIN_RUNS = 3;

/**
 * 실제 시간표를 서비스 하나로 요약한다.
 *
 * ## 예전에는 전체 중앙값을 썼고, 그게 틀렸다
 *
 * 한 구간에 성격이 다른 열차가 섞여 다닌다. 바르셀로나~지로나에는
 * **고속(AVE·AVANT) 27편이 41분**, 완행(MD·REGIONAL) 33편이 79~91분이다.
 * 전부 섞어 중앙값을 내면 79분이 나온다 — 완행 쪽에 표본이 하나 더 많다는
 * 이유로. 그래서 앱은 41분짜리 열차가 하루 27편 다니는 구간을
 * **1시간 19분**이라고 말했고, 그 값이 렌터카(1시간 21분)에게 져서
 * 화면에는 아예 열차가 나오지도 않았다.
 *
 * 중앙값의 문제가 아니라 **서로 다른 상품을 한 숫자로 묶은 것**이 문제다.
 * 종별로 나눠 각자의 중앙값을 내고, 그중 하루 `MIN_RUNS` 편 이상 다니는
 * 가장 빠른 종별을 이 구간의 대표로 삼는다.
 *
 * 종별 안에서는 최소가 아니라 중앙값을 쓴다. 원본에 바르셀로나~지로나
 * AVE 20분 같은 값이 섞여 있는데(85km 를 20분에 갈 수 없다) 최소를 쓰면
 * 그런 것이 기준이 된다.
 *
 * 느린 편도 `timetable` 에는 그대로 남긴다. 그 시간대에 완행밖에 없으면
 * 완행을 타는 것이 맞고, `nextDeparture` 가 실제로 먼저 닿는 편을 고른다.
 */
function railService(list: RailDeparture[]): Service {
  const byKind = new Map<string, number[]>();
  for (const r of list) {
    const a = byKind.get(r.n) ?? [];
    a.push(r.a - r.d);
    byKind.set(r.n, a);
  }
  const kinds = [...byKind.entries()]
    .map(([n, rides]) => {
      const sorted = rides.sort((x, y) => x - y);
      return { n, runs: sorted.length, median: sorted[Math.floor(sorted.length / 2)] };
    })
    .sort((a, b) => a.median - b.median);
  const pick = kinds.find((k) => k.runs >= MIN_RUNS) ?? kinds[0];
  const ride = pick.median;
  const fast = /AVE|AVLO|AVANT|EUROMED|ALVIA/i.test(pick.n);
  const slower = kinds.filter((k) => k.n !== pick.n && k.median > pick.median);
  return {
    mode: fast ? 'ave' : 'train',
    label: pick.n,
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
    note: `${pick.n} 하루 ${pick.runs}편 기준`
      + (slower.length ? ` · 느린 ${slower.map((k) => k.n).join('·')} 도 같은 구간을 다닙니다` : '')
      + '. Renfe 공개 시간표입니다.',
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
/**
 * 정해진 출발 시각에 맞춰 '언제 나서는가' 를 되돌린다.
 *
 * 나서는 시각은 탈 것이 정한다 — 수속 시간만큼 앞서 나선다. 그보다 일찍
 * 나설 이유가 없다. 나설 수 있게 된 시각(`readyAt`)보다 이르게는 못 가므로
 * 거기서 자른다. 잘렸다는 것은 그만큼은 정말로 기다린다는 뜻이라 `waitMin`
 * 에 남는다.
 */
function depart(service: Service, readyAt: number, departAt: number, arriveAt: number): Departure {
  const leaveAt = Math.max(readyAt, departAt - service.accessMin);
  return {
    service,
    leaveAt,
    departAt,
    arriveAt,
    waitMin: Math.max(0, departAt - (leaveAt + service.accessMin)),
    doorToDoorMin: arriveAt - leaveAt,
  };
}

export function nextDeparture(service: Service, readyAt: number): Departure | null {
  // 역·공항에 닿는 시각. 이보다 이르게는 탈 수 없다.
  const atStation = readyAt + service.accessMin;

  /*
   * 실제 시간표가 있으면 그 목록에서 고른다.
   * 어림한 배차 간격으로 '35분 대기' 라고 말하는 것과, 실제로 09:24 열차가
   * 있다고 말하는 것은 다르다. 소요 시간도 편마다 다르므로 그 편의 값을 쓴다.
   */
  if (service.timetable && service.timetable.length) {
    /*
     * 먼저 **떠나는** 편이 아니라 먼저 **닿는** 편을 고른다.
     *
     * 예전에는 목록에서 탈 수 있는 첫 편을 그냥 집었다. 그런데 한 구간에는
     * 고속과 완행이 섞여 다닌다 — 09:56 완행(79분)을 집고 나면, 10:10 에
     * 떠나 40분 먼저 닿는 고속을 놓친다. 역에서 14분을 더 기다리는 쪽이
     * 목적지에 40분 일찍 닿는데도 그랬다.
     *
     * 사람이 시간표를 볼 때 고르는 기준은 출발이 아니라 도착이다.
     */
    let next: RailDeparture | null = null;
    for (const r of service.timetable) {
      if (r.d < atStation) continue;
      if (!next || r.a < next.a || (r.a === next.a && r.d < next.d)) next = r;
    }
    if (!next) return null;                    // 그날 남은 편이 없다
    const arriveAt = next.a + service.egressMin;
    return depart(service, readyAt, next.d, arriveAt);
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

  const arriveAt = departAt + service.rideMin + service.egressMin;
  return depart(service, readyAt, departAt, arriveAt);
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

/**
 * 렌터카를 피해 주는 여유(분).
 *
 * 근교는 짐을 거점에 두고 다녀오는 길이라 하루짜리 렌트가 번거롭다. 그래서
 * 예전에는 **무조건** 렌터카가 아닌 것을 골랐다. 그 '무조건' 이 6시간 38분을
 * 기다리게 만들었다. 피해 주되, 이만큼까지만 피한다.
 */
const AVOID_MARGIN = 30;

/**
 * 이 시각에 나선다고 할 때 **실제로 가장 일찍 닿는** 방법.
 *
 * ## 왜 `options[0]` 이면 안 되는가
 *
 * `servicesBetween` 는 대기를 뺀 `totalMin` 으로 줄을 세운다. 대기는 몇 시에
 * 나서느냐에 달렸으니 수단 자체의 성질이 아니다 — 그 판단 자체는 맞다.
 * 문제는 **고르는 자리마다 그 줄의 첫 번째를 집었다**는 것이다. 그래 놓고
 * 보여 줄 때만 `nextDeparture` 로 대기를 넣어 계산했다. 고를 때 쓴 숫자와
 * 살아 낼 숫자가 서로 달랐다.
 *
 * 하루에 몇 편 없는 구간에서 그 차이가 통째로 드러난다. 말라가~그라나다
 * 직통 AVANT 는 하루 세 편이다(09:20 · 16:38 · 20:20). 09:30 에 나서면
 * 09:20 을 이미 놓쳐 다음이 16:38 이다.
 *
 *   탑승 82분 · totalMin 2시간 7분  ← 이 숫자로 골랐다
 *   09:30 출발 → 18:15 도착 (8시간 45분)  ← 이 숫자로 보여 줬다
 *
 * 렌터카·버스·일반열차는 모두 두 시간대였는데도 그랬다. 고르는 것과 보여
 * 주는 것이 같은 시계를 봐야 한다.
 *
 * @param prefer 사용자가 직접 고른 수단. 아직 다니면 그것이 우선이다.
 * @param avoid  될 수 있으면 피할 수단. `AVOID_MARGIN` 안에서만 피한다.
 */
export function bestFrom(
  options: Service[],
  readyAt: number,
  opts: { prefer?: string; avoid?: Mode } = {},
): Service | null {
  const runs = options
    .map((s) => ({ s, d: nextDeparture(s, readyAt) }))
    .filter((x): x is { s: Service; d: Departure } => x.d !== null)
    // 닿는 시각이 같으면 문앞~문앞이 짧은 쪽. 그것도 같으면 원래 순서.
    .sort((x, y) => x.d.arriveAt - y.d.arriveAt || x.d.doorToDoorMin - y.d.doorToDoorMin);
  if (!runs.length) return null;

  const picked = opts.prefer ? runs.find((x) => x.s.mode === opts.prefer) : undefined;
  if (picked) return picked.s;

  const best = runs[0];
  if (opts.avoid && best.s.mode === opts.avoid) {
    const other = runs.find((x) => x.s.mode !== opts.avoid);
    if (other && other.d.arriveAt - best.d.arriveAt <= AVOID_MARGIN) return other.s;
  }
  return best.s;
}

/**
 * 이동 시간 효율만 본 최선.
 *
 * 시계가 없는 자리에서만 쓴다 — 도시 차례를 정하는 거리 행렬처럼, '몇 시에
 * 나서는가' 가 아직 없는 곳이다. 나설 시각을 알 수 있는 자리에서는 반드시
 * `bestFrom` 을 쓴다. 위의 말라가~그라나다가 그것을 섞어 쓴 대가였다.
 */
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

/**
 * 시각 — 자정을 넘기면 그렇다고 말한다.
 *
 * `fmtHm` 은 1440분으로 나눈 나머지를 쓴다. 그래서 자정을 넘겨 닿는 이동이
 * "09:30 숙소 출발 · 00:09 도착" 으로 떴다. **떠나기 전에 닿는 것처럼**
 * 보인다. 카다케스↔카디스(렌터카 14시간 39분)가 실제로 그랬다.
 *
 * 하루에 몇 편 없는 구간을 고르는 것과 같은 실수다 — 계산은 맞는데 화면이
 * 다른 말을 한다.
 */
export const fmtDayHm = (min: number): string =>
  (min >= 1440 ? `다음 날 ${fmtHm(min)}` : fmtHm(min));

export const fmtDur = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}분` : m % 60 === 0 ? `${h}시간` : `${h}시간 ${m % 60}분`;
};
