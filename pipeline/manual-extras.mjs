/**
 * 손으로 적은 본토·섬의 장소 — 수집기가 놓치는 종류.
 *
 * ## 왜 필요한가
 *
 * 등록부가 도시마다 꼽아 둔 대표 180개 중 **31개가 데이터에 없었다.**
 * 11개는 이름만 달라 등록부를 고쳐 맞췄고, 남은 20개는 정말 없었다.
 * 없는 것들을 늘어놓으면 종류가 한눈에 보인다 —
 *
 *   유대인 지구 · 알바이신 골목 · 칼레 라우렐 · 시드라 거리 ·
 *   유럽의 발코니 · 핀초스 골목 · 해변 산책로 · 카프 데 크레우스
 *
 * **거리 · 지구 · 산책로 · 곶.** 위키보이지 목록은 '건물 하나' 단위라
 * 이런 것을 담지 않는다. 그런데 여행자가 실제로 하루를 쓰는 곳은 자주
 * 이쪽이다. 순위 3단계에서 본 '무료로 열려 있는 공간' 과 같은 종류다.
 *
 * ## 규칙
 *
 * - **좌표와 위키데이터 id 는 지어내지 않는다.** 위키데이터에서 받아
 *   확인한 것만 넣었다. 확인 못 한 것은 뺀다 — 온다리비아 구시가는
 *   `Parte Vieja (Fuenterrabía)` 로 확인됐고, 시체스 산책로는 별도 항목이
 *   없어 그 앞 해변(`Platja de la Ribera`)으로 잡았다.
 * - **언어판 수(`sitelinks`)는 여기 적지 않는다.** `popularity` 는 어림값이고,
 *   `repopulate-popularity.mjs` 가 id 로 실제 값을 받아 채운다.
 * - 이름은 등록부의 `highlights` 와 글자로 맞아야 한다. 괄호 뒤는 비교에서
 *   잘리므로(`rank.ts` 의 `norm`) `유리 발코니 해안가(마리냐 거리)` 처럼
 *   적으면 등록부의 `유리 발코니 해안가` 와 이어진다.
 *
 *   node pipeline/apply-manual.mjs
 */

const free = (min) => ({ booking: null, closed: null, busy: null, duration: min, price: '무료', hours: null });

