/**
 * 스페인 입·출국 공항.
 *
 * 출도착지는 도시가 아니라 공항 기준이다. 비행기표를 먼저 끊고 일정을 짜기
 * 때문이다. 마드리드로 들어와 바르셀로나에서 나오는 표를 이미 들고 있는
 * 사람에게 "어느 도시부터 도시겠습니까" 를 묻는 것은 순서가 뒤바뀐 질문이다.
 *
 * 한국에서 갈 때 실제로 쓰게 되는 공항만 담았다. 인천 직항은 마드리드와
 * 바르셀로나뿐이고 나머지는 유럽 어딘가에서 갈아탄다. 스페인에는 40곳이
 * 넘는 공항이 있지만, 국내선 전용이나 연간 이용객이 몇만 명인 곳까지 넣으면
 * 목록만 길어지고 고를 때 방해가 된다.
 *
 * city 는 이 공항이 실질적으로 서비스하는 도시의 slug 다. 앱은 이것으로
 * 동선 순서를 정한다. 레지스트리에 없는 도시(무르시아, 이비사 등)를 쓰는
 * 공항은 가장 가까운 등록 도시에 붙였고, 그런 경우 note 에 적어 두었다.
 */
export interface Airport {
  /** IATA 코드. 항공권에 찍히는 그 코드다. */
  iata: string;
  name: string;
  /** 이 공항이 서비스하는 도시(레지스트리 slug). 동선 순서 계산에 쓴다. */
  city: string;
  lat: number;
  lon: number;
  /** 인천 직항이 있는가. 목록 맨 위로 올린다. */
  direct?: boolean;
  /** 공항과 도시가 어긋날 때의 설명. */
  note?: string;
}

export const AIRPORTS: Airport[] = [
  // 인천 직항
  { iata: 'MAD', name: '마드리드 바라하스', city: 'madrid', lat: 40.4936, lon: -3.5668, direct: true },
  { iata: 'BCN', name: '바르셀로나 엘프라트', city: 'barcelona', lat: 41.2971, lon: 2.0785, direct: true },

  // 본토 — 경유편으로 들어가는 곳
  { iata: 'AGP', name: '말라가 코스타델솔', city: 'malaga', lat: 36.6749, lon: -4.4991 },
  { iata: 'SVQ', name: '세비야', city: 'seville', lat: 37.4180, lon: -5.8931 },
  { iata: 'VLC', name: '발렌시아', city: 'valencia', lat: 39.4893, lon: -0.4816 },
  { iata: 'ALC', name: '알리칸테 엘체', city: 'alicante', lat: 38.2822, lon: -0.5582 },
  { iata: 'BIO', name: '빌바오', city: 'bilbao', lat: 43.3011, lon: -2.9106 },
  { iata: 'GRX', name: '그라나다 하엔', city: 'granada', lat: 37.1887, lon: -3.7776 },
  { iata: 'SCQ', name: '산티아고데콤포스텔라', city: 'santiago', lat: 42.8963, lon: -8.4151 },
  { iata: 'ZAZ', name: '사라고사', city: 'zaragoza', lat: 41.6662, lon: -1.0416 },
  { iata: 'GRO', name: '지로나 코스타브라바', city: 'girona', lat: 41.9010, lon: 2.7605 },
  { iata: 'XRY', name: '헤레스', city: 'jerez', lat: 36.7446, lon: -6.0601 },
  { iata: 'SDR', name: '산탄데르', city: 'santander', lat: 43.4271, lon: -3.8200 },
  { iata: 'OVD', name: '아스투리아스', city: 'oviedo', lat: 43.5636, lon: -6.0346, note: '오비에도 시내까지 약 40분' },
  { iata: 'LCG', name: '라코루냐', city: 'a-coruna', lat: 43.3021, lon: -8.3773 },
  { iata: 'VGO', name: '비고', city: 'vigo', lat: 42.2318, lon: -8.6273 },
  { iata: 'EAS', name: '산세바스티안', city: 'san-sebastian', lat: 43.3565, lon: -1.7906 },
  { iata: 'PNA', name: '팜플로나', city: 'pamplona', lat: 42.7700, lon: -1.6463 },
  { iata: 'REU', name: '레우스', city: 'tarragona', lat: 41.1474, lon: 1.1672, note: '타라고나 기준. 레우스 시내는 별도' },
  { iata: 'RMU', name: '무르시아 코르베라', city: 'alicante', lat: 37.8030, lon: -1.1250, note: '무르시아는 이 앱에 없어 알리칸테 기준으로 계산합니다' },
  { iata: 'LEI', name: '알메리아', city: 'granada', lat: 36.8439, lon: -2.3701, note: '알메리아는 이 앱에 없어 그라나다 기준으로 계산합니다' },

  // 발레아레스 제도
  { iata: 'PMI', name: '팔마데마요르카', city: 'palma', lat: 39.5517, lon: 2.7388 },
  { iata: 'IBZ', name: '이비사', city: 'palma', lat: 38.8729, lon: 1.3731, note: '이비사는 이 앱에 없어 마요르카 기준으로 계산합니다' },

  // 카나리아 제도
  // 테네리페에는 공항이 둘이고 섬의 반대쪽 끝에 있다. 국제선은 대부분
  // 남부(TFS)로 들어오는데, 산타크루스까지는 버스로 한 시간 반이 넘는다.
  { iata: 'TFS', name: '테네리페 남부', city: 'santa-cruz-tenerife', lat: 28.0445, lon: -16.5725,
    note: '섬 남쪽 끝이라 산타크루스까지 1시간 40분쯤 걸립니다. 남부 해안에 묵으면 가깝습니다.' },
  { iata: 'TFN', name: '테네리페 북부', city: 'la-laguna', lat: 28.4827, lon: -16.3415,
    note: '라라구나·산타크루스에 가깝습니다. 국내선과 제도 안 노선이 주로 뜹니다.' },
  { iata: 'LPA', name: '그란카나리아', city: 'las-palmas', lat: 27.9319, lon: -15.3866,
    note: '라스팔마스까지 약 30분, 마스팔로마스까지도 비슷합니다.' },
];

