import type { City, Item } from '../types';

/**
 * 도시와 무관한 전체 순위.
 *
 * ## 왜 필요한가
 *
 * 코스 크기가 '하루에 담을 수 있는 개수 × 일수' 였다. 순위와 무관하게
 * 1일치를 채우는 구조라, 볼 것이 넘치는 마드리드와 반나절이면 충분한
 * 소도시가 같은 규칙으로 잘렸다.
 *
 * 그래서 먼저 모든 아이템에 점수를 매겨 순위를 세우고, 코스는 그 순위를
 * 위에서부터 잘라 만든다. "며칠인가" 가 아니라 "여기까지는 꼭 봐야 하는가"
 * 가 기준이 된다.
 *
 * ## 점수 재료
 *
 * 평점·후기 데이터는 앱에 없다. 그러니 '만족감' 을 직접 재는 척하지 않고,
 * 서로 독립적인 세 가지 대리 지표를 합친다. 하나가 틀려도 나머지가 받친다.
 *
 *  - **명성**: 위키백과 언어판 수. 백과사전적 인지도다. **원값을 쓴다.**
 *
 *    예전에는 5칸 등급(`popularity`)을 썼는데, 그 한 칸(`pop 2`)에 볼거리
 *    1,640곳 중 1,085곳이 들어 있었다. 안에서는 순위가 전혀 갈리지 않아
 *    **사람이 꼽은 대표 60곳 중 26곳이 동전 던지기로 밀렸다.**
 *    실제 언어판 수는 3·4·5·6 으로 갈리는데 등급이 그 차이를 버리고
 *    있었다(`docs/27-what-fame-counts.md`).
 *
 *    이 값이 무엇을 세는지도 한 번 어긋났다 — 수집기가 위키백과가 아닌
 *    sitelink(커먼즈·위키보이지)까지 세어 볼거리의 24%가 한 칸씩 부풀어
 *    있었다. 특히 위키보이지는 이 앱의 원자료라, 자기가 읽은 가이드에
 *    실렸다는 이유로 명성을 얹어 주는 셈이었다.
 *  - **대표 지정**: 도시 데이터의 `highlights` — 사람이 도시마다 꼽아 둔
 *    세 곳이다. 명성과 독립적이라 서로를 검증한다.
 *  - **여행자 검증**: 제대로 정리된 여행지인가. Wikivoyage 등재(여행자가
 *    여행자를 위해 쓴 가이드)와, **사람이 이 곳에 대해 얼마나 할 말이
 *    있었는가**를 본다.
 *
 *    처음에는 실무 정보(영업시간·요금·공식 홈페이지)의 충실도로 쟀는데
 *    틀렸다. 마요르 광장·에스파냐 광장·고딕 지구처럼 **무료로 열려 있는
 *    공간은 영업시간도 요금도 공식 홈페이지도 없다.** 대표 지정 210곳 중
 *    88곳이 그런 이유로 깎였고, 알함브라 궁전이 60위까지 밀렸다.
 *    없는 것이 흠이 아니라 그런 종류일 뿐이므로, 있으면 가산하되 없다고
 *    벌하지 않는 형태로 바꿨다.
 *
 *    그 다음 판은 '한국어 이름이 있는가'와 '실무 정보가 하나라도 있는가'
 *    였는데, 재보니 **92%·89% 가 갖고 있어 사실상 상수**였다. 상수는
 *    순위를 가르지 못한다. 그 둘을 `why` 의 깊이로 갈아 끼웠다.
 *
 * '예매 필요' 는 넣지 않았다. 그것은 수요가 몰린다는 신호이지 그 장소가
 * 좋다는 신호가 아니다. '대표 사진 보유' 도 넣지 않았다 — 그 사진을 고른
 * 기준이 인지도였으므로 명성을 두 번 세는 셈이다.
 */

/** 가중치. 합이 1 이 되게 둔다. 여기 숫자만 고치면 순위가 바뀐다. */
export const RANK_WEIGHTS = {
  fame: 0.40,
  must: 0.30,
  vetted: 0.30,
};

