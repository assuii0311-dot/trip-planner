import type { City, Item, PlanDay } from '../types';
import { distanceKm } from './geo';
import { addDays } from './caldate';

/**
 * 어느 동네에 숙소를 잡을 것인가.
 *
 * 앱은 어느 '도시' 에서 잘지는 정해 주면서 어느 '동네' 에 잡을지는 말하지
 * 않았다. 이동 시간은 "숙소 09:00 출발" 로 계산하면서 정작 숙소가 어디인지
 * 모르는 상태였다. 도시 하나가 넓으면(마드리드·바르셀로나) 이 차이가
 * 하루 30분씩 쌓인다.
 *
 * 동네 이름을 지어내지 않는다. 가진 데이터에 district 가 거의 비어 있어서
 * (2,132개 중 138개) 이름을 붙이면 절반은 틀린다. 대신 확실히 아는 것만
 * 쓴다 - 이 여행에서 실제로 가기로 한 곳들이 어디에 모여 있는가.
 *
 * 그 무게중심을 고르되, 좌표만 덩그러니 주면 쓸모가 없으므로 그 자리에서
 * 가장 가까운 '아는 장소' 를 기준점으로 삼는다. "산타 후스타 역과 대성당
 * 사이" 처럼 사람이 아는 말로 옮기기 위해서다.
 */

export interface LodgingPick {
  city: City;
  /** 숙소를 잡을 기준점. 이 여행 일정의 무게중심에서 가장 가까운 곳. */
  anchor: Item;
  /** 무게중심 좌표. 지도·예약 링크에 쓴다. */
  lat: number;
  lon: number;
  /** 기준점 반경 안에 들어오는 일정 수 / 전체. */
  within: number;
  total: number;
  /** 이 반경(km) 안이면 걸어 다닐 만하다. */
  radiusKm: number;
  /** 여기에 묵는 밤 수. */
  nights: number;
  /** 무게중심에서 가장 먼 일정까지(km). 도시가 넓게 퍼져 있는지 알려 준다. */
  spreadKm: number;
  /** 체크인 / 체크아웃 날짜(YYYY-MM-DD). 예약 링크에 그대로 넘긴다. */
  checkIn: string;
  checkOut: string;
}

const hasCoords = (i: { lat: number | null; lon: number | null }): boolean =>
  i.lat !== null && i.lon !== null;

/** 걸어 다닐 만한 반경. 이보다 멀면 대중교통을 타야 한다. */
const WALK_RADIUS_KM = 1.2;

/**
 * 한 도시에서 묵을 자리를 고른다.
 *
 * 그 도시에서 보기로 한 곳들의 무게중심을 잡고, 거기서 가장 가까운 일정을
 * 기준점으로 삼는다. 평균이 아니라 '중앙값에 가까운 점' 을 쓰는 이유는,
 * 외곽에 하나 있는 일정(공항 근처 미술관 같은)이 무게중심을 통째로 끌고
 * 가는 것을 막기 위해서다.
 */
export function lodgingFor(
  city: City, dayItems: Item[], nights: number, checkIn = '', checkOut = '',
): LodgingPick | null {
  const pts = dayItems.filter(hasCoords);
  if (pts.length === 0) return null;

  /*
   * 기준점은 '실제 장소' 중에서 고른다.
   *
   * 처음에는 위도·경도의 중앙값을 따로 내서 그 좌표를 썼다. 그런데 둘을
   * 따로 내면 어느 일정에도 해당하지 않는 자리가 나온다 - 오비에도에서
   * '가장 먼 일정이 1.4km 인데 걸어서 닿는 것은 6곳 중 1곳' 이라는, 앞뒤가
   * 안 맞는 값이 그래서 나왔다.
   *
   * 대신 다른 모든 일정까지의 거리 합이 가장 작은 일정을 고른다(1-중앙점).
   * 평균이 아니라 중앙점이므로 외곽에 하나 있는 일정이 기준을 끌고 가지
   * 않고, 실제 장소라 "그 근처" 라는 말이 그대로 성립한다.
   */
  let anchor = pts[0];
  let bestSum = Infinity;
  for (const c of pts) {
    const at = { lat: c.lat as number, lon: c.lon as number };
    let sum = 0;
    for (const p of pts) sum += distanceKm(at, { lat: p.lat as number, lon: p.lon as number });
    if (sum < bestSum) { bestSum = sum; anchor = c; }
  }

  const lat = anchor.lat as number;
  const lon = anchor.lon as number;
  const dists = pts.map((p) => distanceKm({ lat, lon }, { lat: p.lat as number, lon: p.lon as number }));
  return {
    city,
    anchor,
    lat,
    lon,
    within: dists.filter((d) => d <= WALK_RADIUS_KM).length,
    total: pts.length,
    radiusKm: WALK_RADIUS_KM,
    nights,
    spreadKm: Math.round(Math.max(...dists) * 10) / 10,
    checkIn,
    checkOut,
  };
}