export const airportOf = (iata: string | null): Airport | undefined =>
  iata ? AIRPORTS.find((a) => a.iata === iata) : undefined;

/** 목록 표시 순서 — 직항을 맨 위에, 나머지는 이름순. */
export const AIRPORT_GROUPS: { label: string; list: Airport[] }[] = [
  { label: '인천 직항', list: AIRPORTS.filter((a) => a.direct) },
  { label: '그 밖의 공항 (경유)', list: AIRPORTS.filter((a) => !a.direct) },
];

/**
 * 이 공항으로 들어왔을 때 실제로 첫 도시가 될 곳.
 *
 * 공항이 서비스하는 도시가 이번 여행에 들어 있으면 그 도시다. 마드리드로
 * 들어오는데 안달루시아만 도는 사람처럼 어긋나는 경우가 있어서, 그럴 때는
 * 이번 여행 도시 중 공항에서 가장 가까운 곳으로 잡는다. 공항에서 먼 도시로
 * 먼저 보내면 첫날에 나라를 가로지르는 이동이 붙는다.
 */
export function cityForAirport(
  airport: Airport | undefined,
  tripCities: { slug: string; lat: number; lon: number }[],
): { slug: string; transferKm: number } | null {
  if (!airport || tripCities.length === 0) return null;
  const direct = tripCities.find((c) => c.slug === airport.city);
  if (direct) return { slug: direct.slug, transferKm: 0 };

  let best = tripCities[0];
  let bestKm = Infinity;
  for (const c of tripCities) {
    const km = haversineKm(airport, c);
    if (km < bestKm) { bestKm = km; best = c; }
  }
  return { slug: best.slug, transferKm: Math.round(bestKm) };
}

/** 대권 거리(km). geo.ts 와 같은 식이지만 여기는 Item 이 아니라 좌표만 받는다. */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
