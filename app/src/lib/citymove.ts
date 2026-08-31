import type { City, Item } from '../types';
import { distanceKm, hasCoords } from './geo';

/**
 * 도시 안에서 다음 장소로 어떻게 가는가.
 *
 * 계획에는 "앞 일정에서 약 18분 이동" 만 적혀 있었다. 18분이 걷는 18분인지
 * 지하철 18분인지 알 수 없으면 그 자리에서 할 수 있는 판단이 없다. 신발을
 * 어떻게 신을지도, 교통권을 살지도 정하지 못한다.
 *
 * 거리로 수단을 정한다. 좌표가 없으면 모른다고 말한다 — 2,132개 중
 * 267개(12.5%)는 좌표가 없어서 지어내면 그만큼이 거짓이 된다.
 */

export type MoveMode = 'walk' | 'transit' | 'taxi' | 'unknown';

export interface CityMove {
  mode: MoveMode;
  icon: string;
  label: string;
  minutes: number;
  km: number | null;
  /** 구글 지도 길찾기 URL. 실제 노선과 배차는 여기서 본다. */
  url: string | null;
}

const MODE_ICON: Record<MoveMode, string> = {
  walk: '🚶', transit: '🚇', taxi: '🚕', unknown: '↑',
};

/** 이 거리까지는 걷는 편이 빠르다. 환승·대기를 감안한 값이다. */
const WALK_MAX_KM = 1.2;
/** 이보다 멀면 도심 대중교통도 오래 걸려 택시를 함께 제시한다. */
const TAXI_FROM_KM = 6;

const q = (s: string) => encodeURIComponent(s);

function point(i: Item, city?: City): string {
  if (hasCoords(i)) return `${i.lat},${i.lon}`;
  return `${i.nameLocal ?? i.nameEn} ${city?.nameEn ?? ''}`.trim();
}

/**
 * @param minutes 플래너가 이미 계산해 둔 이동 시간. 여기서 다시 재지 않는다 —
 *   화면에 두 값이 뜨면 어느 쪽이 맞는지 알 수 없기 때문이다.
 */
export function cityMove(from: Item, to: Item, minutes: number, city?: City): CityMove {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${q(point(from, city))}`
    + `&destination=${q(point(to, city))}&travelmode=`;

  if (!hasCoords(from) || !hasCoords(to)) {
    return {
      mode: 'unknown', icon: MODE_ICON.unknown, label: '이동',
      minutes, km: null,
      // 좌표가 없어도 이름으로는 찾아진다.
      url: `${url}transit`,
    };
  }

  const km = Math.round(distanceKm(from, to) * 10) / 10;
  if (km <= WALK_MAX_KM) {
    return { mode: 'walk', icon: MODE_ICON.walk, label: '도보', minutes, km, url: `${url}walking` };
  }
  if (km < TAXI_FROM_KM) {
    return { mode: 'transit', icon: MODE_ICON.transit, label: '지하철·버스', minutes, km, url: `${url}transit` };
  }
  return { mode: 'taxi', icon: MODE_ICON.taxi, label: '택시·지하철', minutes, km, url: `${url}transit` };
}

/**
 * 이 도시에서 그 수단을 쓰려면 알아야 할 것.
 * 도시 데이터의 교통 안내에서 가져온다. 없으면 아무 말도 하지 않는다.
 */
export function transitTip(city: City | undefined, mode: MoveMode): string | null {
  if (!city || mode === 'walk' || mode === 'unknown') return null;
  const pass = city.transitGuide?.passes?.[0];
  if (pass) return `${pass.name} ${pass.price}${pass.note ? ` — ${pass.note}` : ''}`;
  const app = city.transitGuide?.apps?.[0];
  return app ? `${app.name} — ${app.note}` : null;
}
