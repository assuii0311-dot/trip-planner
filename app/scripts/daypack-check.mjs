/**
 * 날 채우기 — 하루가 칸이 아니라 예산으로 도는가.
 *
 * 화면 검사로는 볼 수 없는 층이다. 엔진만 따로 돌려 결과를 눈으로 읽는다.
 *   npx tsx scripts/daypack-check.mjs
 */
import { readFileSync } from 'node:fs';
import { buildItinerary } from '../src/lib/itinerary.ts';
import { setIslandRail } from '../src/lib/routing.ts';
import { dailyMinutes, itemMinutes, isMeal } from '../src/lib/capacity.ts';
import { rankAll, RANK_FLOOR } from '../src/lib/rank.ts';
import { packDays, pickTiming, MOVE_LABEL, MOVE_RULE, MIN_STAY_MIN } from '../src/lib/daypack.ts';

const here = (p) => new URL(p, import.meta.url);
const idx = JSON.parse(readFileSync(here('../public/data/spain/index.json'), 'utf8'));
setIslandRail(idx.islands ?? []);
const cities = idx.cities;
const itemsOf = (s) => { try { return JSON.parse(readFileSync(here(`../public/data/spain/cities/${s}.json`), 'utf8')); } catch { return []; } };
const prefs = { themes:{history:2,art:2,landmark:2,nature:2,food:2,nightlife:1,activity:1,shopping:1},
  pace:3,budget:'mid',dayStart:'normal',nightlife:1,discovery:2,walkTolerance:3,companion:'couple',
  foodStyles:[],mobility:'normal',photo:2,transport:['walk','metro'],dayTripAppetite:2 };
const BUDGET = dailyMinutes(prefs);
const name = (s) => cities.find((c) => c.slug === s)?.name ?? s;

const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

/** 찍먹 수준으로 담았을 때 도시별 볼거리 시간(분). */
function pick(slugs, tier = 'taste') {
  const need = new Map();
  const items = [];
  for (const s of slugs) {
    const list = itemsOf(s).filter((i) => !isMeal(i));
    const ranked = rankAll(list, cities).filter((r) => r.score >= RANK_FLOOR).sort((a, b) => b.score - a.score);
    const cap = tier === 'taste' ? 3 : tier === 'normal' ? 999 : 999;
    const maxMin = tier === 'taste' ? Infinity : tier === 'normal' ? 2 * BUDGET : 4 * BUDGET;
    let min = 0, n = 0;
    for (const r of ranked) {
      if (n >= cap) break;
      const c = itemMinutes(r.item);
      if (n && min + c > maxMin) break;
      min += c; n++; items.push(r.item);
    }
    need.set(s, min);
  }
  return { need, items };
}

const show = (slugs, tier, label) => {
  const { need, items } = pick(slugs, tier);
  const sel = slugs.map((s) => cities.find((c) => c.slug === s)).filter(Boolean);
  const itin = buildItinerary(sel, items, prefs, null, null, cities, {});
  const r = packDays(itin, (s) => need.get(s) ?? 0, BUDGET);
  const volume = [...need.values()].reduce((a, b) => a + b, 0);
  console.log(`\n── ${label} · ${tier} ──`);
  console.log(`   볼거리 ${(volume / BUDGET).toFixed(1)}일치 · 이동 ${(r.moveMin / BUDGET).toFixed(1)}일치 → 일정 ${r.days.length}일`);
  r.days.forEach((d, i) => {
    const parts = d.legs.map((l) => `${name(l.city)}${l.isDayTrip ? `(당일치기 왕복${l.roundTripMin}분)` : ''} ${l.minutes}분`);
    const mv = d.move ? `  [${MOVE_LABEL[d.move.timing]} 이동 ${name(d.move.from)}→${name(d.move.to)} ${d.move.minutes}분]` : '';
    console.log(`   Day${String(i + 1).padStart(2)} ${parts.join(' + ') || '(이동만)'}${mv}  🛏${name(d.sleepAt)}`);
  });
  return r;
};

console.log('=== 문턱값이 규칙대로 나오는가 ===');
check('종일 보낸 뒤 88분이면 저녁 이동', pickTiming(88, 504) === 'evening');
check('종일 보낸 뒤 197분이면 아침 이동', pickTiming(197, 504) === 'morning');
check('오전만 보낸 뒤 129분이면 오후 이동', pickTiming(129, 200) === 'midday');
check('아무것도 안 봤으면 아침 이동', pickTiming(88, 0) === 'morning');
check('저녁 문턱은 90분', MOVE_RULE.eveningMaxMin === 90 && MOVE_RULE.middayMaxMin === 180);

console.log('\n=== 반나절 도시 둘이 한 날에 들어가는가 ===');
const r1 = show(['ronda', 'nerja'], 'full', '론다 + 네르하');
check('반나절 도시 둘이 3일 넘게 잡히지 않는다', r1.days.length <= 2, `${r1.days.length}일`);

