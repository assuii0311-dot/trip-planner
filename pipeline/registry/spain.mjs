// Curated Spain registry.
// Discovery finds 367 Wikivoyage articles for Spain, but most are beach
// resorts and natural parks with a handful of listings. This file is the
// human decision layer on top of that: which places a traveller actually
// bases in, which ones are a realistic day trip from where, and how long
// that trip takes. Transit times are scheduled service times, not estimates
// derived from distance.

const T = (city, transitMin, mode, note) => ({ city, transitMin, mode, note });

/** Shared boilerplate for satellite towns, which rarely need a transit card. */
const walkable = (extra = []) => ({
  passes: [],
  apps: [{ name: 'Google Maps', note: '시내 버스 시간표까지 반영됩니다.' }],
  tips: ['구시가는 대부분 도보권입니다. 걷기 편한 신발이 사실상 필수입니다.', ...extra],
});

export const COUNTRY = { slug: 'spain', name: '스페인', nameEn: 'Spain' };

export const CITIES = [
  // ── 카탈루냐 ─────────────────────────────────────────────
  {
    slug: 'barcelona', title: 'Barcelona', name: '바르셀로나', nameEn: 'Barcelona',
    region: '카탈루냐', lat: 41.3874, lon: 2.1686, isHub: true,
    blurb: '가우디의 건축과 지중해 해변, 바르 문화가 한 도시에 겹쳐 있습니다.',
    dayTrips: [
      T('girona', 38, 'AVE 고속열차', '중세 유대인 지구와 성벽 산책로가 있습니다.'),
      T('figueres', 55, 'AVE 고속열차', '달리 극장미술관 한 곳만으로도 갈 만합니다.'),
      T('sitges', 40, 'Rodalies R2S 근교열차', '해변과 하얀 구시가. 여름에는 붐빕니다.'),
      T('montserrat', 90, 'R5 열차 + 산악열차', '톱니 모양 바위산의 수도원. 오전에 가야 여유롭습니다.'),
      T('tarragona', 35, 'AVE / Rodalies', '바다를 내려다보는 로마 원형극장이 남아 있습니다.'),
      T('cadaques', 165, '버스', '달리가 살던 하얀 어촌. 이동이 길어 하루를 다 씁니다.'),
      T('vic', 75, 'Rodalies R3', '토요일 아침 광장 시장이 볼거리입니다.'),
    ],
    transitGuide: {
      passes: [
        { name: 'T-casual', price: '€12.55', note: '1존 10회권. 여럿이 나눠 쓸 수 없지만 가장 저렴합니다.' },
        { name: 'Hola Barcelona', price: '48시간 €17.50~', note: '공항철도 포함 무제한. 하루 4회 이상 탈 때만 이득입니다.' },
      ],
      apps: [
        { name: 'TMB App', note: '지하철·버스 공식 앱. 실시간 도착 정보가 정확합니다.' },
        { name: 'Citymapper', note: '환승 안내가 가장 읽기 쉽습니다.' },
      ],
      tips: [
        '사그라다 파밀리아와 구엘 공원은 시간 지정 예매가 필수입니다. 성수기엔 2~3주 전 매진됩니다.',
        '람블라스 거리와 지하철 L3에서 소매치기가 가장 많습니다. 가방은 앞으로 메세요.',
        '고딕 지구는 좁고 평지, 그라시아 거리 위쪽은 오르막입니다. 같은 날에 묶으면 힘듭니다.',
      ],
    },
  },
  { slug: 'girona', title: 'Girona', name: '지로나', nameEn: 'Girona', region: '카탈루냐', lat: 41.9794, lon: 2.8214, isHub: false, hub: 'barcelona', blurb: '오냐르 강변의 색색 집들과 잘 보존된 유대인 지구.', transitGuide: walkable(['성벽 산책로는 오르막이 이어집니다. 물을 챙기세요.']) },
  { slug: 'figueres', title: 'Figueres', name: '피게레스', nameEn: 'Figueres', region: '카탈루냐', lat: 42.2662, lon: 2.9622, isHub: false, hub: 'barcelona', blurb: '달리가 직접 설계한 극장미술관이 있는 도시.', transitGuide: walkable(['달리 극장미술관은 온라인 예매만 받는 날이 있습니다.']) },
  { slug: 'sitges', title: 'Sitges', name: '시체스', nameEn: 'Sitges', region: '카탈루냐', lat: 41.2371, lon: 1.8055, isHub: false, hub: 'barcelona', blurb: '17개 해변과 하얀 구시가가 붙어 있는 휴양 도시.', transitGuide: walkable(['7~8월 주말은 해변과 열차가 모두 붐빕니다.']) },
  { slug: 'montserrat', title: 'Montserrat (Spain)', name: '몬세라트', nameEn: 'Montserrat', region: '카탈루냐', lat: 41.5931, lon: 1.8378, isHub: false, hub: 'barcelona', blurb: '톱니 모양 바위산 위의 베네딕도회 수도원.', transitGuide: walkable(['소년 합창단(에스콜라니아) 공연은 평일 13시입니다.', '산악열차와 케이블카 중 하나를 골라 왕복권을 삽니다.']) },
  { slug: 'tarragona', title: 'Tarragona', name: '타라고나', nameEn: 'Tarragona', region: '카탈루냐', lat: 41.1189, lon: 1.2445, isHub: false, hub: 'barcelona', blurb: '지중해를 내려다보는 로마 원형극장과 성벽.', transitGuide: walkable(['AVE 역(Camp de Tarragona)은 시내에서 10km 떨어져 있습니다. 버스 환승이 필요합니다.']) },
  { slug: 'cadaques', title: 'Cadaqués', name: '카다케스', nameEn: 'Cadaqués', region: '카탈루냐', lat: 42.2888, lon: 3.2779, isHub: false, hub: 'barcelona', blurb: '달리가 살던 하얀 어촌 마을.', transitGuide: walkable(['대중교통은 버스뿐이고 배차가 드뭅니다. 돌아오는 시간을 먼저 확인하세요.']) },
  { slug: 'vic', title: 'Vic (Barcelona)', name: '빅', nameEn: 'Vic', region: '카탈루냐', lat: 41.9301, lon: 2.2549, isHub: false, hub: 'barcelona', blurb: '거대한 중세 광장과 토요 시장으로 알려진 내륙 도시.', transitGuide: walkable(['시장은 토요일 오전에만 섭니다.']) },
  { slug: 'blanes', title: 'Blanes', name: '블라네스', nameEn: 'Blanes', region: '카탈루냐', lat: 41.6748, lon: 2.7906, isHub: false, hub: 'barcelona', blurb: '코스타 브라바가 시작되는 해변 마을과 식물원.', transitGuide: walkable() },

  // ── 마드리드와 카스티야 ───────────────────────────────────
  {
    slug: 'madrid', title: 'Madrid', name: '마드리드', nameEn: 'Madrid',
    region: '마드리드', lat: 40.4168, lon: -3.7038, isHub: true,
    blurb: '프라도로 대표되는 미술관 삼각지대와 밤늦게까지 이어지는 타파스 골목.',
    dayTrips: [
      T('toledo', 33, 'AVE 고속열차', '한 도시에 기독교·이슬람·유대 유산이 겹쳐 있습니다.'),
      T('segovia', 27, 'AVE 고속열차', '로마 수도교와 디즈니성의 모델이 된 알카사르.'),
      T('avila', 65, 'Avant 열차', '유럽에서 가장 온전한 중세 성벽이 도시를 감쌉니다.'),
      T('cuenca', 55, 'AVE 고속열차', '절벽에 매달린 집들로 유명합니다.'),
      T('salamanca', 100, 'Alvia 열차', '황금빛 사암 대학 도시. 저녁 광장이 특히 아름답습니다.'),
      T('alcala-de-henares', 40, 'Cercanías 근교열차', '세르반테스의 고향이자 대학 도시.'),
      T('aranjuez', 45, 'Cercanías 근교열차', '왕궁과 정원. 봄가을에 가장 좋습니다.'),
    ],
    transitGuide: {
      passes: [
        { name: 'Metrobús 10회권', price: '€12.20 + 카드 €2.50', note: '지하철·버스 공용. 일행끼리 나눠 쓸 수 있습니다.' },
        { name: 'Abono Turístico', price: '1일 €8.40~', note: '공항 추가요금 포함. 근교 도시까지 쓰는 A존 권종도 있습니다.' },
      ],
      apps: [
        { name: 'Metro de Madrid', note: '공식 앱. 역별 엘리베이터 유무까지 나옵니다.' },
        { name: 'Citymapper', note: '버스·지하철 통합 경로.' },
      ],
      tips: [
        '프라도는 월~토 18시, 일 17시부터 무료입니다. 대신 줄이 깁니다.',
        '왕궁은 수·목 오후 유럽연합 시민 무료 시간대에 매우 붐빕니다.',
        '공항에서 시내는 지하철 8호선이 가장 싸고, 공항 추가요금 €3이 붙습니다.',
        '대부분의 미술관이 월요일에 쉽니다. 월요일은 레티로 공원과 시장 위주로 짜세요.',
      ],
    },
  },
  { slug: 'toledo', title: 'Toledo', name: '톨레도', nameEn: 'Toledo', region: '카스티야라만차', lat: 39.8628, lon: -4.0273, isHub: false, hub: 'madrid', blurb: '세 종교의 유산이 층층이 쌓인 언덕 위 옛 수도.', transitGuide: walkable(['기차역에서 구시가까지 오르막입니다. 5번 버스나 에스컬레이터를 이용하세요.', '대성당·산토토메 등 7곳 통합권(Pulsera Turística)이 있습니다.']) },
  { slug: 'segovia', title: 'Segovia', name: '세고비아', nameEn: 'Segovia', region: '카스티야레온', lat: 40.9429, lon: -4.1088, isHub: false, hub: 'madrid', blurb: '2000년 된 로마 수도교와 동화 같은 알카사르.', transitGuide: walkable(['AVE 역은 시내에서 6km 떨어져 있습니다. 11번 버스로 환승합니다.', '새끼돼지 통구이(코치니요)는 점심에 먹는 음식입니다.']) },
  { slug: 'avila', title: 'Ávila', name: '아빌라', nameEn: 'Ávila', region: '카스티야레온', lat: 40.6565, lon: -4.6818, isHub: false, hub: 'madrid', blurb: '2.5km 성벽이 도시 전체를 감싼 곳.', transitGuide: walkable(['해발 1130m로 마드리드보다 서늘합니다. 겉옷을 챙기세요.']) },
  { slug: 'cuenca', title: 'Cuenca (Spain)', name: '쿠엥카', nameEn: 'Cuenca', region: '카스티야라만차', lat: 40.0703, lon: -2.1374, isHub: false, hub: 'madrid', blurb: '협곡 절벽에 매달린 집들로 유명한 도시.', transitGuide: walkable(['AVE 역에서 구시가까지 버스 20분입니다.']) },
  { slug: 'salamanca', title: 'Salamanca', name: '살라망카', nameEn: 'Salamanca', region: '카스티야레온', lat: 40.9701, lon: -5.6635, isHub: false, hub: 'madrid', blurb: '황금빛 사암으로 지은 유럽 최고(最古) 대학 도시 중 하나.', transitGuide: walkable(['마요르 광장은 해 질 무렵 조명이 켜질 때가 가장 좋습니다.']) },
  { slug: 'alcala-de-henares', title: 'Alcalá de Henares', name: '알칼라데에나레스', nameEn: 'Alcalá de Henares', region: '마드리드', lat: 40.4818, lon: -3.3644, isHub: false, hub: 'madrid', blurb: '세르반테스가 태어난 대학 도시.', transitGuide: walkable() },
  { slug: 'aranjuez', title: 'Aranjuez', name: '아랑후에스', nameEn: 'Aranjuez', region: '마드리드', lat: 40.0311, lon: -3.6032, isHub: false, hub: 'madrid', blurb: '타호 강가의 왕실 별궁과 넓은 정원.', transitGuide: walkable(['정원이 넓습니다. 반나절은 잡으세요.']) },

  // ── 안달루시아 ───────────────────────────────────────────
  {
    slug: 'seville', title: 'Seville', name: '세비야', nameEn: 'Seville',
    region: '안달루시아', lat: 37.3891, lon: -5.9845, isHub: true,
    blurb: '플라멩코의 본고장이자 알카사르와 대성당이 있는 안달루시아의 중심.',
    dayTrips: [
      T('cordoba', 45, 'AVE 고속열차', '메스키타 하나만으로도 충분한 이유가 됩니다.'),
      T('cadiz', 100, 'Media Distancia 열차', '삼면이 바다인 유럽에서 가장 오래된 도시 중 하나.'),
      T('jerez', 65, 'Media Distancia 열차', '셰리 와인과 안달루시아 승마 학교.'),
      T('ronda', 150, '버스', '협곡을 가로지르는 누에보 다리. 이동이 길어 일찍 나서야 합니다.'),
    ],
    transitGuide: {
      passes: [{ name: 'Tarjeta Multiviaje', price: '€1.45/회', note: 'Tussam 버스·트램 충전식. 구시가는 대부분 걸어서 다닙니다.' }],
      apps: [{ name: 'Tussam', note: '시내버스 실시간 도착.' }, { name: 'Sevici', note: '공영 자전거. 평지라 자전거가 편합니다.' }],
      tips: [
        '알카사르는 온라인 예매하지 않으면 1~2시간 줄을 섭니다.',
        '7~8월 낮 기온이 40도를 넘습니다. 14~17시는 실내 일정으로 채우세요.',
        '플라멩코는 관광 공연장(타블라오)과 동네 페냐의 분위기가 완전히 다릅니다.',
      ],
    },
  },
  { slug: 'cordoba', title: 'Córdoba (city, Spain)', name: '코르도바', nameEn: 'Córdoba', region: '안달루시아', lat: 37.8882, lon: -4.7794, isHub: false, hub: 'seville', blurb: '이슬람 사원 위에 성당을 얹은 메스키타의 도시.', transitGuide: walkable(['메스키타는 8:30~9:30 무료 입장 시간대가 있습니다.', '5월 파티오 축제 기간에는 골목마다 꽃 화분이 걸립니다.']) },
  { slug: 'cadiz', title: 'Cádiz', name: '카디스', nameEn: 'Cádiz', region: '안달루시아', lat: 36.5271, lon: -6.2886, isHub: false, hub: 'seville', blurb: '삼면이 바다인 서유럽에서 가장 오래된 도시.', transitGuide: walkable(['구시가는 반나절이면 한 바퀴 돕니다.']) },
  { slug: 'jerez', title: 'Jerez de la Frontera', name: '헤레스', nameEn: 'Jerez de la Frontera', region: '안달루시아', lat: 36.6850, lon: -6.1261, isHub: false, hub: 'seville', blurb: '셰리 와인과 안달루시아 승마 학교의 도시.', transitGuide: walkable(['보데가 투어는 대부분 사전 예약제입니다.', '승마 공연은 화·목요일 정오에 열립니다.']) },
  { slug: 'ronda', title: 'Ronda', name: '론다', nameEn: 'Ronda', region: '안달루시아', lat: 36.7429, lon: -5.1663, isHub: false, hub: 'malaga', blurb: '100m 협곡을 가로지르는 누에보 다리로 유명한 절벽 도시.', transitGuide: walkable(['협곡 아래 전망대까지는 가파른 계단입니다.', '말라가에서 오는 기차는 하루 몇 편뿐입니다. 버스가 편합니다.']) },
  {
    slug: 'granada', title: 'Granada', name: '그라나다', nameEn: 'Granada',
    region: '안달루시아', lat: 37.1773, lon: -3.5986, isHub: true,
    blurb: '알함브라 궁전과 알바이신 언덕, 그리고 무료 타파스 문화.',
    dayTrips: [
      T('malaga', 85, 'Avant 열차', '해변과 피카소 미술관이 함께 있습니다.'),
      T('ronda', 150, '버스', '협곡 위의 절벽 도시.'),
      T('nerja', 120, '버스', '유럽의 발코니라 불리는 전망대와 종유동굴.'),
    ],
    transitGuide: {
      passes: [{ name: 'Credibus', price: '€5 충전', note: '시내버스 충전식 카드. 알함브라행 C30·C32 버스에 씁니다.' }],
      apps: [{ name: 'Google Maps', note: '알바이신 골목은 지도 없이는 길을 잃습니다.' }],
      tips: [
        '알함브라 나스르 궁전은 시간 지정 입장이고 성수기 2~3개월 전에 매진됩니다. 가장 먼저 예매하세요.',
        '그라나다는 아직 음료를 시키면 타파스가 공짜로 나오는 도시입니다.',
        '알바이신과 사크로몬테는 오르막과 자갈길입니다. 편한 신발이 필요합니다.',
      ],
    },
  },
  {
    slug: 'malaga', title: 'Málaga', name: '말라가', nameEn: 'Málaga',
    region: '안달루시아', lat: 36.7213, lon: -4.4214, isHub: true,
    blurb: '피카소의 고향이자 코스타 델 솔의 관문. 미술관과 해변이 함께 있습니다.',
    dayTrips: [
      T('ronda', 105, 'Media Distancia 열차', '절벽 위 도시와 누에보 다리.'),
      T('nerja', 60, '버스', '전망대와 종유동굴, 그리고 조용한 해변.'),
      T('marbella', 45, '버스', '요트 항구와 하얀 구시가.'),
      T('granada', 85, 'Avant 열차', '알함브라를 보러 가는 당일치기도 가능합니다.'),
    ],
    transitGuide: {
      passes: [{ name: 'EMT 버스 카드', price: '€0.85/회', note: '충전식. 시내는 대부분 도보권입니다.' }],
      apps: [{ name: 'Renfe Cercanías', note: 'C1 노선으로 공항과 해변 마을을 오갑니다.' }],
      tips: [
        '공항에서 시내까지 Cercanías C1으로 12분, €1.80입니다. 택시보다 훨씬 빠릅니다.',
        '히브랄파로 성까지는 걸어 오를 수 있지만 여름 한낮에는 무리입니다.',
      ],
    },
  },
  { slug: 'nerja', title: 'Nerja', name: '네르하', nameEn: 'Nerja', region: '안달루시아', lat: 36.7452, lon: -3.8760, isHub: false, hub: 'malaga', blurb: '유럽의 발코니 전망대와 거대한 종유동굴이 있는 해변 마을.', transitGuide: walkable(['동굴은 마을에서 4km 떨어져 있습니다. 버스나 택시가 필요합니다.']) },
  { slug: 'marbella', title: 'Marbella', name: '마르베야', nameEn: 'Marbella', region: '안달루시아', lat: 36.5101, lon: -4.8824, isHub: false, hub: 'malaga', blurb: '요트 항구 푸에르토 바누스와 오렌지 광장의 구시가.', transitGuide: walkable(['기차역이 없습니다. 버스가 유일한 대중교통입니다.']) },

  // ── 발렌시아와 지중해 연안 ────────────────────────────────
  {
    slug: 'valencia', title: 'Valencia', name: '발렌시아', nameEn: 'Valencia',
    region: '발렌시아', lat: 39.4699, lon: -0.3763, isHub: true,
    blurb: '파에야의 고향이자 미래도시 같은 예술과학도시가 있는 곳.',
    dayTrips: [
      T('albufera', 30, '버스', '파에야가 태어난 석호. 일몰 뱃놀이가 유명합니다.'),
      T('xativa', 40, 'Cercanías 열차', '언덕 위 성채에서 평야가 내려다보입니다.'),
      T('sagunto', 30, 'Cercanías 열차', '로마 극장과 언덕 성채.'),
      T('penyiscola', 120, '버스', '바다로 튀어나온 바위 위의 성.'),
    ],
    transitGuide: {
      passes: [
        { name: 'SUMA 10 viajes', price: '€8', note: '지하철·트램·버스 통합 10회권.' },
        { name: 'Valencia Tourist Card', price: '24시간 €15', note: '교통 무제한 + 시립 미술관 무료.' },
      ],
      apps: [{ name: 'Valenbisi', note: '공영 자전거. 옛 강바닥 공원을 따라 달리기 좋습니다.' }],
      tips: [
        '투리아 공원은 강을 메워 만든 9km 녹지입니다. 자전거가 가장 편합니다.',
        '파에야는 원래 점심 음식입니다. 저녁에만 파는 곳은 관광객용인 경우가 많습니다.',
        '3월 라스 파야스 축제 기간에는 숙소가 몇 배로 오릅니다.',
      ],
    },
  },
  { slug: 'albufera', title: 'Albufera Natural Park', name: '알부페라', nameEn: 'Albufera Natural Park', region: '발렌시아', lat: 39.3400, lon: -0.3500, isHub: false, hub: 'valencia', blurb: '파에야가 태어난 석호와 논, 그리고 일몰.', transitGuide: walkable(['해 지기 1시간 전 배를 타는 것이 가장 좋습니다.']) },
  { slug: 'xativa', title: 'Xàtiva', name: '하티바', nameEn: 'Xàtiva', region: '발렌시아', lat: 38.9871, lon: -0.5180, isHub: false, hub: 'valencia', blurb: '능선을 따라 길게 뻗은 성채가 있는 언덕 도시.', transitGuide: walkable(['성까지 오르막 30분. 꼬마열차도 있습니다.']) },
  { slug: 'sagunto', title: 'Sagunto', name: '사군토', nameEn: 'Sagunto', region: '발렌시아', lat: 39.6766, lon: -0.2773, isHub: false, hub: 'valencia', blurb: '로마 극장과 언덕 위 성채, 그리고 옛 유대인 지구.', transitGuide: walkable() },
  { slug: 'penyiscola', title: 'Peñiscola', name: '페니스콜라', nameEn: 'Peñíscola', region: '발렌시아', lat: 40.3585, lon: 0.4064, isHub: false, hub: 'valencia', blurb: '바다로 튀어나온 바위 위에 성이 얹힌 마을.', transitGuide: walkable() },
  {
    slug: 'alicante', title: 'Alicante', name: '알리칸테', nameEn: 'Alicante',
    region: '발렌시아', lat: 38.3452, lon: -0.4810, isHub: true,
    blurb: '산타바르바라 성이 내려다보는 해변 도시. 코스타 블랑카의 관문입니다.',
    dayTrips: [
      T('elche', 25, 'Cercanías 열차', '유럽 최대 야자수 숲이 도시를 덮고 있습니다.'),
      T('benidorm', 75, 'TRAM 트램', '고층 빌딩과 넓은 해변이 있는 휴양 도시.'),
      T('denia', 90, '버스', '항구와 성채, 그리고 조용한 해변.'),
      T('calp', 80, '버스', '바다에서 솟은 이팍 바위가 상징입니다.'),
      T('xabia', 100, '버스', '만과 절벽이 이어지는 해안.'),
    ],
    transitGuide: {
      passes: [{ name: 'TAM 10회권', price: '€8.30', note: '시내버스와 트램 공용.' }],
      apps: [{ name: 'TRAM Alicante', note: '해안 마을을 잇는 트램 시간표.' }],
      tips: ['산타바르바라 성까지 해변 쪽 엘리베이터로 오를 수 있습니다.', '트램은 해안 절경 구간이 많아 이동 자체가 볼거리입니다.'],
    },
  },
  { slug: 'elche', title: 'Elche', name: '엘체', nameEn: 'Elche', region: '발렌시아', lat: 38.2699, lon: -0.7126, isHub: false, hub: 'alicante', blurb: '20만 그루 야자수 숲이 도시를 감싼 곳.', transitGuide: walkable() },
  { slug: 'benidorm', title: 'Benidorm', name: '베니도름', nameEn: 'Benidorm', region: '발렌시아', lat: 38.5342, lon: -0.1314, isHub: false, hub: 'alicante', blurb: '스페인에서 고층 빌딩이 가장 빽빽한 해변 도시.', transitGuide: walkable() },
  { slug: 'denia', title: 'Dénia', name: '데니아', nameEn: 'Dénia', region: '발렌시아', lat: 38.8407, lon: 0.1057, isHub: false, hub: 'alicante', blurb: '유네스코 미식 도시로 지정된 항구 마을.', transitGuide: walkable() },
  { slug: 'calp', title: 'Calpe', name: '칼페', nameEn: 'Calpe', region: '발렌시아', lat: 38.6447, lon: 0.0448, isHub: false, hub: 'alicante', blurb: '바다에서 332m 솟은 이팍 바위가 상징인 해변 마을.', transitGuide: walkable(['이팍 바위 등반은 왕복 2시간, 경사가 가파릅니다.']) },
  { slug: 'xabia', title: 'Xàbia', name: '하베아', nameEn: 'Xàbia', region: '발렌시아', lat: 38.7891, lon: 0.1662, isHub: false, hub: 'alicante', blurb: '절벽과 자갈 해변이 이어지는 조용한 해안 마을.', transitGuide: walkable() },

  // ── 북부 ─────────────────────────────────────────────────
  {
    slug: 'bilbao', title: 'Bilbao', name: '빌바오', nameEn: 'Bilbao',
    region: '바스크', lat: 43.2630, lon: -2.9350, isHub: true,
    blurb: '구겐하임 미술관 하나로 도시 전체가 바뀐 사례. 핀초스도 훌륭합니다.',
    dayTrips: [
      T('san-sebastian', 75, '버스', '미식의 수도이자 초승달 모양 해변.'),
      T('vitoria', 60, '버스', '녹지가 많은 바스크 주도. 중세 구시가가 온전합니다.'),
      T('santander', 90, '버스', '왕실 별궁과 해변이 있는 칸타브리아 주도.'),
      T('logrono', 120, '버스', '리오하 와인과 칼레 라우렐 핀초스 골목.'),
    ],
    transitGuide: {
      passes: [{ name: 'Barik 카드', price: '€3 + 충전', note: '지하철·트램·버스·푸니쿨라 공용. 여럿이 나눠 쓸 수 있습니다.' }],
      apps: [{ name: 'Metro Bilbao', note: '노선이 단순해 금방 익숙해집니다.' }],
      tips: [
        '구겐하임은 월요일 휴관입니다(7~8월 제외).',
        '아르찬다 푸니쿨라를 타면 도시 전경이 한눈에 들어옵니다.',
        '핀초스는 카운터에서 직접 집고 나중에 개수로 계산합니다.',
      ],
    },
  },
  {
    slug: 'san-sebastian', title: 'San Sebastián', name: '산세바스티안', nameEn: 'San Sebastián',
    region: '바스크', lat: 43.3183, lon: -1.9812, isHub: true,
    blurb: '인구당 미슐랭 별이 세계에서 가장 많은 도시. 라 콘차 해변이 도심에 있습니다.',
    dayTrips: [
      T('bilbao', 75, '버스', '구겐하임과 강변 산책로.'),
      T('pamplona', 75, '버스', '소몰이 축제로 알려진 나바라 주도.'),
      T('hondarribia', 40, '버스', '프랑스 국경의 색색 목조 발코니 마을.'),
    ],
    transitGuide: {
      passes: [{ name: 'Mugi 카드', price: '€5 + 충전', note: 'Dbus 시내버스와 근교 버스 공용.' }],
      apps: [{ name: 'Dbus', note: '시내버스 실시간 위치.' }],
      tips: [
        '구시가(파르테 비에하) 핀초스 바는 20시 이후 가장 붐빕니다. 서서 먹는 것이 기본입니다.',
        '몬테 이겔도 전망대는 100년 된 푸니쿨라로 오릅니다.',
        '9월 국제영화제 기간에는 숙소를 몇 달 전에 잡아야 합니다.',
      ],
    },
  },
  { slug: 'vitoria', title: 'Vitoria-Gasteiz', name: '비토리아', nameEn: 'Vitoria-Gasteiz', region: '바스크', lat: 42.8467, lon: -2.6716, isHub: false, hub: 'bilbao', blurb: '녹지 띠가 도시를 감싼 바스크 주도.', transitGuide: walkable() },
  { slug: 'pamplona', title: 'Pamplona', name: '팜플로나', nameEn: 'Pamplona', region: '나바라', lat: 42.8125, lon: -1.6458, isHub: false, hub: 'san-sebastian', blurb: '산 페르민 소몰이 축제와 헤밍웨이의 도시.', transitGuide: walkable(['7월 산 페르민 기간 외에는 조용한 도시입니다.']) },
  { slug: 'hondarribia', title: 'Hondarribia', name: '온다리비아', nameEn: 'Hondarribia', region: '바스크', lat: 43.3639, lon: -1.7940, isHub: false, hub: 'san-sebastian', blurb: '색색 목조 발코니가 늘어선 국경 마을.', transitGuide: walkable() },
  { slug: 'santander', title: 'Santander', name: '산탄데르', nameEn: 'Santander', region: '칸타브리아', lat: 43.4623, lon: -3.8100, isHub: false, hub: 'bilbao', blurb: '왕실 별궁 마그달레나와 해변이 이어지는 항구 도시.', transitGuide: walkable() },
  { slug: 'logrono', title: 'Logroño', name: '로그로뇨', nameEn: 'Logroño', region: '라리오하', lat: 42.4650, lon: -2.4456, isHub: false, hub: 'bilbao', blurb: '리오하 와인의 중심이자 핀초스 골목으로 유명한 도시.', transitGuide: walkable(['칼레 라우렐 한 골목에 핀초스 바가 50곳 넘게 붙어 있습니다.']) },
  {
    slug: 'santiago', title: 'Santiago de Compostela', name: '산티아고데콤포스텔라', nameEn: 'Santiago de Compostela',
    region: '갈리시아', lat: 42.8805, lon: -8.5457, isHub: true,
    blurb: '순례길의 종착지. 비 오는 화강암 골목과 해산물이 인상적입니다.',
    dayTrips: [
      T('a-coruna', 35, 'Media Distancia 열차', '유리 발코니 해안가와 로마 등대.'),
      T('vigo', 55, 'Media Distancia 열차', '갈리시아 최대 항구와 굴 골목.'),
      T('ourense', 40, 'AVE 열차', '도심 한복판의 노천 온천.'),
    ],
    transitGuide: {
      passes: [],
      apps: [{ name: 'Google Maps', note: '구시가는 도보 20분이면 가로지릅니다.' }],
      tips: ['대성당 보타푸메이로(대형 향로) 의식은 정해진 날에만 합니다. 일정 확인이 필요합니다.', '갈리시아는 스페인에서 비가 가장 많은 지역입니다. 우산을 챙기세요.'],
    },
  },
  { slug: 'a-coruna', title: 'A Coruña', name: '라코루냐', nameEn: 'A Coruña', region: '갈리시아', lat: 43.3623, lon: -8.4115, isHub: false, hub: 'santiago', blurb: '유리 발코니 건물이 늘어선 해안과 로마 시대 등대.', transitGuide: walkable() },
  { slug: 'vigo', title: 'Vigo', name: '비고', nameEn: 'Vigo', region: '갈리시아', lat: 42.2406, lon: -8.7207, isHub: false, hub: 'santiago', blurb: '갈리시아 최대 항구와 굴을 파는 오스트라스 골목.', transitGuide: walkable(['시에스 제도행 배는 여름 성수기에 사전 예약이 필요합니다.']) },
  { slug: 'ourense', title: 'Ourense', name: '오렌세', nameEn: 'Ourense', region: '갈리시아', lat: 42.3358, lon: -7.8639, isHub: false, hub: 'santiago', blurb: '도심에서 노천 온천을 즐길 수 있는 도시.', transitGuide: walkable() },
  { slug: 'oviedo', title: 'Oviedo', name: '오비에도', nameEn: 'Oviedo', region: '아스투리아스', lat: 43.3619, lon: -5.8494, isHub: false, hub: 'santiago', blurb: '선(先)로마네스크 건축과 사과주(시드라) 문화의 도시.', transitGuide: walkable(['시드라는 높이 들어 따라 마시는 것이 전통입니다.']) },

  // ── 아라곤 ───────────────────────────────────────────────
  {
    slug: 'zaragoza', title: 'Zaragoza', name: '사라고사', nameEn: 'Zaragoza',
    region: '아라곤', lat: 41.6488, lon: -0.8891, isHub: true,
    blurb: '마드리드와 바르셀로나 사이, 필라르 성당과 무데하르 건축이 있는 도시.',
    dayTrips: [T('teruel', 140, '열차', '무데하르 양식 탑과 연인 전설로 알려진 도시.')],
    transitGuide: {
      passes: [{ name: '버스·트램 통합권', price: '€0.86/회', note: '충전식 Tarjeta Ciudadana.' }],
      apps: [{ name: 'Google Maps', note: '트램 한 노선이 시내를 관통합니다.' }],
      tips: ['마드리드↔바르셀로나 이동 중 반나절 들르기 좋은 위치입니다.', '10월 필라르 축제 기간에는 도시 전체가 축제장이 됩니다.'],
    },
  },
  { slug: 'teruel', title: 'Teruel', name: '테루엘', nameEn: 'Teruel', region: '아라곤', lat: 40.3456, lon: -1.1065, isHub: false, hub: 'zaragoza', blurb: '유네스코 무데하르 탑들과 연인 전설이 남은 작은 도시.', transitGuide: walkable() },

  // ── 섬 ───────────────────────────────────────────────────
  {
    slug: 'palma', title: 'Palma de Mallorca', name: '팔마데마요르카', nameEn: 'Palma de Mallorca',
    region: '발레아레스', lat: 39.5696, lon: 2.6502, isHub: true,
    blurb: '바다 앞에 선 거대한 고딕 대성당과 요트 항구가 있는 섬의 수도.',
    dayTrips: [
      T('soller', 60, '목조 열차', '1912년 목조 열차를 타고 산을 넘어갑니다.'),
      T('pollenca', 60, '버스', '조용한 구시가와 365계단 언덕 예배당.'),
    ],
    transitGuide: {
      passes: [{ name: 'TIB 카드', price: '충전식', note: '섬 전체 버스 공용.' }],
      apps: [{ name: 'TIB', note: '섬 버스 노선과 시간표.' }],
      tips: ['소예르행 목조 열차는 그 자체가 관광 상품입니다. 예매를 권합니다.', '섬 북부 산악도로는 렌터카가 훨씬 편합니다.'],
    },
  },
  { slug: 'soller', title: 'Sóller', name: '소예르', nameEn: 'Sóller', region: '발레아레스', lat: 39.7658, lon: 2.7150, isHub: false, hub: 'palma', blurb: '오렌지 농장과 산으로 둘러싸인 마을. 목조 트램이 항구까지 이어집니다.', transitGuide: walkable() },
  { slug: 'pollenca', title: 'Pollença', name: '포옌사', nameEn: 'Pollença', region: '발레아레스', lat: 39.8770, lon: 3.0161, isHub: false, hub: 'palma', blurb: '365계단 위 칼바리 예배당과 조용한 구시가.', transitGuide: walkable() },
  {
    slug: 'santa-cruz-tenerife', title: 'Santa Cruz de Tenerife', name: '산타크루스데테네리페', nameEn: 'Santa Cruz de Tenerife',
    region: '카나리아', lat: 28.4636, lon: -16.2518, isHub: true,
    blurb: '테이데 화산을 품은 섬의 관문 도시.',
    dayTrips: [
      T('la-laguna', 40, '트램', '유네스코에 등재된 격자형 식민 도시.'),
      T('puerto-de-la-cruz', 60, '버스', '검은 모래 해변과 화산암 수영장.'),
      T('la-orotava', 70, '버스', '목조 발코니 저택이 남은 언덕 마을.'),
    ],
    transitGuide: {
      passes: [{ name: 'ten+ 카드', price: '충전식', note: 'TITSA 섬 전체 버스 공용. 요금이 크게 할인됩니다.' }],
      apps: [{ name: 'TITSA', note: '섬 버스 노선 검색.' }],
      tips: ['테이데 국립공원 정상 케이블카는 사전 허가와 예약이 필요합니다.', '섬 북쪽은 흐리고 남쪽은 맑은 날이 많습니다.'],
    },
  },
  { slug: 'la-laguna', title: 'San Cristóbal de La Laguna', name: '라라구나', nameEn: 'La Laguna', region: '카나리아', lat: 28.4874, lon: -16.3159, isHub: false, hub: 'santa-cruz-tenerife', blurb: '격자형 도시 계획이 그대로 남은 유네스코 식민 도시.', transitGuide: walkable() },
  { slug: 'puerto-de-la-cruz', title: 'Puerto de la Cruz', name: '푸에르토데라크루스', nameEn: 'Puerto de la Cruz', region: '카나리아', lat: 28.4141, lon: -16.5480, isHub: false, hub: 'santa-cruz-tenerife', blurb: '검은 모래 해변과 화산암으로 만든 해수 수영장.', transitGuide: walkable() },
  { slug: 'la-orotava', title: 'La Orotava', name: '라오로타바', nameEn: 'La Orotava', region: '카나리아', lat: 28.3903, lon: -16.5232, isHub: false, hub: 'santa-cruz-tenerife', blurb: '카나리아 목조 발코니 저택이 남은 언덕 마을.', transitGuide: walkable() },
  {
    slug: 'las-palmas', title: 'Las Palmas', name: '라스팔마스', nameEn: 'Las Palmas', region: '카나리아',
    lat: 28.1235, lon: -15.4363, isHub: true,
    blurb: '도심에 3km 해변이 붙어 있는 그란카나리아의 수도.',
    dayTrips: [T('maspalomas', 50, '버스', '사막 같은 모래언덕과 등대.')],
    transitGuide: {
      passes: [{ name: 'Guaguas 카드', price: '충전식', note: '시내버스 요금이 절반 가까이 내려갑니다.' }],
      apps: [{ name: 'Guaguas Municipales', note: '시내버스 실시간 도착.' }],
      tips: ['라스 칸테라스 해변은 도심에서 걸어갈 수 있습니다.', '겨울에도 20도 안팎으로 따뜻합니다.'],
    },
  },
  { slug: 'maspalomas', title: 'Maspalomas', name: '마스팔로마스', nameEn: 'Maspalomas', region: '카나리아', lat: 27.7606, lon: -15.5860, isHub: false, hub: 'las-palmas', blurb: '사막처럼 펼쳐진 모래언덕과 등대.', transitGuide: walkable(['모래언덕은 그늘이 없습니다. 한낮은 피하세요.']) },
];

export const ATTRIBUTION = [
  'Wikivoyage (CC BY-SA 4.0)',
  'Wikidata (CC0)',
  'OpenStreetMap contributors (ODbL)',
];
