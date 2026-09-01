/**
 * 데이터 양의 하한을 실측한다.
 *
 * "거점 40개, 근교 22개"는 계산으로 유도했을 뿐 검증한 적이 없다.
 * 무작위 여행 조합을 대량으로 만들어 계획을 생성하고, 아이템 수를 줄여가며
 * 어디서 계획이 무너지는지 본다. 무너지는 지점이 진짜 하한이다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { City, Item, Preferences, Priorities, ThemeId } from '../src/types';
import { assignBases } from '../src/lib/basing';
import { buildPlans } from '../src/lib/planner';
import { rankItems } from '../src/lib/scoring';
import { inferThemes } from '../src/lib/taste';

const DATA = join(process.cwd(), 'public', 'data');
const index = JSON.parse(readFileSync(join(DATA, 'spain.json'), 'utf8')) as { cities: City[] };
const itemsByCity = new Map<string, Item[]>();
for (const f of readdirSync(join(DATA, 'cities'))) {
  if (!f.endsWith('.json')) continue;
  itemsByCity.set(f.replace('.json', ''), JSON.parse(readFileSync(join(DATA, 'cities', f), 'utf8')));
}

/** 재현 가능한 난수. 같은 시드로 돌리면 같은 결과가 나온다. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

function randomPrefs(r: () => number, themes: Record<ThemeId, number>): Preferences {
  return {
    themes,
    pace: 1 + Math.floor(r() * 5),
    budget: pick(['low', 'mid', 'high'] as const, r),
    dayStart: pick(['early', 'normal', 'late'] as const, r),
    nightlife: Math.floor(r() * 4),
    discovery: Math.floor(r() * 4),
    walkTolerance: 1 + Math.floor(r() * 5),
    companion: pick(['solo', 'couple', 'friends', 'family', 'parents'] as const, r),
    foodStyles: r() > 0.5 ? ['local'] : [],
    mobility: r() > 0.85 ? 'limited' : 'normal',
    photo: Math.floor(r() * 4),
    transport: ['walk', 'metro'],
    dayTripAppetite: Math.floor(r() * 4),
  };
}

/** 아이템을 도시별로 비율만큼 남긴다. 품질이 높은 순으로 자른다. */
function trim(items: Item[], ratio: number): Item[] {
  if (ratio >= 1) return items;
  const byCity = new Map<string, Item[]>();
  for (const it of items) {
    const list = byCity.get(it.city) ?? [];
    list.push(it);
    byCity.set(it.city, list);
  }
  const out: Item[] = [];
  for (const list of byCity.values()) {
    const sorted = [...list].sort((a, b) => b.popularity - a.popularity || b.why.length - a.why.length);
    out.push(...sorted.slice(0, Math.max(1, Math.round(sorted.length * ratio))));
  }
  return out;
}

/**
 * 자카드 유사도. 교집합을 작은 쪽 크기로 나누면 여유형이 알찬형의 부분집합일
 * 때 항상 100%가 나와 아무것도 알려 주지 않는다. 합집합으로 나눠야 크기 차이가
 * 반영된다.
 */
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 0;
  let hit = 0;
  a.forEach((x) => { if (b.has(x)) hit++; });
  return hit / (a.size + b.size - hit);
};

interface Result {
  fillRate: number;
  overlapRate: number;
  /** 여유형에만 있고 알찬형에는 없는 항목 수. 옵션이 정말 다른지 본다. */
  uniqueToRelaxed: number;
  topThemeShare: number;
  kmPerDay: number;
  emptyDays: number;
  droppedTrips: number;
  /** 이 여행에 쓰인 도시 중 아이템이 가장 적은 도시의 개수. */
  smallestCity: number;
}

