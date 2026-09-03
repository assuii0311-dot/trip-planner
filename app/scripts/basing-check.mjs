/**
 * 거점·당일치기 판정이 상식에 맞는지 본다.
 *
 * 가중평균 모델은 값을 바꾸면 결과가 조용히 달라진다. 그래서 "이건 이렇게
 * 나와야 한다" 를 사람이 아는 사례로 못 박아 둔다.
 */
import { readFile } from 'node:fs/promises';
const index = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const cities = index.cities;
const C = (s) => cities.find((c) => c.slug === s);

const { buildItinerary } = await import('../src/lib/itinerary.ts');
const { scoreBases, BASE_WEIGHTS, DAY_TRIP_MAX_MIN } = await import('../src/lib/basecity.ts');
const { coursesFor, defaultCityDays } = await import('../src/lib/course.ts');
const { inferThemes } = await import('../src/lib/taste.ts');
const { fmtDur } = await import('../src/lib/routing.ts');

const load = async (s) =>
  JSON.parse(await readFile(new URL(`../public/data/spain/cities/${s}.json`, import.meta.url), 'utf8'));

const base = { pace: 3, budget: 'mid', dayStart: 'normal', nightlife: 1, discovery: 2,
  walkTolerance: 3, companion: 'couple', foodStyles: [], mobility: 'normal',
  photo: 2, transport: ['walk', 'metro'], dayTripAppetite: 2 };

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail++;
};

/** 사람이 아는 정답. [도시들, 출발, 도착, 거점이어야 할 곳, 당일치기여야 할 곳] */
const CASES = [
  { name: '마드리드 + 톨레도 + 세고비아', slugs: ['madrid', 'toledo', 'segovia'],
    from: 'madrid', to: 'madrid', bases: ['madrid'], trips: ['toledo', 'segovia'] },
  /*
   * 경계 사례. 세비야→카디스는 문앞~문앞 2시간 17분(열차)이라 왕복 4시간
   * 34분이고, 합의한 한계(편도 120분 / 왕복 4시간)를 넘는다. 그래서 카디스는
   * 스스로 잔다. 코르도바는 1시간 22분이라 흡수된다.
   * 카디스까지 당일치기로 묶고 싶으면 DAY_TRIP_MAX_MIN 을 140 으로 올리면 된다.
   */
  { name: '세비야 + 코르도바 + 카디스 (카디스는 한계 밖)', slugs: ['seville', 'cordoba', 'cadiz'],
    from: 'seville', to: 'seville', bases: ['seville', 'cadiz'], trips: ['cordoba'] },
  { name: '바르셀로나 + 지로나 + 몬세라트', slugs: ['barcelona', 'girona', 'montserrat'],
    from: 'barcelona', to: 'barcelona', bases: ['barcelona'], trips: ['girona', 'montserrat'] },
  { name: '마드리드 + 바르셀로나 (둘 다 거점)', slugs: ['madrid', 'barcelona'],
    from: 'madrid', to: 'barcelona', bases: ['madrid', 'barcelona'], trips: [] },
  { name: '마드리드 + 세비야 + 그라나다 (멀어서 각각)', slugs: ['madrid', 'seville', 'granada'],
    from: 'madrid', to: 'granada', bases: ['madrid', 'seville', 'granada'], trips: [] },
  { name: '말라가 + 론다 + 네르하', slugs: ['malaga', 'ronda', 'nerja'],
    from: 'malaga', to: 'malaga', bases: ['malaga'], trips: ['ronda', 'nerja'] },
];

console.log(`가중치 ${JSON.stringify(BASE_WEIGHTS)} · 당일치기 편도 한계 ${DAY_TRIP_MAX_MIN}분\n`);

for (const c of CASES) {
  const sel = c.slugs.map(C).filter(Boolean);
  if (sel.length !== c.slugs.length) { console.log(`(건너뜀: ${c.name})`); continue; }
  const prefs = { ...base, themes: inferThemes(sel) };
  const picked = [];
  for (const city of sel) {
    const cs = coursesFor(city, await load(city.slug), prefs, defaultCityDays(city));
    if (cs.length) picked.push(...cs[0].items);
  }
  const it = buildItinerary(sel, picked, prefs, c.from, c.to, cities);
  const gotBases = it.stops.filter((s) => s.sleep).map((s) => s.city.slug);
  const gotTrips = it.stops.filter((s) => !s.sleep).map((s) => s.city.slug);

  console.log(`■ ${c.name}`);
  for (const s of it.stops) {
    console.log(`    ${s.city.name.padEnd(9)} ${s.sleep ? `🛏 ${s.nights}박` : `← ${C(s.base)?.name} 당일치기 왕복 ${fmtDur(s.dayTripMin)}`}`);
  }
  const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  check(same(gotBases, c.bases), '거점이 기대와 같다',
    `${gotBases.map((s) => C(s).name).join('·')} (기대 ${c.bases.map((s) => C(s).name).join('·')})`);
  check(same(gotTrips, c.trips), '당일치기가 기대와 같다',
    gotTrips.length ? gotTrips.map((s) => C(s).name).join('·') : '없음');

  // 있지도 않은 소도시 간 구간이 생기지 않았는가
  const phantom = it.hops.filter((h) => c.trips.includes(h.from.slug) || c.trips.includes(h.to.slug));
  void 0;
  check(phantom.length === 0, '당일치기 도시 사이 구간이 없다',
    phantom.map((h) => `${h.from.name}→${h.to.name}`).join(', ') || `이동 ${it.hops.length}구간`);
  console.log('');
}

console.log('■ 점수 내역 — 마드리드 + 톨레도 + 세고비아');
{
  const sel = ['madrid', 'toledo', 'segovia'].map(C);
  const m = new Map();
  for (const city of cities) for (const d of city.dayTrips) {
    const k = city.slug < d.city ? `${city.slug}|${d.city}` : `${d.city}|${city.slug}`;
    m.set(k, { minutes: d.transitMin, mode: d.mode });
  }
  for (const s of scoreBases(sel, () => 1, m, ['madrid', 'madrid'])) {
    const p = s.parts;
    console.log(`  ${s.city.name.padEnd(9)} 총점 ${s.total.toFixed(3)}`
      + ` | 허브 ${p.reach.toFixed(2)} 저녁 ${p.evening.toFixed(2)} 숙박 ${p.lodging.toFixed(2)}`
      + ` 다음 ${p.onward.toFixed(2)} 분량 ${p.volume.toFixed(2)}`);
  }
}

console.log(fail === 0 ? '\n✓ 거점 판정 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