export const MANUAL_EXTRAS = [
  /* ── 카탈루냐 ────────────────────────────────────────────── */
  {
    id: 'girona-call-jueu', wikidata: 'Q11910916', lat: 41.98611, lon: 2.82556,
    name: '유대인 지구', nameEn: 'Jewish Quarter of Girona', city: 'girona',
    theme: 'history', durationMin: 60, priceEur: 0, energy: 2, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['구시가', '골목', '유대'],
    summary: '유럽에서 가장 잘 남은 중세 유대인 거주지',
    why: '12~15세기 유대인 공동체가 살던 좁은 돌골목이 거의 그대로 남았습니다. 계단과 아치가 이어져 길 자체가 볼거리이고, 안쪽의 유대 역사 박물관까지 함께 보면 한 시간쯤 걸립니다.',
    practical: free('약 1시간'), caution: null,
  },
  {
    id: 'sitges-platja-ribera', wikidata: 'Q125606826', lat: 41.23425, lon: 1.80707,
    name: '리베라 해변 산책로', nameEn: 'Platja de la Ribera', city: 'sitges',
    theme: 'nature', durationMin: 45, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon', 'evening'], indoor: false,
    tags: ['해변', '산책로'],
    summary: '마을 앞 백사장과 그 앞을 지나는 산책로',
    why: '시체스의 얼굴인 해변입니다. 산 바르토메우 성당 아래에서 서쪽으로 백사장이 이어지고, 그 앞을 따라 난 산책로가 마을 끝까지 닿아 해질 무렵 걷기 좋습니다.',
    practical: free('약 45분'), caution: null,
  },
  {
    id: 'cadaques-cap-de-creus', wikidata: 'Q1034193', lat: 42.31917, lon: 3.32194,
    name: '카프 데 크레우스 해안(곶)', nameEn: 'Cap de Creus', city: 'cadaques',
    theme: 'nature', durationMin: 150, priceEur: 0, energy: 3, popularity: 4,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['곶', '해안', '자연공원'],
    summary: '이베리아반도의 동쪽 끝. 바람에 깎인 편암 해안',
    why: '반도에서 가장 동쪽에 있는 곶입니다. 바람에 깎인 편암이 바다로 무너지듯 이어지고 등대까지 길이 나 있습니다. 달리가 되풀이해 그린 풍경이고, 카다케스에서 차로 20분입니다.',
    practical: { booking: null, closed: null, busy: null, duration: '약 2시간 30분', price: '무료', hours: null },
    caution: '트라문타나 바람이 강한 날은 절벽 가까이 가지 않는 편이 좋습니다.',
  },

  /* ── 안달루시아 ───────────────────────────────────────────── */
  {
    id: 'cordoba-juderia', wikidata: 'Q9016261', lat: 37.87899, lon: -4.78170,
    name: '유대인 지구', nameEn: 'Jewish Quarter of Córdoba', city: 'cordoba',
    theme: 'history', durationMin: 60, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['구시가', '골목', '파티오'],
    summary: '메스키타 옆 흰 골목. 시나고그와 파티오가 이 안에',
    why: '메스키타 북서쪽의 좁은 흰 골목입니다. 스페인에 셋만 남은 중세 시나고그와 꽃으로 덮인 파티오가 이 안에 있어, 목적지 없이 걸어 다니는 것 자체가 일정이 됩니다.',
    practical: free('약 1시간'), caution: null,
  },
  {
    id: 'jerez-tio-pepe', wikidata: 'Q97616470', lat: 36.68030, lon: -6.14257,
    name: '티오 페페 보데가', nameEn: 'Bodegas Tío Pepe', city: 'jerez',
    theme: 'activity', durationMin: 90, priceEur: 25, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: true,
    tags: ['셰리', '와이너리', '시음'],
    summary: '알카사르 옆 도심의 셰리 양조장. 창고 견학과 시음',
    why: '헤레스를 셰리의 이름으로 만든 양조장입니다. 알카사르 바로 옆이라 걸어서 가고, 통이 층층이 쌓인 지하 창고를 돌고 서너 가지를 맛보는 투어가 하루에 여러 번 있습니다.',
    practical: { booking: '투어는 자리를 미리 잡아 두는 편이 낫습니다', closed: null, busy: null, duration: '약 1시간 30분', price: '€25 안팎', hours: null },
    caution: null,
  },
  {
    id: 'granada-albaicin', wikidata: 'Q576339', lat: 37.18170, lon: -3.59830,
    name: '알바이신 골목', nameEn: 'Albaicín', city: 'granada',
    theme: 'history', durationMin: 120, priceEur: 0, energy: 3, popularity: 4,
    bestSlots: ['morning', 'afternoon', 'evening'], indoor: false,
    tags: ['구시가', '골목', '전망', '유네스코'],
    summary: '알함브라 맞은편 언덕의 옛 이슬람 거주지',
    why: '알함브라와 함께 유네스코에 올라 있는 언덕 동네입니다. 좁은 흰 골목이 계단처럼 오르고, 위로 갈수록 알함브라와 그 뒤 설산이 한꺼번에 보입니다.',
    practical: free('약 2시간'),
    caution: '길이 가파르고 돌이 고르지 않습니다. 편한 신발이 필요합니다.',
  },
  {
    id: 'nerja-balcon-de-europa', wikidata: 'Q43159474', lat: 36.74417, lon: -3.87541,
    name: '유럽의 발코니', nameEn: 'Balcón de Europa', city: 'nerja',
    theme: 'landmark', durationMin: 30, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon', 'evening'], indoor: false,
    tags: ['전망대', '해안'],
    summary: '바다로 튀어나온 옛 요새 자리의 전망대',
    why: '마을 앞바다로 튀어나온 옛 요새 자리에 만든 전망대입니다. 양옆으로 절벽과 작은 해변이 갈라져 보이고, 네르하의 모든 길이 결국 여기로 모입니다.',
    practical: free('약 30분'), caution: null,
  },

  /* ── 발렌시아 ────────────────────────────────────────────── */
  {
    id: 'albufera-lagoon', wikidata: 'Q84165268', lat: 39.33167, lon: -0.35222,
    name: '알부페라 석호', nameEn: 'Albufera of Valencia', city: 'albufera',
    theme: 'nature', durationMin: 90, priceEur: 0, energy: 1, popularity: 3,
    bestSlots: ['afternoon', 'evening'], indoor: false,
    tags: ['석호', '철새', '일몰'],
    summary: '스페인에서 가장 큰 담수 석호. 해질 무렵이 좋다',
    why: '논과 갈대밭에 둘러싸인 스페인 최대의 담수 석호입니다. 파에야가 태어난 자리이고, 해질 무렵 배로 나가면 물 위로 해가 떨어지는 것을 정면에서 봅니다.',
    practical: { booking: null, closed: null, busy: null, duration: '약 1시간 30분', price: '무료 (유람선은 1인 €5 안팎)', hours: null },
    caution: null,
  },
  {
    id: 'alicante-explanada', wikidata: 'Q4889350', lat: 38.34335, lon: -0.48325,
    name: '에스플라나다 산책로', nameEn: 'Paseo de la Explanada de España', city: 'alicante',
    theme: 'landmark', durationMin: 40, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['afternoon', 'evening'], indoor: false,
    tags: ['산책로', '야자수', '저녁'],
    summary: '대리석 650만 조각을 물결무늬로 깐 항구 앞 산책로',
    why: '붉은·검은·흰 대리석 650만 조각을 물결 무늬로 깐 항구 앞 산책로입니다. 야자수가 네 줄로 서 있고, 저녁이면 노점과 사람이 이 도시에서 가장 많이 모입니다.',
    practical: free('약 40분'), caution: null,
  },

  /* ── 바스크·나바라·리오하 ──────────────────────────────────── */
  {
    id: 'san-sebastian-parte-vieja', wikidata: 'Q2265048', lat: 43.32333, lon: -1.98500,
    name: '구시가 핀초스 골목', nameEn: 'Parte Zaharra', city: 'san-sebastian',
    theme: 'landmark', durationMin: 120, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['evening', 'night'], indoor: false,
    tags: ['구시가', '핀초', '골목'],
    summary: '바다와 우르굴 산 사이의 옛 시가. 골목마다 바',
    why: '바다와 우르굴 산 사이에 낀 옛 시가입니다. 좁은 골목마다 바가 붙어 있고, 한 집에서 한두 개씩 집어 먹고 다음 집으로 옮기는 것이 이 도시의 저녁 방식입니다.',
    practical: { booking: null, closed: null, busy: '20시 전후가 가장 붐빕니다', duration: '약 2시간', price: '핀초 하나 €3 안팎', hours: null },
    caution: null,
  },
  {
    id: 'hondarribia-parte-vieja', wikidata: 'Q12253121', lat: 43.36306, lon: -1.79194,
    name: '구시가 목조 발코니', nameEn: 'Parte Vieja (Hondarribia)', city: 'hondarribia',
    theme: 'history', durationMin: 60, priceEur: 0, energy: 2, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['구시가', '성벽', '발코니'],
    summary: '성벽 안 비탈길. 색칠한 목조 발코니가 줄지어 있다',
    why: '성벽에 둘러싸인 비탈 골목입니다. 집집마다 붉고 푸르게 칠한 목조 발코니를 내달아 놓아, 좁은 길 위로 색이 겹쳐 보이는 것이 이 마을의 얼굴입니다.',
    practical: free('약 1시간'), caution: null,
  },

  /* ── 갈리시아·아스투리아스 ──────────────────────────────────── */
  {
    id: 'a-coruna-avenida-marina', wikidata: 'Q61379849', lat: 43.36967, lon: -8.39952,
    name: '유리 발코니 해안가(마리냐 거리)', nameEn: 'Avenida da Mariña', city: 'a-coruna',
    theme: 'landmark', durationMin: 40, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon', 'evening'], indoor: false,
    tags: ['해안', '갈레리아', '산책로'],
    summary: '항구를 향해 유리 갈레리아가 줄지어 선 거리',
    why: '항구를 마주 본 건물마다 하얀 유리 발코니(갈레리아)를 층층이 달아, 해가 비치면 벽 전체가 빛납니다. 라코루냐를 \'유리의 도시\'라 부르게 한 자리입니다.',
    practical: free('약 40분'), caution: null,
  },
  {
    id: 'vigo-calle-ostras', wikidata: 'Q135326007', lat: 42.23999, lon: -8.72812,
    name: '오스트라스 굴 골목', nameEn: 'Rúa das Ostras', city: 'vigo',
    theme: 'shopping', durationMin: 45, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['굴', '시장', '골목'],
    summary: '아주머니들이 길에서 굴을 까 파는 짧은 골목',
    why: '구시가의 짧은 골목에서 아주머니들이 좌판을 놓고 굴을 그 자리에서 까 줍니다. 옆 바에 들고 들어가 화이트 와인과 먹는 것이 비고 사람들의 방식입니다.',
    practical: { booking: null, closed: null, busy: null, duration: '약 45분', price: '한 다스 €12 안팎', hours: null },
    caution: null,
  },
  {
    id: 'oviedo-gascona', wikidata: 'Q62106034', lat: 43.36440, lon: -5.84479,
    name: '시드라 거리(가스코나)', nameEn: 'Gascona Street', city: 'oviedo',
    theme: 'nightlife', durationMin: 90, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['evening', 'night'], indoor: false,
    tags: ['시드라', '사과주', '거리'],
    summary: '시드라 전문 식당이 마주 보고 늘어선 거리',
    why: '아스투리아스 사과주 시드라만 파는 집이 양쪽으로 늘어선 200m 거리입니다. 종업원이 병을 머리 위로 들어 잔에 떨어뜨리는 따르기를 저녁 내내 볼 수 있습니다.',
    practical: { booking: null, closed: null, busy: '금·토 저녁이 가장 붐빕니다', duration: '약 1시간 30분', price: '시드라 한 병 €3 안팎', hours: null },
    caution: null,
  },

  /* ── 마요르카 ────────────────────────────────────────────── */
  {
    id: 'soller-tren-de-soller', wikidata: 'Q107137148', lat: 39.76465, lon: 2.71523,
    name: '소예르 목조 열차(역)', nameEn: 'Sóller train station', city: 'soller',
    theme: 'activity', durationMin: 120, priceEur: 25, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['열차', '산길', '역'],
    summary: '1912년부터 다니는 목조 열차. 팔마까지 산을 넘는다',
    why: '1912년에 놓인 협궤 철도를 나무로 만든 옛 객차가 그대로 다닙니다. 팔마까지 한 시간 동안 터널 열세 개로 트라문타나 산줄기를 넘고, 역 건물 안에는 미로와 피카소의 작은 전시가 있습니다.',
    practical: { booking: null, closed: null, busy: null, duration: '약 2시간 (편도 1시간)', price: '팔마까지 편도 €25 안팎', hours: null },
    caution: null,
  },
  {
    id: 'pollenca-calvari', wikidata: 'Q18019877', lat: 39.88027, lon: 3.01198,
    name: '칼바리 365계단(예배당)', nameEn: 'Mount Calvary chapel in Pollença', city: 'pollenca',
    theme: 'landmark', durationMin: 60, priceEur: 0, energy: 3, popularity: 2,
    bestSlots: ['morning', 'evening'], indoor: false,
    tags: ['계단', '전망', '예배당'],
    summary: '측백나무가 늘어선 365계단과 그 끝의 예배당',
    why: '마을에서 언덕 위 예배당까지 돌계단 365개가 곧게 뻗어 있고 양옆으로 측백나무가 섰습니다. 올라서면 포옌사 지붕들과 그 너머 트라문타나가 한눈에 들어옵니다.',
    practical: free('약 1시간'),
    caution: '그늘이 없습니다. 한낮보다 이른 아침이나 해질 무렵이 낫습니다.',
  },
  {
    id: 'pollenca-cap-formentor', wikidata: 'Q1034144', lat: 39.96222, lon: 3.21361,
    name: '포르멘토르 해안(곶)', nameEn: 'Cap de Formentor', city: 'pollenca',
    theme: 'nature', durationMin: 180, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['곶', '해안도로', '등대'],
    summary: '마요르카 북동쪽 끝. 절벽 위 해안도로와 등대',
    why: '섬의 북동쪽 끝으로 이어지는 20km 해안도로입니다. 절벽 위를 굽이돌며 전망대가 몇 번 나오고, 끝의 등대에서는 아래로 200m 낭떠러지와 바다만 남습니다.',
    practical: { booking: null, closed: null, busy: null, duration: '약 3시간', price: '무료', hours: null },
    caution: '여름 성수기에는 낮 시간 자가용 진입이 막히고 버스만 다닙니다.',
  },

  /* ── 테네리페 ────────────────────────────────────────────── */
  {
    id: 'la-laguna-casco-historico', wikidata: 'Q43170656', lat: 28.48993, lon: -16.31643,
    name: '라 라구나 구시가', nameEn: 'Historic centre of San Cristóbal de La Laguna', city: 'la-laguna',
    theme: 'history', durationMin: 90, priceEur: 0, energy: 2, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['구시가', '유네스코', '파티오'],
    summary: '격자로 계획된 최초의 식민도시. 유네스코 세계유산',
    why: '성벽 없이 격자로 그어 세운 최초의 스페인 식민도시로, 이 설계가 중남미 도시들의 본이 되어 유네스코에 올랐습니다. 파스텔로 칠한 저택들이 안뜰을 하나씩 품고 늘어서 있습니다.',
    practical: free('약 1시간 30분'), caution: null,
  },
];

