/**
 * 섬에서 도시 밖에 있는 대표 명소.
 *
 * ## 왜 필요한가
 *
 * 아이템 수집이 '도시' 단위였다. 마요르카는 팔마·소예르·포옌사 세 곳만
 * 모았는데, 그 섬에서 가장 많이 찾는 곳들은 다른 자치시에 있다 —
 * 발데모사(쇼팽의 수도원), 데이아, 드라크 동굴, 에스 트렌크 해변,
 * 세라 데 트라문타나(유네스코). 전부 데이터에 아예 없었다.
 *
 * 섬 여행은 도시를 옮겨 다니는 것이 아니라 섬 하나를 거점 삼아 해안과
 * 산을 도는 것이라, 이것들이 빠지면 섬 일정이 성립하지 않는다.
 *
 * ## 어떻게 채우나
 *
 * 좌표와 위키데이터 id 는 지어내면 안 되므로 Wikidata 에서 받아 검증했다
 * (`node pipeline/verify-extras.mjs` 로 다시 확인할 수 있다). 설명은 사람이
 * 쓴다 — 다른 manual 항목과 같은 방식이다.
 *
 * 마스카(Masca) 는 Wikidata 항목을 확정하지 못해 넣지 않았다. 확인하지 못한
 * 좌표를 넣느니 빠뜨리는 편이 낫다.
 *
 * 어느 도시에 붙일지는 '그 섬에서 어느 거점에서 가는가' 로 정했다.
 */