function runOne(seed: number, ratio: number): Result | null {
  const r = rng(seed);
  const cities = index.cities;
  const count = 1 + Math.floor(r() * 4);
  const chosen: City[] = [];
  while (chosen.length < count) {
    const c = pick(cities, r);
    if (!chosen.some((x) => x.slug === c.slug)) chosen.push(c);
  }
  const days = 3 + Math.floor(r() * 12);
  // 아이템을 줄일 때 도시의 itemCount 도 함께 줄여야 한다. 반나절 근교 판정이
  // 이 값을 보기 때문에, 그대로 두면 줄인 효과가 계획에 반영되지 않는다.
  const scaled = cities.map((c) => ({
    ...c,
    itemCount: Math.max(1, Math.round((itemsByCity.get(c.slug)?.length ?? c.itemCount) * ratio)),
  }));
  const scaledChosen = chosen.map((c) => scaled.find((x) => x.slug === c.slug)!);
  const groups = assignBases(scaledChosen, scaled, days);

  const scope = new Set<string>();
  chosen.forEach((c) => scope.add(c.slug));
  groups.forEach((g) => { scope.add(g.base.slug); g.dayTrips.forEach((t) => scope.add(t.city.slug)); });

  const items = trim([...scope].flatMap((s) => itemsByCity.get(s) ?? []), ratio);
  void cities;
  if (items.length === 0) return null;

  const prefs = randomPrefs(r, inferThemes(chosen));

  // 4단계 우선순위는 상위 항목을 담는 것으로 흉내 낸다.
  const priorities: Priorities = {};
  for (const { item } of rankItems(items, prefs, {}).slice(0, Math.max(6, days * 2))) {
    priorities[item.id] = 2;
  }

  const { plans, dropped } = buildPlans({
    items, groups, startDate: '2026-05-01', days, prefs, priorities,
  });

  const packed = plans.find((p) => p.style === 'packed')!;
  const balanced = plans.find((p) => p.style === 'balanced')!;
  const relaxed = plans.find((p) => p.style === 'relaxed')!;

  // 알찬형 기준 하루 6칸(식사 2 + 활동 4)을 채워야 할 몫으로 본다.
  const expected = days * 6;
  const fillRate = Math.min(1, packed.stats.items / expected);

  const setOf = (p: typeof packed) => new Set(p.days.flatMap((d) => d.entries.map((e) => e.item.id)));
  const packedSet = setOf(packed);
  const relaxedSet = setOf(relaxed);
  const overlapRate = (jaccard(packedSet, setOf(balanced)) + jaccard(setOf(balanced), relaxedSet)) / 2;
  let uniqueToRelaxed = 0;
  relaxedSet.forEach((id) => { if (!packedSet.has(id)) uniqueToRelaxed++; });

  const mix = Object.values(packed.stats.themeMix) as number[];
  const total = mix.reduce((a, b) => a + b, 0) || 1;
  const topThemeShare = Math.max(...mix, 0) / total;

  const counts = [...scope].map((s) => (itemsByCity.get(s) ?? []).length).filter((n) => n > 0);
  const smallestCity = Math.max(1, Math.round(Math.min(...counts) * ratio));

  return {
    fillRate,
    overlapRate,
    uniqueToRelaxed,
    smallestCity,
    topThemeShare,
    kmPerDay: packed.stats.walkKm / days,
    emptyDays: packed.days.filter((d) => d.entries.length === 0).length,
    droppedTrips: dropped.length,
  };
}

const RUNS = Number(process.env.RUNS ?? 500);
const RATIOS = [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2];

console.log(`무작위 여행 ${RUNS}건 × 데이터 비율 ${RATIOS.length}단계\n`);
console.log('비율  아이템/도시  슬롯충족  옵션중복  여유형고유  최대테마  이동km/일  빈일자');
console.log('─'.repeat(82));

const all: Result[] = [];
for (const ratio of RATIOS) {
  const rows: Result[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = runOne(1000 + i, ratio);
    if (r) rows.push(r);
  }
  const avg = (f: (x: Result) => number) => rows.reduce((a, x) => a + f(x), 0) / rows.length;
  const perCity = Math.round(
    [...itemsByCity.values()].reduce((a, l) => a + Math.max(1, Math.round(l.length * ratio)), 0) / itemsByCity.size,
  );
  console.log(
    `${String(Math.round(ratio * 100)).padStart(3)}%  ${String(perCity).padStart(9)}`
    + `  ${(avg((x) => x.fillRate) * 100).toFixed(0).padStart(7)}%`
    + `  ${(avg((x) => x.overlapRate) * 100).toFixed(0).padStart(7)}%`
    + `  ${avg((x) => x.uniqueToRelaxed).toFixed(1).padStart(9)}`
    + `  ${(avg((x) => x.topThemeShare) * 100).toFixed(0).padStart(7)}%`
    + `  ${avg((x) => x.kmPerDay).toFixed(1).padStart(8)}`
    + `  ${avg((x) => x.emptyDays).toFixed(2).padStart(6)}`,
  );
  all.push(...rows);
}

// ── 도시 크기별 분석 ──────────────────────────────────────
// 평균은 작은 도시에서 계획이 무너지는 것을 감춘다.
// 실제로 필요한 것은 "도시 하나에 최소 몇 개"인지다.
console.log('\n가장 작은 도시의 아이템 수별 결과');
console.log('아이템수      표본   슬롯충족   빈일자   빈일자 1일 이상 비율');
console.log('─'.repeat(66));
const buckets: [number, number][] = [[1, 9], [10, 14], [15, 19], [20, 24], [25, 29], [30, 39], [40, 999]];
for (const [lo, hi] of buckets) {
  const rows = all.filter((x) => x.smallestCity >= lo && x.smallestCity <= hi);
  if (rows.length < 20) continue;
  const avg = (f: (x: Result) => number) => rows.reduce((a, x) => a + f(x), 0) / rows.length;
  const badRate = rows.filter((x) => x.emptyDays >= 1).length / rows.length;
  const label = hi === 999 ? `${lo}개 이상` : `${lo}~${hi}개`;
  console.log(
    `${label.padEnd(12)}${String(rows.length).padStart(5)}`
    + `  ${(avg((x) => x.fillRate) * 100).toFixed(0).padStart(7)}%`
    + `  ${avg((x) => x.emptyDays).toFixed(2).padStart(7)}`
    + `  ${(badRate * 100).toFixed(0).padStart(15)}%`,
  );
}
