/**
 * 계획 생성이 반드시 끝나는가 — 그리고 얼마나 걸리는가.
 *
 * 아이패드에서 '화면이 잘리면서 멈춤 / 검은 화면 / 클릭 불가' 로 보고된 것의
 * 정체는 planner 의 무한 루프였다. 남는 날을 숙박지에 나눠 주는 자리에서,
 * 배부른 도시를 후보에서 빼지 않고 가중치만 낮춘 채 `continue` 했는데
 * `continue` 는 남은 날을 줄이지 않는다. 다른 도시가 하루라도 받으면 점수가
 * 음수로 내려가고, 가중치를 낮춘 배부른 도시가 다시 1등이 되어 영원히 돈다.
 *
 *   바르셀로나(6박·볼거리 3일치) + 발렌시아(2박·2일치) · 10일 → 끝나지 않음
 *
 * 화면 검사로는 이걸 못 잡는다. 브라우저가 멈춰 버리므로 검사도 함께 멈춘다.
 * 그래서 엔진만 따로 돌려 **시간 예산**을 건다.
 *
 *   node scripts/planner-check.mjs   (npx tsx 로 실행)
 */
import { readFileSync } from 'node:fs';
import { buildItinerary } from '../src/lib/itinerary.ts';
import { buildPlans } from '../src/lib/planner.ts';
import { setIslandRail } from '../src/lib/routing.ts';

const here = (p) => new URL(p, import.meta.url);
const idx = JSON.parse(readFileSync(here('../public/data/spain.json'), 'utf8'));
setIslandRail(idx.islands ?? []);
const cities = idx.cities;
const itemCache = new Map();
const itemsOf = (slug) => {
  if (!itemCache.has(slug)) {
    try { itemCache.set(slug, JSON.parse(readFileSync(here(`../public/data/cities/${slug}.json`), 'utf8'))); }
    catch { itemCache.set(slug, []); }
  }
  return itemCache.get(slug);
};
const prefs = {
  themes: { history: 2, art: 2, landmark: 2, nature: 2, food: 2, nightlife: 1, activity: 1, shopping: 1 },
  pace: 3, budget: 'mid', dayStart: 'normal', nightlife: 1, discovery: 2, walkTolerance: 3,
  companion: 'couple', foodStyles: [], mobility: 'normal', photo: 2,
  transport: ['walk', 'metro'], dayTripAppetite: 2,
};

/** 한 번 만드는 데 이보다 오래 걸리면 사람이 쓸 수 없다(모바일은 더 느리다). */
const BUDGET_MS = 400;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`  ✗ ${name} — ${detail}`);
};

function once(slugs, days) {
  const sel = slugs.map((s) => cities.find((c) => c.slug === s)).filter(Boolean);
  if (sel.length !== slugs.length) return null;
  const items = slugs.flatMap(itemsOf);
  const a = process.hrtime.bigint();
  const itin = buildItinerary(sel, [], prefs, null, null, cities, {});
  const plans = buildPlans({
    items, itinerary: itin, startDate: '2026-05-04', days,
    prefs, priorities: {}, dayOrder: {}, firstDayStart: null, lastDayEnd: null,
  });
  return { ms: Number(process.hrtime.bigint() - a) / 1e6, plans, itin };
}

console.log('=== 보고된 그 조합 ===');
{
  const r = once(['barcelona', 'girona', 'figueres', 'valencia', 'sitges'], 10);
  check('바르셀로나+지로나+피게레스+발렌시아+시체스 · 10일이 끝난다',
    !!r && r.ms < BUDGET_MS, r ? `${r.ms.toFixed(1)}ms` : '도시 없음');
  if (r) console.log(`  ✓ ${r.ms.toFixed(1)}ms · 계획 ${r.plans.plans.length}안`);
}

/*
 * 무한 루프의 조건은 '배부른 도시와 아직 배부르지 않은 도시가 섞여 있고,
 * 남는 날이 있는 것' 이다. 그런 조합은 특별하지 않다 — 넓게 훑는다.
 */
console.log('\n=== 넓게 훑기 ===');
const pool = cities.filter((c) => !c.island).map((c) => c.slug);
let worst = { ms: 0, what: '' };
let runs = 0;
let slow = 0;

// 서로 다른 성격이 섞이도록 간격을 두고 뽑는다.
for (let start = 0; start < pool.length; start += 3) {
  for (const n of [2, 3, 5, 7]) {
    const slugs = [];
    for (let k = 0; k < n; k++) slugs.push(pool[(start + k * 7) % pool.length]);
    const uniq = [...new Set(slugs)];
    if (uniq.length !== n) continue;
    for (const days of [n + 1, n * 2, n * 3 + 2]) {
      const r = once(uniq, days);
      if (!r) continue;
      runs++;
      if (r.ms > worst.ms) worst = { ms: r.ms, what: `${uniq.join('+')} · ${days}일` };
      if (r.ms > BUDGET_MS) {
        slow++;
        check(`${uniq.join('+')} · ${days}일`, false, `${r.ms.toFixed(0)}ms (예산 ${BUDGET_MS}ms)`);
      }
      // 일정이 여행 일수와 맞는가 — 루프가 일찍 끊기면 여기서 드러난다.
      const total = r.plans.plans[0]?.days.length ?? 0;
      if (total !== days) {
        check(`${uniq.join('+')} · ${days}일 일정 길이`, false, `${total}일이 나왔다`);
      }
    }
  }
}
check(`${runs}가지 조합이 모두 예산 안에 끝난다`, slow === 0, `느린 것 ${slow}가지`);
console.log(`  훑은 조합 ${runs}가지 · 가장 오래 걸린 것 ${worst.ms.toFixed(1)}ms (${worst.what})`);

const failed = results.filter((r) => !r.ok);
console.log(`\n검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
console.log(failed.length ? '✗ 계획 생성에 끝나지 않는 조합이 있다' : '\n✓ 계획 생성 정상 — 모든 조합이 끝난다');
process.exit(failed.length ? 1 : 0);
