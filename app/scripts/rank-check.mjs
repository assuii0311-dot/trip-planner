/**
 * 순위·등급·미식 예외가 상식에 맞는지 검사한다.
 *
 * 가중치를 한 숫자만 바꿔도 결과가 조용히 달라지므로, 사람이 아는 사례로
 * 못 박아 둔다.
 */
import { readFile } from 'node:fs/promises';
const idx = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const load = async (s) => JSON.parse(await readFile(new URL(`../public/data/spain/cities/${s}.json`, import.meta.url), 'utf8'));
const { rankAll, RANK_WEIGHTS, RANK_FLOOR, TIER_MAX_DAYS } = await import('../src/lib/rank.ts');
const { coursesFor, cityWorthDays } = await import('../src/lib/course.ts');
const { estimateDays, isMeal } = await import('../src/lib/capacity.ts');
const { inferThemes } = await import('../src/lib/taste.ts');

const base = { pace: 3, budget: 'mid', dayStart: 'normal', nightlife: 1, discovery: 2,
  walkTolerance: 3, companion: 'couple', foodStyles: [], mobility: 'normal',
  photo: 2, transport: ['walk', 'metro'], dayTripAppetite: 2 };

let fail = 0;
const ok = (c, label, detail = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!c) fail++;
};

let all = [];
for (const c of idx.cities) { try { all.push(...await load(c.slug)); } catch {} }
const ranked = rankAll(all, idx.cities);
const at = (name) => ranked.find((r) => r.item.name.includes(name));

console.log(`가중치 ${JSON.stringify(RANK_WEIGHTS)} · 기준선 ${RANK_FLOOR} · 상한 ${JSON.stringify(TIER_MAX_DAYS)}`);

console.log('\n=== 전체 순위 ===');
console.log(ranked.slice(0, 8).map((r, i) => `  ${i + 1}. ${r.item.name}`).join('\n'));
const top20 = new Set(ranked.slice(0, 20).map((r) => r.item.name));
for (const n of ['사그라다 파밀리아', '프라도 미술관', '세비야 대성당', '레알 알카사르', '알함브라 궁전']) {
  ok([...top20].some((x) => x.includes(n)), `${n} 이 전국 상위 20 안에 있다`);
}

console.log('\n=== 유명하지만 관광지는 아닌 곳 ===');
for (const [n, limit] of [['캄 노우', 60], ['스페인 왕립 학술원', 200], ['라 로살레다', 300]]) {
  const r = at(n);
  ok(!r || r.rank > limit, `${n} 이 ${limit}위 밖으로 내려간다`, r ? `${r.rank}위` : '없음');
}
console.log('  (보정에서 지켜져야 하는 곳)');
for (const [n, limit] of [['산 파우 병원', 200], ['산 페르난도 왕립미술아카데미', 300]]) {
  const r = at(n);
  ok(!r || r.rank <= limit, `${n} 은 그대로 남는다`, r ? `${r.rank}위` : '없음');
}

console.log('\n=== 도시별 등급 ===');
const EXPECT = {
  madrid: [3, 4], barcelona: [3, 4], seville: [3, 4],
  granada: [2, 3.5], toledo: [1, 2.5], cordoba: [1, 2],
  segovia: [0.5, 1.5], ronda: [0.4, 1.5], nerja: [0.2, 1],
};
for (const [slug, [lo, hi]] of Object.entries(EXPECT)) {
  const city = idx.cities.find((c) => c.slug === slug);
  const items = await load(slug);
  const prefs = { ...base, themes: inferThemes([city]) };
  const cs = coursesFor(city, items, prefs, idx.cities);
  const full = cs.find((c) => c.id === 'full');
  ok(full && full.days >= lo && full.days <= hi,
    `${city.name} 꽉찬 코스가 ${lo}~${hi}일`, full ? `${full.items.length}곳 ${full.days}일` : '없음');
  // 등급이 서로 다른 목록이어야 한다
  const sizes = cs.map((c) => c.items.length);
  ok(new Set(sizes).size === sizes.length, `${city.name} 등급끼리 겹치지 않는다`,
    cs.map((c) => `${c.title} ${c.items.length}곳`).join(' · '));
  // 코스에 미식이 없어야 한다
  ok(cs.every((c) => c.items.every((i) => !isMeal(i))), `${city.name} 코스에 식사가 없다`);
}

console.log('\n=== 미식 예외 ===');
{
  const city = idx.cities.find((c) => c.slug === 'seville');
  const items = await load('seville');
  const prefs = { ...base, themes: inferThemes([city]) };
  const sights = coursesFor(city, items, prefs, idx.cities)[0].items;
  const meals = items.filter(isMeal);
  const a = estimateDays(sights, prefs);
  const b = estimateDays([...sights, ...meals], prefs);
  ok(a === b, '식당을 아무리 담아도 소요 일수가 그대로다',
    `볼거리만 ${a}일 · 식당 ${meals.length}곳 더해도 ${b}일`);
  const worth = cityWorthDays(city, items, prefs, idx.cities);
  ok(worth > 0 && worth < 6, '도시 값어치가 계산된다', `세비야 ${worth}일치`);
  // 간식은 세어야 한다
  const snacks = items.filter((i) => i.theme === 'food' && !isMeal(i));
  if (snacks.length) {
    ok(estimateDays([...sights, ...snacks], prefs) > a, '간식은 일정으로 센다',
      `${snacks.length}곳 — ${snacks.map((i) => i.name).join(', ')}`);
  } else {
    console.log('     (세비야에 간식 항목이 없어 건너뜀)');
  }
}

console.log(fail === 0 ? '\n✓ 순위·등급 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