/**
 * 이미 있는데 **잘못 분류된** 항목.
 *
 * 카페 이루냐와 칼레 라우렐은 데이터에 처음부터 있었다. 그런데 위키보이지의
 * 먹는 항목에서 왔다는 이유로 `theme: 'food'` 가 붙었고, 그러면
 * `isMeal()` 이 볼거리에서 통째로 빼 버린다(식사는 코스 분량을 정하지
 * 않는다는 규칙 때문이다). **등록부가 그 도시의 대표로 꼽아 둔 곳인데
 * 순위가 아예 보지 못했다.** '없다' 가 아니라 '안 보인다' 였다.
 *
 * 둘 다 먹으러 가는 곳이 아니라 보러 가는 곳이다 — 하나는 1888년 카페의
 * 실내이고 하나는 바가 늘어선 골목이다. 테마를 고쳐 볼거리로 돌린다.
 * 같은 고침을 `pipeline/ko/spain/` 에도 적어 두어, 다시 수집해도 되살아난다.
 */
export const MANUAL_FIXES = [
  {
    id: 'pamplona-cafe-iruna', city: 'pamplona',
    theme: 'landmark', bestSlots: ['morning', 'afternoon', 'evening'],
    wikidata: 'Q12259802',
    why: '1888년에 문을 연 카스티요 광장의 카페입니다. 기둥과 거울로 꾸민 실내가 그때 모습대로 남아 있고, 헤밍웨이가 앉던 구석이 그대로 표시되어 있습니다.',
  },
  {
    id: 'logrono-calle-laurel', city: 'logrono',
    theme: 'nightlife', bestSlots: ['evening', 'night'],
    wikidata: 'Q5741012',
    why: '50m 남짓한 골목에 바가 예순 곳 넘게 붙어 있고, 집집마다 파는 것이 하나씩입니다 — 버섯 하나, 새우 하나. 한 잔씩 하며 옮겨 다니는 것이 로그로뇨에 오는 이유입니다.',
  },
];
