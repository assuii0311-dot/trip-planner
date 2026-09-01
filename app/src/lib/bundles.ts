import type { Item } from '../types';

/**
 * 함께 묶어 보는 것이 이득인 아이템 묶음.
 *
 * ## 왜 필요한가
 *
 * 아이템을 낱개로만 보여 주면, 실제로는 한 장의 표로 묶이거나 같은 건축가의
 * 연작이라 함께 봐야 뜻이 통하는 것들이 흩어진다. 바르셀로나에서 구엘 공원만
 * 담고 구엘 저택을 빼면, 가우디가 한 후원자를 위해 한 일을 반쪽만 보게 된다.
 * 마드리드에서 프라도만 담으면 세 미술관 통합권(€32)이 낱장 합계(€40)보다
 * 싸다는 것을 알 길이 없다.
 *
 * ## 무엇을 근거로 하나
 *
 * 지어내지 않는다. 두 가지만 넣었다.
 *
 *  - **실제로 파는 통합권** — 데이터의 설명이 이미 그렇게 적고 있는 것들이다
 *    ("히브랄파로 성과 묶은 통합권이 쌉니다", "보통 알함브라 통합권에
 *    포함됩니다", "카우 페라트와 운영 시간이 같습니다. 통합권을 사면 쌉니다").
 *  - **한 자리에 붙어 있어 나눌 이유가 없는 것** — 세비야 대성당과 히랄다는
 *    같은 표로 들어가는 한 건물이다.
 *
 * 값은 바뀐다. 그래서 금액은 '대략' 으로만 적고, 확인은 공식 홈페이지로
 * 넘긴다 — 다른 요금 정보와 같은 원칙이다.
 */

export interface Bundle {
  id: string;
  city: string;
  title: string;
  /** 왜 묶는가. 화면에 그대로 보여 준다. */
  why: string;
  /** 묶음에 드는 아이템 id. 데이터에 없는 id 는 조립할 때 걸러진다. */
  itemIds: string[];
  /** 통합권 값(유로). 없으면 표가 따로인 '함께 보기' 묶음이다. */
  passEur?: number;
  /** 통합권 이름. 예매할 때 검색어가 된다. */
  passName?: string;
}