export const ISLAND_EXTRAS = [
  // ── 마요르카 ────────────────────────────────────────────
  {
    id: 'mallorca-valldemossa', wikidata: 'Q24019232',
    lat: 39.71042, lon: 2.6223,
    name: '발데모사', nameEn: 'Valldemossa', city: 'palma',
    theme: 'history', durationMin: 150, priceEur: 12, energy: 2, popularity: 4,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['마을', '수도원', '트라문타나'],
    summary: '쇼팽과 조르주 상드가 겨울을 난 산속 수도원 마을',
    why: '쇼팽이 1838년 겨울을 보내며 전주곡을 쓴 카르투하 수도원이 있습니다. 돌집이 이어진 골목과 계단이 그대로 남아 있고, 팔마에서 트라문타나 산길로 30분이면 닿아 반나절 코스로 가장 많이 다녀오는 곳입니다.',
    practical: { duration: '약 2시간 30분', price: '수도원 €12', booking: null, closed: null, busy: '오전 단체 관광이 몰립니다. 이른 아침이나 15시 이후가 한산합니다.', hours: null },
    caution: null,
  },
  {
    id: 'mallorca-deia', wikidata: 'Q233337',
    lat: 39.75, lon: 2.63306,
    name: '데이아', nameEn: 'Deià', city: 'soller',
    theme: 'landmark', durationMin: 90, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon', 'evening'], indoor: false,
    tags: ['마을', '절벽', '트라문타나'],
    summary: '절벽에 매달린 돌마을. 로버트 그레이브스가 살던 곳',
    why: '트라문타나 산이 바다로 떨어지는 자리에 돌집이 층층이 붙어 있습니다. 시인 로버트 그레이브스가 여생을 보낸 집이 남아 있고, 마을에서 칼라 데이아까지 걸어 내려가면 자갈 만이 나옵니다.',
    practical: { duration: '약 1시간 30분', price: '무료', booking: null, closed: null, busy: null, hours: null },
    caution: '마을 안 주차가 매우 좁습니다. 소예르에서 버스로 가는 편이 편합니다.',
  },
  {
    id: 'mallorca-coves-del-drac', wikidata: 'Q429431',
    lat: 39.53574, lon: 3.33062,
    name: '드라크 동굴', nameEn: 'Coves del Drac', city: 'palma',
    theme: 'nature', durationMin: 90, priceEur: 17, energy: 2, popularity: 4,
    bestSlots: ['morning', 'afternoon'], indoor: true,
    tags: ['동굴', '지하호수'],
    summary: '지하 호수 위에서 클래식 연주를 듣는 종유동',
    why: '마요르카에서 가장 많이 찾는 자연 명소입니다. 종유석 사이를 걸어 내려가면 유럽에서 손꼽히게 큰 지하 호수가 나오고, 배 위의 연주자들이 어둠 속에서 연주한 뒤 원하면 배를 타고 건널 수 있습니다.',
    practical: { duration: '약 1시간 30분', price: '€17', booking: '시간 지정 입장이라 온라인 예매가 사실상 필수입니다.', closed: null, busy: null, hours: null },
    caution: '동굴 안은 연중 21도이고 계단이 많습니다.',
  },
  {
    id: 'mallorca-es-trenc', wikidata: 'Q11919677',
    lat: 39.34556, lon: 2.98333,
    name: '에스 트렌크 해변', nameEn: 'Es Trenc', city: 'palma',
    theme: 'nature', durationMin: 180, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['해변', '자연보호구역'],
    summary: '건물이 하나도 없는 3km 백사장',
    why: '마요르카 남쪽에 개발되지 않고 남은 해변입니다. 뒤가 소금밭과 소나무 숲이라 호텔이 한 채도 없고, 카리브해 같다는 말이 과장이 아닌 물빛이 나옵니다.',
    practical: { duration: '반나절', price: '무료 (주차 €7)', booking: null, closed: null, busy: '7~8월 정오면 주차장이 찹니다.', hours: null },
    caution: '그늘과 편의시설이 거의 없습니다. 물과 양산을 챙기세요.',
  },
  {
    id: 'mallorca-serra-tramuntana', wikidata: 'Q379025',
    lat: 39.80778, lon: 2.79361,
    name: '세라 데 트라문타나', nameEn: 'Serra de Tramuntana', city: 'soller',
    theme: 'nature', durationMin: 240, priceEur: 0, energy: 3, popularity: 4,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['산맥', '유네스코', '드라이브'],
    summary: '섬 북서쪽을 가로지르는 유네스코 문화경관 산맥',
    why: '천 년에 걸쳐 돌담으로 계단밭을 쌓아 만든 경관이라 자연이 아니라 문화유산으로 등재됐습니다. Ma-10 도로가 산등성이를 따라 이어져, 사 칼로브라 굽잇길과 절벽 전망대가 줄줄이 나옵니다.',
    practical: { duration: '반나절~하루', price: '무료', booking: null, closed: null, busy: null, hours: null },
    caution: '굽잇길이 심해 멀미가 나기 쉽습니다. 겨울에는 안개가 잦습니다.',
  },
  {
    id: 'mallorca-cap-formentor', wikidata: 'Q1034144',
    lat: 39.96222, lon: 3.21361,
    name: '포르멘토르 곶', nameEn: 'Cap de Formentor', city: 'pollenca',
    theme: 'nature', durationMin: 150, priceEur: 0, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['절벽', '등대', '전망'],
    summary: '섬의 북쪽 끝. 절벽 위 등대까지 이어지는 길',
    why: '마요르카가 바다로 끝나는 지점입니다. 미라도르 에스 콜로메르에서 200m 절벽이 그대로 떨어지는 것이 보이고, 길 끝 등대까지 가면 사방이 바다입니다.',
    practical: { duration: '약 2시간 30분', price: '무료', booking: null, closed: null, busy: null, hours: null },
    caution: '여름 성수기에는 낮 시간 자가용 진입이 통제되어 셔틀버스를 타야 합니다.',
  },

  // ── 테네리페 ────────────────────────────────────────────
  {
    id: 'tenerife-teide-teleferico', wikidata: 'Q38954',
    lat: 28.27264, lon: -16.64361,
    name: '테이데 화산', nameEn: 'Mount Teide', city: 'la-orotava',
    theme: 'nature', durationMin: 240, priceEur: 40, energy: 3, popularity: 5,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['화산', '유네스코', '케이블카'],
    summary: '스페인에서 가장 높은 산(3,715m). 케이블카로 3,555m까지',
    why: '스페인 최고봉이자 세계에서 세 번째로 큰 화산입니다. 케이블카가 3,555m 까지 올려 주고, 오르는 길의 라스 카냐다스 분화구는 화성 촬영지로 쓰일 만큼 다른 풍경입니다.',
    practical: { duration: '반나절', price: '케이블카 왕복 €40', booking: '정상(3,715m) 구간은 무료 허가증이 따로 필요하고 몇 주 전에 마감됩니다.', closed: null, busy: null, hours: null },
    caution: '고도 3,500m 라 기온이 해안보다 15도 이상 낮고 바람이 셉니다. 강풍이면 케이블카가 멈춥니다.',
  },
  {
    id: 'tenerife-los-gigantes', wikidata: 'Q2822632',
    lat: 28.29652, lon: -16.85577,
    name: '로스 히간테스 절벽', nameEn: 'Acantilados de Los Gigantes', city: 'santa-cruz-tenerife',
    theme: 'nature', durationMin: 180, priceEur: 30, energy: 2, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['절벽', '고래관찰', '보트'],
    summary: '바다에서 600m 솟은 절벽. 고래를 보러 나가는 곳',
    why: '해수면에서 곧장 600m 가 솟아 "거인들" 이라는 이름이 붙었습니다. 앞바다에 참거두고래가 연중 머물러, 보트를 타면 높은 확률로 만납니다.',
    practical: { duration: '약 3시간', price: '고래 관찰 보트 €30 안팎', booking: '성수기에는 전날 예약이 안전합니다.', closed: null, busy: null, hours: null },
    caution: null,
  },

  // ── 그란카나리아 ──────────────────────────────────────────
  {
    id: 'gran-canaria-roque-nublo', wikidata: 'Q1424835',
    lat: 27.97083, lon: -15.6125,
    name: '로케 누블로', nameEn: 'Roque Nublo', city: 'las-palmas',
    theme: 'nature', durationMin: 180, priceEur: 0, energy: 3, popularity: 3,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['화산', '트레킹', '전망'],
    summary: '섬 한가운데 솟은 80m 바위. 맑으면 테이데가 보인다',
    why: '섬 중앙 고원에 80m 바위 기둥이 홀로 서 있습니다. 주차장에서 30분이면 발치까지 걸어 올라가고, 맑은 날은 바다 건너 테네리페의 테이데가 구름 위로 보입니다.',
    practical: { duration: '약 3시간', price: '무료', booking: null, closed: null, busy: null, hours: null },
    caution: '해발 1,800m 라 바람이 세고 오후에 구름이 자주 덮입니다. 오전이 낫습니다.',
  },
  {
    id: 'gran-canaria-teror', wikidata: 'Q430147',
    lat: 28.059, lon: -15.54757,
    name: '테로르', nameEn: 'Teror', city: 'las-palmas',
    theme: 'history', durationMin: 120, priceEur: 0, energy: 1, popularity: 2,
    bestSlots: ['morning', 'afternoon'], indoor: false,
    tags: ['마을', '발코니', '순례'],
    summary: '나무 발코니가 줄지어 선 섬의 순례 마을',
    why: '섬의 수호성인 성당이 있는 순례 마을입니다. 카나리아 특유의 목조 발코니가 길 양쪽으로 이어져 있고, 일요일 장에서 초리소와 수제 누가를 팝니다.',
    practical: { duration: '약 2시간', price: '무료', booking: null, closed: null, busy: '일요일 장날에 가장 붐빕니다.', hours: null },
    caution: null,
  },
];
