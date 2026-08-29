import type { City } from '../types';
import { distanceKm } from './geo';

/** 조사해 둔 실제 소요 시간. 거점→근교 45쌍이 여기 들어 있다. */
export interface TransitLeg {
  minutes: number;
  mode: string;
  /** 시간표에서 확인한 값인지, 거리로 추정한 값인지. */
  measured: boolean;
  note?: string;
}

/**
 * 도시 쌍의 이동 시간.
 *
 * 조사해 둔 값이 있으면 그것을 쓰고, 없으면 거리로 추정한다.
 * 추정치는 화면에 "약"으로 표시해 조사값과 구분한다. 60개 도시의
 * 1,770개 조합을 전부 시간표로 확인할 수는 없기 때문이다.
 */
export function buildTransitTable(cities: City[]): Map<string, TransitLeg> {
  const table = new Map<string, TransitLeg>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const city of cities) {
    for (const trip of city.dayTrips) {
      table.set(key(city.slug, trip.city), {
        minutes: trip.transitMin, mode: trip.mode, measured: true, note: trip.note,
      });
    }
  }
  return table;
}

/**
 * 스페인 철도는 마드리드를 중심으로 한 방사형이다.
 * 이 도시들 사이에는 직통 고속철이 있지만, 그 밖의 도시끼리는 대개
 * 마드리드나 인근 거점에서 갈아타야 해서 시간이 훨씬 더 걸린다.
 */
const RAIL_HUBS = new Set([
  'madrid', 'barcelona', 'seville', 'valencia', 'zaragoza', 'malaga',
  'cordoba', 'alicante', 'bilbao', 'santiago', 'palma', 'las-palmas',
  'santa-cruz-tenerife',
]);

/**
 * 거리로 이동 시간을 추정한다. 스페인 기준으로 맞춘 계수다.
 *
 * 짧은 거리는 완행과 정차가 많아 느리고, 200km 를 넘으면 고속철이 붙어
 * km 당 시간이 짧아진다. 다만 양쪽 다 간선역이 아니면 환승이 붙는다 —
 * 코르도바에서 톨레도는 232km 지만 마드리드에서 갈아타야 해서
 * 거리로 계산한 126분이 아니라 실제로는 두 시간 반이 넘는다.
 * 섬과 본토 사이는 비행이 전제다.
 */
export function estimateTransit(a: City, b: City): TransitLeg {
  const crossesSea =
    (a.macroRegion === 'island') !== (b.macroRegion === 'island') ||
    (a.macroRegion === 'island' && b.macroRegion === 'island' && a.region !== b.region);
  if (crossesSea) {
    return { minutes: 240, mode: '항공 (공항 대기 포함)', measured: false };
  }

  const km = distanceKm(a, b);
  if (km <= 40) return { minutes: Math.round(km * 1.6 + 20), mode: '근교열차·버스', measured: false };
  if (km <= 120) return { minutes: Math.round(km * 0.8 + 30), mode: '지역열차·버스', measured: false };

  const direct = RAIL_HUBS.has(a.slug) && RAIL_HUBS.has(b.slug);
  if (direct) {
    // 간선끼리는 AVE 직통이 있다. 마드리드~바르셀로나 505km 가 2시간 30분이다.
    return { minutes: Math.round(km * 0.25 + 35), mode: '고속열차 직통', measured: false };
  }
  // 한쪽이라도 간선역이 아니면 환승이 붙는다.
  const transfers = RAIL_HUBS.has(a.slug) || RAIL_HUBS.has(b.slug) ? 1 : 2;
  return {
    minutes: Math.round(km * 0.5 + 40 + transfers * 45),
    mode: transfers === 1 ? '열차 (1회 환승)' : '열차 (2회 이상 환승)',
    measured: false,
  };
}

export function transitBetween(a: City, b: City, table: Map<string, TransitLeg>): TransitLeg {
  const k = a.slug < b.slug ? `${a.slug}|${b.slug}` : `${b.slug}|${a.slug}`;
  return table.get(k) ?? estimateTransit(a, b);
}

/** 당일치기로 다녀올 만한 한계. 편도 이 시간을 넘으면 하루가 이동으로 다 간다. */
export const DAY_TRIP_LIMIT_MIN = 150;
