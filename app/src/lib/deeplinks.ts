import type { City, Item } from '../types';

/**
 * 지도·예약 정보는 저장하지 않고 링크로 넘긴다.
 * Google Maps Platform 약관은 장소 이름·평점·영업시간의 사전 수집과 저장을
 * 금지하지만, 지도 앱을 여는 URL 은 제한이 없다. 실시간 평점과 영업시간은
 * 사용자가 링크를 눌러 구글 지도에서 직접 보게 한다.
 */
const q = (s: string) => encodeURIComponent(s);

function searchTerm(item: Item, city: City | undefined): string {
  const local = item.nameLocal ?? item.nameEn;
  return `${local} ${city?.nameEn ?? ''}`.trim();
}

/** 지도에서 장소 열기 — 실시간 영업시간·평점·사진 확인용. */
export function mapsPlaceUrl(item: Item, city?: City): string {
  if (item.lat !== null && item.lon !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${q(searchTerm(item, city))}`;
}

/** 대중교통 길찾기 — 이전 일정에서 다음 일정으로. */
export function directionsUrl(from: Item | null, to: Item, city?: City, mode = 'transit'): string {
  const dest = to.lat !== null && to.lon !== null ? `${to.lat},${to.lon}` : searchTerm(to, city);
  const params = new URLSearchParams({ api: '1', destination: dest, travelmode: mode });
  if (from) {
    params.set('origin', from.lat !== null && from.lon !== null ? `${from.lat},${from.lon}` : searchTerm(from, city));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface BookingLink { label: string; url: string; note: string }

/** 예약 경로. 테마에 따라 쓸모 있는 채널이 다르다. */
export function bookingLinks(item: Item, city?: City): BookingLink[] {
  const term = searchTerm(item, city);
  const links: BookingLink[] = [];

  if (item.url) {
    links.push({ label: '공식 홈페이지', url: item.url, note: '가장 정확한 요금과 휴관일. 공식 예매가 있으면 여기가 가장 저렴합니다.' });
  }

  if (item.theme === 'food' || item.theme === 'nightlife') {
    links.push(
      { label: '구글에서 예약 확인', url: `https://www.google.com/search?q=${q(`${term} reservas`)}`, note: '스페인 인기 식당은 예약이 필수인 곳이 많습니다.' },
      { label: 'TheFork', url: `https://www.thefork.com/search?cityName=${q(city?.nameEn ?? '')}&searchText=${q(item.nameEn)}`, note: '유럽에서 가장 널리 쓰이는 식당 예약 앱. 할인 좌석이 자주 나옵니다.' },
    );
  } else {
    links.push(
      { label: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${q(term)}`, note: '입장권·가이드 투어. 성수기에는 현장 대기줄을 크게 줄여 줍니다.' },
      { label: 'Klook', url: `https://www.klook.com/search/?query=${q(term)}`, note: '한국어 지원. 결제와 취소가 편합니다.' },
    );
  }

  links.push({ label: '최신 후기 검색', url: `https://www.google.com/search?q=${q(`${term} 후기`)}`, note: '휴관일 변경이나 공사 여부를 출발 전에 한 번 확인하세요.' });
  return links;
}

/** 도시 간 이동 — 근교 당일치기와 도시 이동에 쓴다. */
export function intercityLinks(fromCity: City, toCity: City): BookingLink[] {
  const pair = `${fromCity.nameEn} to ${toCity.nameEn}`;
  return [
    { label: 'Renfe (스페인 철도)', url: `https://www.renfe.com/es/en`, note: 'AVE 고속열차는 90일 전부터 예매하면 가장 쌉니다.' },
    { label: 'Omio 통합 검색', url: `https://www.omio.com/search?departure=${q(fromCity.nameEn)}&arrival=${q(toCity.nameEn)}`, note: '기차·버스·항공을 한 번에 비교합니다.' },
    { label: 'ALSA (버스)', url: `https://www.alsa.com/en/web/bus/home`, note: '기차가 없는 소도시는 버스가 유일한 경우가 많습니다.' },
    { label: '구글 지도 경로', url: `https://www.google.com/maps/dir/?api=1&origin=${q(fromCity.nameEn)}&destination=${q(toCity.nameEn)}&travelmode=transit`, note: `${pair} 실제 소요 시간과 환승을 확인하세요.` },
  ];
}

/**
 * 아이템 대표 사진 주소.
 *
 * 대표급은 앱에 함께 들어 있어 오프라인에서도 뜬다. 나머지는 커먼즈에서
 * 그때그때 받아오므로 망이 없으면 안 뜬다 — 부르는 쪽에서 실패를 감안해야 한다.
 */
export function photoUrl(item: Item): string | null {
  if (!item.photo) return null;
  if (item.photo.bundled) return `${import.meta.env.BASE_URL}item/${item.id}.jpg`;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${q(item.photo.file)}?width=400`;
}

/** 사진 출처 — CC BY-SA 표기 의무상 저작자·라이선스와 함께 걸어야 한다. */
export function photoSourceUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${q(file)}`;
}

/**
 * 블로그 후기 검색.
 *
 * 후기 본문은 저장하지 않는다. 블로그 글에는 저작권이 있고 포털 약관은
 * 수집을 금지하므로, 요약본을 만들어 앱에 담는 것은 불가능하다.
 * 대신 구글 지도와 같은 방식으로 검색 결과에 넘긴다 — 저장하지 않으므로
 * 걸리는 것이 없고, 오래된 요약본보다 최신 후기가 낫다.
 */
export function blogSearchUrl(item: Item, city?: City): string {
  // 괄호 부연은 검색어로 쓰면 오히려 결과를 좁힌다.
  // '메스키타(코르도바 대성당)' → '메스키타'. 도시명은 앞에 따로 붙는다.
  const name = item.name.replace(/[(（].*$/, '').trim() || item.name;
  const term = `${city?.name ?? ''} ${name}`.trim();
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${q(term)}`;
}
