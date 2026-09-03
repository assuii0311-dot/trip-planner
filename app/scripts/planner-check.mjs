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
import { isMeal, itemMinutes, dailyMinutes } from '../src/lib/capacity.ts';
import { rankAll, RANK_FLOOR } from '../src/lib/rank.ts';
import { buildPlans } from '../src/lib/planner.ts';
import { setIslandRail } from '../src/lib/routing.ts';

const here = (p) => new URL(p, import.meta.url);
const idx = JSON.parse(readFileSync(here('../public/data/spain/index.json'), 'utf8'));
setIslandRail(idx.islands ?? []);
const cities = idx.cities;
const itemCache = new Map();
const itemsOf = (slug) => {
  if (!itemCache.has(slug)) {
    try { itemCache.set(slug, JSON.parse(readFileSync(here(`../public/data/spain/cities/${slug}.json`), 'utf8'))); }
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

/*
 * 새 날 모델이 지키는 것들.
 *
 * 저녁·밤은 언제나 그날 자는 도시에서(합의한 원칙 1), 6분짜리 찌꺼기 구간이
 * 없을 것, 같은 근교를 자투리 때문에 다시 가지 않을 것.
 */
console.log('\n=== 하루 모양 ===');
{
  const slugs = ['madrid', 'toledo', 'segovia', 'seville', 'cordoba', 'granada'];
  const sel = slugs.map((x) => cities.find((c) => c.slug === x)).filter(Boolean);
  const all = slugs.flatMap(itemsOf);
  const priorities = {};
  for (const x of slugs) {
    const list = itemsOf(x).filter((i) => !isMeal(i));
    const ranked = rankAll(list, cities).filter((r) => r.score >= RANK_FLOOR).sort((a, b) => b.score - a.score);
    for (const r of ranked.slice(0, 5)) priorities[r.item.id] = 2;
  }
  const picked = all.filter((i) => priorities[i.id]);
  const itin = buildItinerary(sel, picked, prefs, null, null, cities, {});
  const built = buildPlans({ items: all, itinerary: itin, startDate: '2026-05-04', days: 12,
    prefs, priorities, dayOrder: {}, firstDayStart: null, lastDayEnd: null });

  let badHome = 0, stub = 0, twice = 0, empty = 0;
  for (const plan of built.plans) {
    const seen = new Map();
    for (const d of plan.days) {
      if (!d.entries.length) empty++;
      for (const e of d.entries) {
        if ((e.slot === 'dinner' || e.slot === 'night') && e.item.city !== d.sleepAt) badHome++;
      }
      for (const g of d.segments ?? []) {
        if (g.minutes > 0 && g.minutes < 60) stub++;
        if (g.isDayTrip) {
          const k = `${plan.style}:${g.city}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
      }
    }
    for (const [, n] of seen) if (n > 1) twice++;
  }
  check('저녁과 밤은 언제나 그날 자는 도시에서', badHome === 0, `${badHome}건`);
  check('6분짜리 찌꺼기 구간이 없다', stub === 0, `${stub}건`);
  check('같은 근교를 여러 날 가지 않는다', twice === 0, `${twice}건`);
  check('빈 날이 없다', empty === 0, `${empty}일`);
  check('필요한 날이 여행 일수 안에 든다', built.needDays <= 12, `${built.needDays}일 / 12일`);
}

/*
 * 담은 것이 **말없이** 사라지지 않는가.
 *
 * 톨레도를 3단계에서 담고 경로에도 넣었는데 4단계 상세 일정에는 한 곳도
 * 나오지 않는 일이 있었다. 원인이 셋이었고, 셋 다 '조용히' 가 문제였다.
 *
 *  1. 날을 나누는 쪽(packDays)이 첫날이 짧다는 것을 몰랐다. 18시 착륙이면
 *     첫날은 145분인데 567분짜리 하루로 세고 일을 얹었다. 실제 일정을 짜는
 *     쪽(buildDay)은 시각을 알기 때문에 못 들어간 것을 버렸다 — 아무 말 없이.
 *  2. 근교를 남은 자투리에 밀어 넣었다. 하루를 통째로 주면 다 볼 수 있는
 *     톨레도(왕복 140 + 볼거리 384 = 524 ≤ 567)를 마드리드를 보고 남은
 *     자리에 133분만 넣고, 251분은 '같은 근교는 하루만' 규칙에 걸려 버렸다.
 *  3. 남는 날이 앞 날을 통째로 베껴, 근교 당일치기 날 뒤의 빈 날이
 *     '가는 길도 없는 두 번째 세고비아' 가 되었다.
 *
 * 그래서 결과가 아니라 **약속**을 검사한다. 담은 도시는 상세 일정에 나오거나,
 * 안 나오는 이유가 화면에 말할 수 있는 형태로 남아 있어야 한다 — 날이
 * 모자라거나(overflow), 당일치기로는 거기까지거나(unseen). 조용히 없어지는
 * 것만 실패다. 저녁 도착을 함께 돌린다 — 그게 방아쇠였다.
 */
console.log('\n=== 담은 것이 말없이 사라지지 않는가 ===');
{
  const evening = 20 * 60 + 5;   // 18시 착륙 → 20:05 부터
  const BUDGET = dailyMinutes(prefs);

  function look(slugs, days, firstDayStart, n = 3) {
    const sel = slugs.map((x) => cities.find((c) => c.slug === x)).filter(Boolean);
    if (sel.length !== slugs.length) return null;
    const all = slugs.flatMap(itemsOf);
    const priorities = {};
    for (const x of slugs) {
      const ranked = rankAll(itemsOf(x).filter((i) => !isMeal(i)), cities)
        .filter((r) => r.score >= RANK_FLOOR).sort((a, b) => b.score - a.score);
      for (const r of ranked.slice(0, n)) priorities[r.item.id] = 3;
    }
    const need = (slug) => all
      .filter((i) => i.city === slug && priorities[i.id] && !isMeal(i))
      .reduce((a, i) => a + itemMinutes(i), 0);
    const itin = buildItinerary(sel, all.filter((i) => priorities[i.id]), prefs, null, null, cities, {});
    const built = buildPlans({ items: all, itinerary: itin, startDate: '2027-04-30', days,
      prefs, priorities, dayOrder: {}, firstDayStart, lastDayEnd: null });
    const plan = built.plans[0];

    // (1) 경로에 있고 담은 것이 있는 도시는, 나오거나 이유가 있어야 한다.
    const inRoute = new Set(itin.stops.map((x) => x.city.slug));
    const shown = new Set(plan.days.flatMap((d) => d.entries.map((e) => e.item.city)));
    const told = new Set([...built.overflow.map((o) => o.city), ...built.unseen.keys()]);
    const silent = slugs.filter((x) => inRoute.has(x) && need(x) > 0 && !shown.has(x) && !told.has(x));

    // (2) 하루를 통째로 주면 다 볼 수 있는 근교를 잘라 가지 않는다.
    //     — 이것이 톨레도에 실제로 일어난 일이다.
    const chopped = [];
    for (const t of itin.stops.filter((x) => !x.sleep)) {
      const left = built.unseen.get(t.city.slug) ?? 0;
      const round = Math.round(t.dayTripMin);
      if (left > 0 && round + need(t.city.slug) <= BUDGET) {
        chopped.push(`${t.city.name} ${left}분 남김 (왕복 ${round}+볼거리 ${need(t.city.slug)} ≤ 하루 ${BUDGET})`);
      }
    }

    // (3) 남는 날이 '가지도 않는 근교' 가 되어 있지 않은가.
    const phantom = plan.days.filter((d) => d.isDayTrip && !d.travel
      && !(d.segments ?? []).some((g) => g.isDayTrip)).length;

    return { silent, chopped, phantom };
  }

  // 보고된 그 여행 그대로.
  const reported = ['madrid', 'toledo', 'segovia', 'seville', 'cordoba', 'malaga',
    'ronda', 'nerja', 'granada', 'palma', 'girona', 'barcelona', 'montserrat'];
  for (const [label, start] of [['제한 없음', null], ['저녁 도착', evening]]) {
    const r = look(reported, 16, start);
    check(`보고된 13도시 16일 (${label}) — 말없이 사라진 도시가 없다`,
      !!r && r.silent.length === 0, r ? r.silent.join(', ') : '도시 없음');
    check(`보고된 13도시 16일 (${label}) — 하루면 다 볼 근교를 잘라 가지 않는다`,
      !!r && r.chopped.length === 0, r ? r.chopped.join(' / ') : '도시 없음');
    check(`보고된 13도시 16일 (${label}) — 안 가는 근교 날이 없다`,
      !!r && r.phantom === 0, r ? `${r.phantom}일` : '도시 없음');
  }

  /* 넓게 훑는다. 방아쇠는 '근교를 거느린 거점 + 저녁 도착' 이다. */
  const sets = [
    ['madrid', 'toledo', 'segovia'],
    ['madrid', 'toledo', 'segovia', 'avila'],
    ['seville', 'cordoba', 'granada'],
    ['barcelona', 'girona', 'montserrat', 'sitges'],
    ['malaga', 'ronda', 'nerja'],
    ['madrid', 'toledo', 'seville', 'cordoba'],
    ['barcelona', 'montserrat', 'valencia'],
  ];
  let silent = 0, chopped = 0, phantoms = 0, runs2 = 0;
  const why = [];
  for (const set of sets) {
    for (const days of [set.length, set.length + 2, set.length * 2, set.length * 3]) {
      for (const start of [null, evening, 17 * 60]) {
        for (const n of [2, 3, 5]) {
          const r = look(set, days, start, n);
          if (!r) continue;
          runs2++;
          const tag = `${set.join('+')} ${days}일 상위${n} ${start ? '저녁도착' : '종일'}`;
          if (r.silent.length) { silent++; if (why.length < 4) why.push(`${tag} → ${r.silent.join(',')}`); }
          if (r.chopped.length) { chopped++; if (why.length < 4) why.push(`${tag} → ${r.chopped.join(',')}`); }
          phantoms += r.phantom;
        }
      }
    }
  }
  check(`${runs2}가지 조합에서 말없이 사라지는 도시가 없다`, silent === 0,
    `${silent}가지${why.length ? ` — ${why.join(' / ')}` : ''}`);
  check(`${runs2}가지 조합에서 하루면 다 볼 근교를 잘라 가지 않는다`, chopped === 0,
    `${chopped}가지${why.length ? ` — ${why.join(' / ')}` : ''}`);
  check(`${runs2}가지 조합에 안 가는 근교 날이 없다`, phantoms === 0, `${phantoms}일`);
}

/*
 * 실제로 타는 구간은 모두 안내가 있는가 — 그리고 안내가 같은 모양인가.
 *
 * 두 가지가 보고되었다.
 *
 *  1. 근교 왕복 안내가 도시 간 이동과 다른 모양이고 내용이 모자랐다.
 *     짐을 옮기는 이동은 '몇 시 출발 · 몇 시 탑승 · 몇 시 도착 · 요금 ·
 *     환승 · 대안 수단' 을 다 적었는데, 근교는 머리줄에 '🚄 고속열차 편도
 *     1시간 28분 · 왕복' 한 줄이 전부였다. 실제로 타는 시간은 근교 쪽이 더
 *     긴 날도 있다.
 *  2. 팔마데마요르카 → 지로나 구간의 안내가 아예 없었다. `PackedDay.move`
 *     가 하나뿐이라, 아침에 지로나로 들어와 저녁에 바르셀로나로 다시 옮기는
 *     날에서 뒤엣것이 앞엣것을 **덮어썼다**. 하루가 한 번만 옮긴다는 법이
 *     없다 — 새 날 모델을 만들면서 생긴 일이다.
 *
 * 그래서 약속을 검사한다. 여정에 있는 구간과 근교는 모두 어느 날엔가
 * 안내로 나와야 하고, 그 안내는 짐을 옮기든 아니든 같은 것을 담아야 한다.
 */
console.log('\n=== 타는 구간에 모두 안내가 있는가 ===');
{
  function legs(slugs, days, lodging = {}, firstDayStart = null) {
    const sel = slugs.map((x) => cities.find((c) => c.slug === x)).filter(Boolean);
    if (sel.length !== slugs.length) return null;
    const all = slugs.flatMap(itemsOf);
    const priorities = {};
    for (const x of slugs) {
      const ranked = rankAll(itemsOf(x).filter((i) => !isMeal(i)), cities)
        .filter((r) => r.score >= RANK_FLOOR).sort((a, b) => b.score - a.score);
      for (const r of ranked.slice(0, 3)) priorities[r.item.id] = 3;
    }
    const itin = buildItinerary(sel, all.filter((i) => priorities[i.id]), prefs,
      null, null, cities, { lodging });
    const built = buildPlans({ items: all, itinerary: itin, startDate: '2027-04-30', days,
      prefs, priorities, dayOrder: {}, firstDayStart, lastDayEnd: null });
    const plan = built.plans[0];
    const all2 = plan.days.flatMap((d) => d.travels);

    /*
     * 실제로 타는 이동이 모두 나오는가.
     *
     * 날이 모자라 계획에서 잘려 나간 도시로는 애초에 타고 가지 않는다.
     * 그 구간까지 요구하면 '날이 모자란다' 를 '안내가 없다' 로 잘못 읽는다.
     * 그래서 계획에 실제로 들어간 도시로 가는 구간만 본다.
     */
    const reached = new Set(plan.days.flatMap((d) => [
      ...(d.segments ?? []).map((g) => g.city), d.sleepAt,
    ].filter(Boolean)));
    const moves = new Set(all2.filter((t) => t.kind === 'move').map((t) => `${t.from}>${t.to}`));
    const missMove = itin.hops
      .filter((h) => reached.has(h.from.slug) && reached.has(h.to.slug))
      .filter((h) => !moves.has(`${h.from.slug}>${h.to.slug}`))
      .map((h) => `${h.from.name}→${h.to.name}`);

    // 근교가 모두 나오는가 (일정에 실제로 들어간 근교만)
    const inPlan = new Set(plan.days.flatMap((d) => (d.segments ?? [])
      .filter((g) => g.isDayTrip).map((g) => g.city)));
    const trips = new Set(all2.filter((t) => t.kind === 'daytrip').map((t) => t.to));
    const missTrip = [...inPlan].filter((c) => !trips.has(c))
      .map((c) => cities.find((x) => x.slug === c)?.name ?? c);

    // 안내가 같은 것을 담는가
    const thin = all2.filter((t) => !t.chosen || !t.chosen.label || !t.options.length
      || !Number.isFinite(t.leaveAt) || !Number.isFinite(t.arriveAt) || t.arriveAt <= t.leaveAt)
      .map((t) => `${t.from}→${t.to}(${t.kind})`);

    // 근교는 돌아오는 편까지 있어야 한다 — 일정이 들어간 날이라면.
    const noBack = plan.days.flatMap((d) => d.travels
      .filter((t) => t.kind === 'daytrip' && d.entries.length > 0 && !t.back)
      .map((t) => `${d.dayIndex}일 ${t.to}`));

    // 근교에 닿는 시각과 그날 첫 일정이 어긋나지 않는가
    const early = plan.days.flatMap((d) => {
      const t = d.travels.find((x) => x.kind === 'daytrip');
      if (!t || !d.entries.length) return [];
      const first = d.entries.find((e) => e.item.city === t.to);
      return first && first.startMin < t.arriveAt ? [`${d.dayIndex}일 ${t.to} ${first.startMin}<${t.arriveAt}`] : [];
    });

    return { missMove, missTrip, thin, noBack, early };
  }

  // 보고된 그 여행. 지로나에서 자면 팔마→지로나→바르셀로나가 한 날에 겹친다.
  const reported = ['madrid', 'toledo', 'segovia', 'avila', 'seville', 'cordoba',
    'malaga', 'ronda', 'nerja', 'granada', 'palma', 'girona', 'barcelona', 'montserrat'];
  const r0 = legs(reported, 16, { girona: 'sleep' }, 20 * 60 + 5);
  check('하루에 두 번 옮기는 날도 두 구간 다 안내한다',
    !!r0 && r0.missMove.length === 0, r0 ? r0.missMove.join(', ') : '도시 없음');
  check('근교도 빠짐없이 안내한다', !!r0 && r0.missTrip.length === 0,
    r0 ? r0.missTrip.join(', ') : '도시 없음');
  check('근교 안내도 이동과 같은 것을 담는다', !!r0 && r0.thin.length === 0,
    r0 ? r0.thin.join(', ') : '도시 없음');
  check('근교는 돌아오는 편까지 적는다', !!r0 && r0.noBack.length === 0,
    r0 ? r0.noBack.join(', ') : '도시 없음');
  check('근교에 닿기 전 일정이 잡히지 않는다', !!r0 && r0.early.length === 0,
    r0 ? r0.early.join(', ') : '도시 없음');

  /* 넓게 훑는다 — 섬이 끼면 하루에 두 번 옮기는 날이 잘 나온다. */
  const sets = [
    ['madrid', 'toledo', 'segovia'],
    ['barcelona', 'girona', 'montserrat'],
    ['granada', 'palma', 'barcelona'],
    ['malaga', 'ronda', 'nerja', 'granada'],
    ['seville', 'cordoba', 'madrid', 'toledo'],
    ['valencia', 'palma', 'girona', 'barcelona'],
    ['madrid', 'avila', 'segovia', 'seville', 'granada'],
  ];
  let miss = 0, thin = 0, back = 0, early = 0, runs3 = 0;
  const why3 = [];
  for (const set of sets) {
    for (const days of [set.length + 1, set.length * 2, set.length * 3]) {
      for (const lodging of [{}, Object.fromEntries(set.slice(1).map((c) => [c, 'sleep']))]) {
        for (const start of [null, 20 * 60 + 5]) {
          const r = legs(set, days, lodging, start);
          if (!r) continue;
          runs3++;
          const tag = `${set.join('+')} ${days}일${start ? ' 저녁도착' : ''}`;
          if (r.missMove.length || r.missTrip.length) {
            miss++;
            if (why3.length < 4) why3.push(`${tag} → ${[...r.missMove, ...r.missTrip].join(',')}`);
          }
          if (r.thin.length) { thin++; if (why3.length < 4) why3.push(`${tag} 얇음 ${r.thin.join(',')}`); }
          if (r.noBack.length) { back++; if (why3.length < 4) why3.push(`${tag} 오는편없음 ${r.noBack.join(',')}`); }
          if (r.early.length) { early++; if (why3.length < 4) why3.push(`${tag} 도착전일정 ${r.early.join(',')}`); }
        }
      }
    }
  }
  check(`${runs3}가지 조합에서 타는 구간이 모두 안내된다`, miss === 0,
    `${miss}가지${why3.length ? ` — ${why3.join(' / ')}` : ''}`);
  check(`${runs3}가지 조합에서 안내가 같은 것을 담는다`, thin === 0, `${thin}가지`);
  check(`${runs3}가지 조합에서 근교에 오는 편이 적힌다`, back === 0, `${back}가지`);
  check(`${runs3}가지 조합에서 근교 도착 전 일정이 없다`, early === 0, `${early}가지`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
console.log(failed.length ? '✗ 계획 생성에 끝나지 않는 조합이 있다' : '\n✓ 계획 생성 정상 — 모든 조합이 끝난다');
process.exit(failed.length ? 1 : 0);
