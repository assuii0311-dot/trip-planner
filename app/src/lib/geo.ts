import type { Item } from '../types';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 사이의 대권 거리(km). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function hasCoords(i: Item): i is Item & { lat: number; lon: number } {
  return i.lat !== null && i.lon !== null;
}

/**
 * 도시 안에서의 이동 시간 추정(분).
 * 1.2km 까지는 도보, 그 이상은 대중교통으로 보고 대기·환승 시간을 더한다.
 * 좌표가 없는 아이템은 도시 평균으로 15분을 잡는다.
 */
export function travelMinutes(a: Item, b: Item): number {
  if (!hasCoords(a) || !hasCoords(b)) return 15;
  const km = distanceKm(a, b);
  if (km <= 1.2) return Math.max(5, Math.round((km / 4.5) * 60));
  return Math.round(8 + (km / 18) * 60);
}

export function walkKmOf(items: Item[]): number {
  let km = 0;
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    if (hasCoords(a) && hasCoords(b)) km += distanceKm(a, b);
  }
  return Math.round(km * 10) / 10;
}