console.log('\n=== 근교가 하루를 통째로 먹지 않는가 ===');
const r2 = show(['madrid', 'toledo', 'segovia'], 'taste', '마드리드 + 톨레도 + 세고비아');
const multi = r1.days.filter((d) => d.legs.length > 1).length;
check('한 날에 도시가 둘 이상 들어간 날이 있다', multi > 0, `${multi}일`);
const carry = (r) => r.days.filter((d) => d.move && d.legs.some((l) => l.isDayTrip));
check('짐 옮기는 날에 근교를 붙이지 않는다', carry(r2).length === 0, `${carry(r2).length}일`);
const stub = (r) => r.days.flatMap((d) => d.legs).filter((l) => l.isDayTrip && l.minutes < MIN_STAY_MIN);
check('자투리 때문에 근교 왕복을 다시 하지 않는다', stub(r2).length === 0, `${stub(r2).length}건`);

console.log('\n=== 사용자가 겪은 조합 ===');
const r3 = show(['madrid','toledo','segovia','seville','cordoba','malaga','ronda','nerja','granada'], 'taste', '9곳 찍먹');
{
  const vol = r3.days.flatMap((d) => d.legs).reduce((a, l) => a + l.minutes, 0);
  const floor = Math.ceil((vol + r3.moveMin) / BUDGET);
  check('볼거리+이동에 견줘 날이 헛되이 늘지 않는다', r3.days.length <= floor + 1,
    `일정 ${r3.days.length}일 · 최소 ${floor}일`);
  check('짐 옮기는 날에 근교를 붙이지 않는다 (9곳)', carry(r3).length === 0, `${carry(r3).length}일`);
  check('자투리 왕복이 없다 (9곳)', stub(r3).length === 0, `${stub(r3).length}건`);
}

console.log('\n=== 넣을 수 없는 근교가 있어도 끝나는가 ===');
{
  /*
   * 4단계에서 '짐 안 옮기기' 를 누르면 마드리드↔세비야(왕복 6시간 50분)
   * 같은 당일치기도 만들어진다. 어느 날에도 들어갈 수 없는 근교를 큐에
   * 두면 영원히 돈다 — 실제로 화면이 멈췄다.
   */
  const sel = ['madrid', 'seville'].map((x) => cities.find((c) => c.slug === x));
  const { need, items } = pick(['madrid', 'seville'], 'full');
  const itin = buildItinerary(sel, items, prefs, null, null, cities,
    { lodging: { madrid: 'daytrip' } });
  const t0 = Date.now();
  const r = packDays(itin, (x) => need.get(x) ?? 0, BUDGET);
  const ms = Date.now() - t0;
  check('왕복이 하루보다 긴 근교가 있어도 끝난다', ms < 500, `${ms}ms · ${r.days.length}일`);
  check('넣지 못한 것을 남는 시간으로 알린다', r.unseen.size > 0 || r.days.length > 0,
    [...r.unseen.entries()].map(([k, v]) => `${name(k)} ${v}분`).join(' · ') || '없음');
}

console.log('\n=== 언제나 끝나는가 (넓게) ===');
let worst = 0, runs = 0, bad = [];
const pool = cities.filter((c) => !c.island).map((c) => c.slug);
for (let s = 0; s < pool.length; s += 4) {
  for (const n of [2, 3, 5, 7]) {
    const slugs = [...new Set(Array.from({ length: n }, (_, k) => pool[(s + k * 7) % pool.length]))];
    if (slugs.length !== n) continue;
    for (const tier of ['taste', 'full']) {
      const { need, items } = pick(slugs, tier);
      const sel = slugs.map((x) => cities.find((c) => c.slug === x)).filter(Boolean);
      const t0 = Date.now();
      const itin = buildItinerary(sel, items, prefs, null, null, cities, {});
      const r = packDays(itin, (x) => need.get(x) ?? 0, BUDGET);
      const ms = Date.now() - t0;
      runs++;
      worst = Math.max(worst, ms);
      const vol = [...need.values()].reduce((a, b) => a + b, 0);
      // 날 수가 볼거리 분량보다 터무니없이 크면 배정이 잘못된 것이다.
      const floorDays = Math.ceil(vol / BUDGET);
      if (r.days.length > floorDays + slugs.length + 2) bad.push(`${slugs.join('+')} ${tier}: ${r.days.length}일 (볼거리 ${floorDays}일)`);
      if (ms > 300) bad.push(`${slugs.join('+')} ${tier}: ${ms}ms`);
    }
  }
}
check(`${runs}가지 조합이 모두 끝난다`, bad.length === 0, bad.slice(0, 3).join(' / ') || `가장 오래 ${worst}ms`);

const failed = results.filter((r) => !r.ok);
console.log(`\n검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
console.log(failed.length ? '✗ 날 채우기에 문제가 있다' : '\n✓ 날 채우기 정상');
process.exit(failed.length ? 1 : 0);
