/**
 * 이 앱이 아는 나라들.
 *
 * ## 왜 나라마다 주소가 다른가
 *
 * 한 주소 안에서 나라를 바꾸면 데이터가 겹친다. 도시 slug 가 부딪히고
 * (`santiago` 는 여러 나라에 있다), 저장해 둔 계획이 서로 섞이고, 캐시에
 * 남은 앞 나라의 데이터를 뒷 나라가 읽는다. 나라를 고르는 순간 프로그램이
 * 갈라지게 하면 그런 일이 아예 생길 수 없다.
 *
 *   /trip-planner/           → 나라 고르는 곳
 *   /trip-planner/spain/     → 스페인 계획
 *   /trip-planner/japan/     → 일본 계획
 *
 * 주소가 다르면 저장분도, 홈 화면에 추가한 아이콘도, 서비스 워커 캐시도
 * 따로 간다. 스페인 계획을 짜다 일본을 열어도 서로를 건드리지 않는다.
 *
 * ## 나라를 하나 더 붙이려면
 *
 * 여기에 한 줄 넣고, `public/data/<slug>/` 에 데이터를 두면 된다.
 * 자세한 것은 `docs/23-adding-a-country.md`.
 */

export interface CountryDef {
  /** 주소와 데이터 폴더 이름. `/trip-planner/<slug>/`, `public/data/<slug>/`. */
  slug: string;
  name: string;
  nameEn: string;
  /** 카드에 크게 놓는 국기. */
  flag: string;
  /** 한 줄 소개. 카드 제목 아래. */
  tagline: string;
  /** 이 나라를 고르면 무엇을 얻는지. 두세 줄. */
  blurb: string;
  /** 준비된 것들 — 카드에 작게 적는다. 없는 것을 적지 않는다. */
  highlights: string[];
  /** 'ready' 면 들어갈 수 있고, 'soon' 이면 아직 데이터가 없다. */
  status: 'ready' | 'soon';
  /** 아직이라면 무엇이 남았는지. 정직하게 적는다. */
  soonNote?: string;
  /** 카드 색. CSS 변수로 넘긴다. */
  accent: string;
}

export const COUNTRIES: CountryDef[] = [
  {
    slug: 'spain',
    name: '스페인',
    nameEn: 'Spain',
    flag: '🇪🇸',
    tagline: '본토 · 발레아레스 · 카나리아',
    blurb: '도시를 고르면 어디서 잘지, 어디를 당일치기로 다녀올지 앱이 묶어 줍니다. 열차는 Renfe 공개 시간표를 그대로 씁니다.',
    highlights: ['도시 60곳', 'Renfe 실제 시간표', '섬 포함'],
    status: 'ready',
    accent: '#b5452b',
  },
  {
    slug: 'japan',
    name: '일본',
    nameEn: 'Japan',
    flag: '🇯🇵',
    tagline: '혼슈 · 간사이 · 규슈 · 홋카이도',
    blurb: '스페인과 같은 엔진으로 돕니다. 지금은 도시와 볼거리 데이터를 모으는 중입니다.',
    highlights: ['데이터 수집 중'],
    status: 'soon',
    soonNote: '도시 목록과 볼거리를 모으고 있습니다. 준비되면 이 카드가 열립니다.',
    accent: '#7a3b6b',
  },
];

export const countryOf = (slug: string | null): CountryDef | null =>
  COUNTRIES.find((c) => c.slug === slug) ?? null;

/** 지금 들어갈 수 있는 나라들. */
export const readyCountries = (): CountryDef[] => COUNTRIES.filter((c) => c.status === 'ready');