export const BUNDLES: Bundle[] = [
  {
    id: 'madrid-paseo-del-arte',
    city: 'madrid',
    title: '프라도 · 레이나 소피아 · 티센',
    why: '세 미술관을 잇는 거리를 스페인 사람들은 "예술의 산책로" 라고 부릅니다. '
      + '통합권 한 장이면 낱장으로 사는 것보다 쌉니다. 세 곳 모두 저녁 무렵 무료 시간대가 있으나 줄이 깁니다.',
    itemIds: [
      'madrid-museo-del-prado',
      'madrid-museo-nacional-centro-de-arte-reina-sofia',
      'madrid-museo-thyssen-bornemisza',
    ],
    passEur: 32,
    passName: 'Paseo del Arte',
  },
  {
    id: 'barcelona-guell',
    city: 'barcelona',
    title: '구엘 공원 · 구엘 저택',
    why: '둘 다 가우디가 후원자 에우세비 구엘을 위해 지었습니다. '
      + '저택(1888)에서 공원(1914)으로 26년 사이 가우디가 어떻게 변했는지가 한눈에 보입니다. '
      + '표는 따로지만 같은 날 묶어 보면 두 건물이 이어집니다.',
    itemIds: ['barcelona-palau-guell', 'barcelona-park-guell'],
  },
  {
    id: 'barcelona-modernisme',
    city: 'barcelona',
    title: '카사 바트요 · 카사 밀라',
    why: '그라시아 거리에 두 블록 간격으로 서 있는 가우디의 집 두 채입니다. '
      + '걸어서 5분이라 따로 다닐 이유가 없고, 오디오 가이드가 서로를 계속 언급합니다.',
    itemIds: ['barcelona-casa-batllo', 'barcelona-la-pedrera'],
  },
  {
    id: 'granada-alhambra',
    city: 'granada',
    title: '알함브라 · 헤네랄리페',
    why: '헤네랄리페는 알함브라 통합권에 보통 포함됩니다. 따로 살 필요가 없는지 확인하세요. '
      + '나스르 궁전은 시간 지정 입장이라, 정원(헤네랄리페)을 앞뒤로 붙이는 것이 동선상 자연스럽습니다.',
    itemIds: ['granada-wd-alhambra', 'granada-wd-generalife'],
    passName: 'Alhambra General',
  },
  {
    id: 'granada-royal',
    city: 'granada',
    title: '대성당 · 왕실 예배당',
    why: '가톨릭 양왕이 묻힌 예배당과 그 옆에 잇대어 지은 대성당입니다. '
      + '입구가 다르고 표도 따로지만 벽 하나를 사이에 두고 있어, 한쪽만 보면 나머지가 계속 궁금해집니다.',
    itemIds: ['granada-royal-chapel', 'granada-cathedral-of-granada'],
  },
  {
    id: 'malaga-alcazaba-gibralfaro',
    city: 'malaga',
    title: '알카사바 · 히브랄파로 성 · 로마 극장',
    why: '언덕 하나에 로마 극장, 이슬람 요새, 성이 층층이 쌓여 있습니다. '
      + '알카사바와 히브랄파로는 묶은 통합권이 싸고, 로마 극장은 무료로 발치에 있습니다. '
      + '오르막이 이어지니 한 번에 올라가는 편이 낫습니다.',
    itemIds: ['malaga-roman-theater', 'malaga-alcazaba', 'malaga-castillo-de-gibralfaro'],
    passEur: 6,
    passName: 'Alcazaba + Gibralfaro',
  },
  {
    id: 'seville-cathedral',
    city: 'seville',
    title: '세비야 대성당 · 히랄다',
    why: '히랄다는 대성당의 종탑입니다. 같은 표로 올라가므로 따로 담을 이유가 없습니다. '
      + '계단이 아니라 경사로라 짐이 있어도 오를 수 있습니다.',
    itemIds: ['seville-cathedral', 'seville-wd-giralda'],
  },
  {
    id: 'toledo-synagogues',
    city: 'toledo',
    title: '톨레도 유대인 지구 — 두 시나고그와 수도원',
    why: '톨레도 서쪽 언덕에 산타 마리아 라 블랑카, 엘 트란시토, 산 후안 데 로스 레예스가 '
      + '걸어서 5분 안에 모여 있습니다. 여러 곳을 묶는 팔찌형 통합권(Pulsera Turística)이 있어 '
      + '낱장보다 쌉니다.',
    itemIds: [
      'toledo-synagogue-of-santa-maria-la-blanca',
      'toledo-synagogue-of-el-transito',
      'toledo-monastery-of-san-juan-de-los-reyes',
    ],
    passName: 'Pulsera Turística',
  },
  {
    id: 'sitges-museums',
    city: 'sitges',
    title: '카우 페라트 · 마리셀 미술관',
    why: '바다에 면한 두 집이 벽을 맞대고 있습니다. 운영 시간이 같고 통합권을 사면 싸다고 '
      + '데이터에도 적혀 있습니다.',
    itemIds: ['sitges-cau-ferrat-museum', 'sitges-maricel-museum'],
  },
];

export interface ResolvedBundle extends Bundle {
  items: Item[];
  /** 낱장 요금 합계. 통합권과 비교해 보여 준다. 모르는 값이 있으면 null. */
  singleEur: number | null;
}

/**
 * 이 도시에서 제안할 묶음.
 *
 * 아이템이 두 개 미만 남으면 묶음이 아니므로 내놓지 않는다. 데이터가 바뀌어
 * id 가 사라져도 조용히 빠지고 화면이 깨지지 않는다.
 */
export function bundlesFor(citySlug: string, cityItems: Item[]): ResolvedBundle[] {
  const byId = new Map(cityItems.map((i) => [i.id, i]));
  const out: ResolvedBundle[] = [];
  for (const b of BUNDLES) {
    if (b.city !== citySlug) continue;
    const items = b.itemIds.map((id) => byId.get(id)).filter((i): i is Item => !!i);
    if (items.length < 2) continue;
    const prices = items.map((i) => i.priceEur);
    const singleEur = prices.every((p) => p !== null)
      ? (prices as number[]).reduce((a, p) => a + p, 0)
      : null;
    out.push({ ...b, items, singleEur });
  }
  return out;
}