/**
 * 계획 전체에서 숙소를 잡아야 하는 곳들.
 *
 * 그 도시에서 자는 날들의 일정을 모두 모아 무게중심을 잡는다. 당일치기로
 * 다녀오는 도시의 일정도 그 거점에 묶인다 - 거기서 나가고 거기로 돌아오기
 * 때문이다. 다만 무게중심은 거점 도시 안 일정으로만 잡는다.
 */
export function lodgingPlan(days: PlanDay[], cities: City[]): LodgingPick[] {
  const bySleep = new Map<string, { items: Item[]; dates: string[] }>();
  for (const d of days) {
    if (!d.sleepAt) continue;
    const e = bySleep.get(d.sleepAt) ?? { items: [], dates: [] };
    e.dates.push(d.date);
    for (const en of d.entries) if (en.item.city === d.sleepAt) e.items.push(en.item);
    bySleep.set(d.sleepAt, e);
  }

  const out: LodgingPick[] = [];
  for (const [slug, { items, dates }] of bySleep) {
    const city = cities.find((c) => c.slug === slug);
    if (!city) continue;
    const sorted = [...dates].sort();
    const checkIn = sorted[0];
    // 마지막으로 잔 날의 다음 날 아침에 나온다.
    const checkOut = addDays(sorted[sorted.length - 1], 1);
    const nights = sorted.length;
    const pick = lodgingFor(city, items, nights, checkIn, checkOut);
    if (pick) out.push(pick);
    else {
      // 그 도시 일정에 좌표가 하나도 없으면 도시 좌표로라도 잡아 준다.
      out.push({
        city, anchor: items[0] ?? ({} as Item), lat: city.lat, lon: city.lon,
        within: 0, total: 0, radiusKm: WALK_RADIUS_KM, nights, spreadKm: 0,
        checkIn, checkOut,
      });
    }
  }
  return out.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/** 숙소 검색 링크. 좌표를 넘겨 그 근처만 보게 한다. */
export function lodgingLinks(p: LodgingPick): { label: string; url: string; note: string }[] {
  const checkIn = p.checkIn;
  const checkOut = p.checkOut;
  const q = (s: string) => encodeURIComponent(s);
  const near = `${p.city.nameEn}`;
  return [
    {
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.html?ss=${q(near)}`
        + `&latitude=${p.lat.toFixed(5)}&longitude=${p.lon.toFixed(5)}`
        + `&checkin=${checkIn}&checkout=${checkOut}`,
      note: '스페인은 Booking 재고가 가장 많습니다. 지도 보기로 아래 좌표 근처만 걸러 보세요.',
    },
    {
      label: '구글 지도에서 이 자리 보기',
      url: `https://www.google.com/maps/search/hotel/@${p.lat.toFixed(5)},${p.lon.toFixed(5)},15z`,
      note: '일정의 한가운데입니다. 여기서 반경 1km 안이면 대부분 걸어 다닐 수 있습니다.',
    },
    {
      label: 'Airbnb',
      url: `https://www.airbnb.co.kr/s/${q(near)}/homes?checkin=${checkIn}&checkout=${checkOut}`,
      note: '길게 묵거나 일행이 많으면 아파트가 쌉니다. 구시가는 엘리베이터 없는 건물이 많습니다.',
    },
  ];
}