/**
 * '그 일정이 있어야만 가는 곳' 보정.
 *
 * 위키백과 명성은 여행 가치가 아니다. 축구장은 언어판이 수십 개라 명성만
 * 보면 프라도와 나란히 올라오는데, 경기가 없으면 갈 이유가 없다.
 *
 * 다만 이름으로 거르면 틀린다. 산 파우 병원은 이름이 병원이지만 유네스코
 * 모데르니스메 건축이고, 산 페르난도 왕립미술아카데미는 고야가 걸린
 * 미술관이다. 그래서 이름이 아니라 사람이 적어 둔 설명(`why`)에서
 * '그 일정이 있어야 한다' 고 말하는 것만 잡는다.
 */
const OCCASION_ONLY = /경기가 (있는|열리는) 날에만|경기 일정이 (맞|있)|예약제|예약해야|사전 예약이 필요|미리 예약하면|예약하면 볼 수|공연이 있는 날|미사 시간에만/;
/** 강한 보정 — 그날이 아니면 못 본다. */
const OCCASION_FACTOR = 0.45;
/** 약한 보정 — 볼 수는 있으나 관심사가 갈린다(구단 홈구장 등). */
const NICHE_FACTOR = 0.72;

const norm = (s: string) => s.replace(/[(（].*$/, '').replace(/\s+/g, '').toLowerCase();

/** 도시 데이터의 `highlights` 에 이름이 올라 있는가. */
export function isHighlight(item: Item, city: City | undefined): boolean {
  const n = norm(item.name);
  return (city?.highlights ?? []).map(norm).some((h) => h === n || h.includes(n) || n.includes(h));
}

const textOf = (i: Item) => `${i.summary ?? ''} ${i.why ?? ''}`;

function purposeFactor(item: Item, city: City | undefined): number {
  /*
   * 도시가 스스로 대표로 꼽은 곳은 보정하지 않는다.
   *
   * 알함브라는 설명에 '예약제' 라고 적혀 있어 규칙에 걸렸다. 그런데 그건
   * 표가 매진된다는 뜻이지 '그 일정이 있어야 간다' 는 뜻이 아니다. 도시가
   * 대표 세 곳에 꼽은 것을 앱이 뒤집을 이유는 없다.
   */
  if (isHighlight(item, city)) return 1;
  if (OCCASION_ONLY.test(textOf(item))) return OCCASION_FACTOR;
  if (item.theme === 'activity' && /홈구장|구단/.test(textOf(item))) return NICHE_FACTOR;
  return 1;
}

export interface RankParts { fame: number; must: number; vetted: number; purpose: number }

/**
 * 명성의 만점 자리 — 언어판 100개.
 *
 * 로그로 펴서 아래쪽(3개와 6개)이 갈리게 하고, 위쪽은 뭉개지지 않게 한다.
 * 처음에 40개로 뒀더니 **위가 통째로 만점이 됐다** — 사그라다 파밀리아
 * (102) · 알함브라(91) · 프라도(78) · 메스키타(60) · 세비야 대성당(61)이
 * 모두 1.00 이라 열 곳이 동점이었고, 그 위는 `why` 길이 몇 자로 갈렸다
 * (레알 알카사르가 엘체 야자수 숲 뒤로 21위). 100 으로 두면 동점이
 * 사라지고 알함브라 2위 · 세비야 대성당 5위로 제자리를 찾는다.
 *
 * 스페인 데이터의 최대는 136 인데 그것이 산티아고 베르나베우다 —
 * 명성이 여행 가치가 아니라는 것을 그대로 보여 주는 값이라, 최대값에
 * 눈금을 맞추지 않는다. 나라가 바뀌어도 쓰게 **고정된 기준**으로 둔다.
 */
const FAME_TOP = Math.log(101);

/**
 * 언어판 수를 모를 때 명성에 넣는 값. `언어판 2개` 자리다.
 *
 * 스페인 볼거리의 34%가 위키데이터 id 가 없다 — 위키보이지 편집자가
 * 목록에 `wikidata=` 를 안 적어 둔 것들이다. **모르는 것과 없는 것은
 * 다르므로 0 을 주지 않는다.** 등급 시절의 기본값 `pop 2` 와 같은
 * 관대함이다.
 *
 * 좌표로 표본 조사를 해 보니(docs/26 0-2) 이 34%는 실제로 대개 언어판이
 * 한둘이라 이 값도 후한 편이다. 그런데 더 내려도 순위는 안 좋아진다 —
 * 0 으로 두고 재보면 대표를 알아보는 비율이 오히려 섞여 내린다.
 */
const UNKNOWN_FAME = Math.log(3) / FAME_TOP;

/**
 * 사람이 이 곳에 대해 얼마나 할 말이 있었는가.
 *
 * `why` 는 `pipeline/ko/` 에 손으로 쓴 한두 문장이다. 짧은 것을 읽어 보면
 * 글자 수가 아니라 **판정**이 들어 있다 — *"지나며 보는 정도"*,
 * *"남은 것이 많지 않아"*, *"규모는 작습니다"*. 명성이 침묵하는 구간
 * (언어판 두셋 이하, 볼거리의 69%)에서 이것이 거의 유일하게 갈라 준다:
 * 그 구간 안에서 60자 이상인 것의 대표 비율이 9.4%, 미만은 0.6% 였다.
 *
 * **주의 — 이 신호는 정답지와 같은 손이 썼다.** `rank-truth` 의 정답지도
 * 사람이 쓴 `highlights` 라, 그 검사만으로는 이득이 부풀어 보인다.
 * 그래서 딴 손의 잣대(위키데이터 언어판 수를 정답지로)로도 함께 쟀고,
 * 거기서도 나아지는 것을 확인했다(상위25% 44→48%). 다만 폭은 훨씬 작다.
 */
const depthOf = (item: Item) => Math.max(0, Math.min(1, ((item.why ?? '').length - 45) / 55));

/**
 * 이 언어판 수부터는 '어느 경로로 들어왔는가' 를 묻지 않는다.
 *
 * `guide`(위키보이지 등재)는 원래 **수집 경로**다. 위키보이지 목록은
 * 여행 작가가 손으로 고른 것이고, 위키데이터 근접 검색으로 채운 것은
 * 아무도 고르지 않은 것이다 — 그래서 무명 항목을 가릴 때는 쓸모가 있다.
 *
 * 그런데 유명한 곳에서는 아무 말도 하지 못한다. 같은 도시 안에서
 * 언어판 수를 맞춰 놓고 대표 비율을 견줘 보면:
 *
 *   언어판  3~ 7 : 위키보이지 18.5%  ↔  위키데이터 2.5%
 *   언어판  7~18 : 위키보이지 15.0%  ↔  위키데이터 7.8%
 *   언어판 18~   : 위키보이지 30.0%  ↔  위키데이터 26.7%   ← 거의 같다
 *
 * 그 위에서 벌을 주면 **알함브라 궁전이 29위로 밀린다**(언어판 91개인데
 * 위키보이지 목록이 아니라 '대표 명소 확인' 경로로 들어왔다는 이유로).
 * 헤라클레스의 탑이 알함브라와 메스키타보다 위에 서는 순위였다.
 *
 * 18 은 위 표에서 차이가 사라지는 자리다. 이렇게 두면 정답지 성적은
 * 그대로인 채(57/85/3/13) 알함브라가 7위로 돌아오고 도시 값어치 표도
 * 오히려 더 잘 맞는다.
 */
const GUIDE_FREE = 18;

export function rankParts(item: Item, city: City | undefined): RankParts {
  /*
   * 제대로 정리된 여행지인가. 둘 다 '있으면 가산' 이다 —
   * 무료 개방 공간이 영업시간이 없다고 깎이면 안 된다.
   *
   * 예전에는 여기에 '한국어 이름이 있는가'(0.4)와 '실무 정보가 하나라도
   * 있는가'(0.3)가 있었다. 92%·89% 가 갖고 있어 상수나 마찬가지였고,
   * 실제로 그 둘을 없애도 순위 검사가 꿈쩍하지 않았다. 미번역 항목을
   * 거르는 몫도 이제 필요 없다 — 깊이로 바꾼 뒤 기준선을 넘는 미번역
   * 항목은 130곳 중 7곳뿐이고, 그 일곱은 카를로스 5세 궁전·마에스트란사
   * 극장처럼 **이름만 안 옮겨졌을 뿐 진짜 볼거리**다.
   */
  const guide = item.source === 'wikivoyage' || (item.sitelinks ?? 0) >= GUIDE_FREE ? 0.3 : 0;
  const fame = item.sitelinks === null || item.sitelinks === undefined
    ? UNKNOWN_FAME
    : Math.min(1, Math.log(1 + item.sitelinks) / FAME_TOP);
  return {
    fame,
    must: isHighlight(item, city) ? 1 : 0,
    vetted: guide + 0.7 * depthOf(item),
    purpose: purposeFactor(item, city),
  };
}

/** 0~1. 취향과 무관한 절대 점수다 — 2단계 취향은 그 위에 따로 얹힌다. */
export function rankScore(item: Item, city: City | undefined): number {
  const p = rankParts(item, city);
  const base = p.fame * RANK_WEIGHTS.fame + p.must * RANK_WEIGHTS.must + p.vetted * RANK_WEIGHTS.vetted;
  return base * p.purpose;
}

/**
 * 이 점수 아래는 코스에 넣지 않는다.
 *
 * 있다고 다 넣으면 '1일치를 채운다' 로 돌아간다. 값어치가 모자라면 코스를
 * 짧게 내놓는 편이 낫다 — 소도시는 원래 반나절이면 충분하다.
 *
 * **기준선은 점수 설계와 한 몸이다.** 명성을 원값으로 펴고 `vetted` 를
 * 깊이로 바꾸면서 눈금이 통째로 내려갔다. 그래서 예전 보정표를 목표로
 * 두고 0.10~0.70 을 훑어 다시 실측했다(왼쪽이 예전 0.45 에서의 값):
 *
 *   마드리드 10.9 → 10.2 · 바르셀로나 9.6 → 9.5   상한 4일에 걸림
 *   세비야 3.3 → 4.1 · 빌바오 3.5 → 3.2 · 그라나다 3.0 → 3.1
 *   톨레도 2.2 → 2.4 · 코르도바 1.7 → 1.9 · 말라가 1.4 → 1.2
 *   세고비아 0.9 → 0.9 · 론다 0.5 → 0.5 · 네르하 0.4 → 0.4
 *
 * 이 선에서 기준선을 넘는 볼거리는 418곳이다(예전 420곳). 점수가 계단이
 * 아니게 되어 이제 기준선을 조금 움직여도 한 칸이 통째로 넘어오지 않는다 —
 * 예전에는 0.40 한 칸에 520곳이 붙어 있어 0.05 만 내려도 론다가 0.5일에서
 * 4.0일로 튀었다. 지금 가장 큰 덩어리는 154곳(9%)이고, `rank-truth` 가
 * 그 비율을 지킨다.
 *
 * **로그로뇨는 여전히 0 이다.** 이것은 기준선으로 고칠 수 없다 —
 * 볼거리 28곳이 전부 위키데이터 연결이 없고, 등록부가 꼽은 대표 세 곳이
 * 데이터에 아예 없어 `must` 도 안 붙는다(최고점 0.355). 데이터를 채워야
 * 하는 일이라 `rank-truth` 가 그 결손을 세어 둔다.
 */
export const RANK_FLOOR = 0.385;

export interface Ranked { item: Item; score: number; rank: number; must: boolean }

/**
 * 도시 구분 없이 전체를 순위화한다.
 * `rank` 는 1부터. 도시별 순위가 필요하면 걸러 낸 뒤 순서를 그대로 쓴다.
 */
export function rankAll(items: Item[], cities: City[]): Ranked[] {
  const cityOf = new Map(cities.map((c) => [c.slug, c]));
  return items
    .map((item) => {
      const c = cityOf.get(item.city);
      return { item, score: rankScore(item, c), rank: 0, must: isHighlight(item, c) };
    })
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * 이 도시에서 꼭 가야 하는 곳.
 *
 * 두 기준을 함께 본다 — 도시 데이터에 사람이 꼽아 둔 대표(`highlights`)와,
 * 전체 순위에서 이 도시의 상위권. 둘은 재료가 달라 서로를 검증한다.
 * 대표로 지정됐는데 순위가 낮으면(자료가 부실한 소도시 명소) 그래도 넣는다.
 */
export function mustSeeOf(cityItems: Ranked[], topN = 3): Ranked[] {
  const must = cityItems.filter((r) => r.must);
  const top = cityItems.filter((r) => !r.must).slice(0, Math.max(0, topN - must.length));
  return [...must, ...top].sort((a, b) => a.rank - b.rank);
}

/* ─────────────────────────────────────────────────────────────────────
 * 코스 3등급
 * ───────────────────────────────────────────────────────────────────── */

/**
 * 등급별 일수 상한.
 *
 * 비율(상위 25%·45%)로 끊어 봤더니 도시의 값어치가 아니라 도시 안의 비중을
 * 재게 되어, 마드리드 상위 45% 가 5.1일이 나왔다. 사람이 실제로 쓰는 말은
 * "이 도시는 며칠짜리인가" 이므로 일수로 끊는다.
 *
 * 상한일 뿐이다. 기준선을 넘는 곳이 모자라면 상한에 못 미쳐도 거기서
 * 끝낸다 — 억지로 채우지 않는 것이 이 구조의 핵심이다.
 */
export const TIER_MAX_DAYS = { full: 4, normal: 2 };

/** 찍먹은 '이 도시에서 이것만은' 이다. 개수로 끊는다. */
export const TASTE_MAX = 3;

/** 하루에 쓸 수 있는 활동 시간(분)과 아이템 하나가 잡아먹는 시간은 capacity 와 같다. */
const DAY_MIN = 504;
const costOf = (i: Item) => i.durationMin + 18;

export type TierId = 'full' | 'normal' | 'taste';

export interface Tier {
  id: TierId;
  items: Item[];
  days: number;
}

/** 순위대로 담되 일수 상한에서 멈춘다. 한 곳도 못 담는 일은 없다. */
function take(list: Ranked[], maxDays: number): Ranked[] {
  const out: Ranked[] = [];
  let min = 0;
  for (const r of list) {
    const c = costOf(r.item);
    if (out.length && min + c > maxDays * DAY_MIN) break;
    out.push(r);
    min += c;
  }
  return out;
}

/**
 * 한 도시의 세 코스.
 *
 * @param cityRanked 이 도시 아이템을 순위 순으로. 미식은 미리 빼고 넘긴다 —
 *   식사는 동선이 만드는 기회에 배정할 뿐 코스 분량을 정하지 않는다.
 */
export function tiersOf(cityRanked: Ranked[]): Tier[] {
  const pool = cityRanked.filter((r) => r.score >= RANK_FLOOR);
  if (pool.length === 0) return [];

  const full = take(pool, TIER_MAX_DAYS.full);
  const normal = take(full, TIER_MAX_DAYS.normal);

  /*
   * 찍먹은 대표로 지정된 곳을 먼저 넣는다. 순위가 낮아도 넣는 이유는,
   * 자료가 부실한 소도시에서 사람이 꼽아 둔 명소가 점수로는 뒤에 있을 수
   * 있기 때문이다(그라나다 산 니콜라스 전망대: 위키백과 언어판 1개).
   */
  const must = cityRanked.filter((r) => r.must).slice(0, TASTE_MAX);
  const rest = full.filter((r) => !must.includes(r)).slice(0, Math.max(0, TASTE_MAX - must.length));
  const taste = [...must, ...rest].sort((a, b) => a.rank - b.rank);

  const mk = (id: TierId, list: Ranked[]): Tier => ({
    id,
    items: list.map((r) => r.item),
    days: Math.round((list.reduce((a, r) => a + costOf(r.item), 0) / DAY_MIN) * 10) / 10,
  });

  /*
   * 세 등급이 같아질 수 있다 — 값어치가 반나절뿐인 마을은 셋이 모두 같은
   * 목록이 된다. 그때는 같은 것을 세 번 보여 주지 않고 있는 만큼만 내놓는다.
   */
  const out = [mk('full', full)];
  if (normal.length < full.length) out.push(mk('normal', normal));
  if (taste.length < normal.length || (out.length === 1 && taste.length < full.length)) {
    out.push(mk('taste', taste));
  }
  return out;
}
