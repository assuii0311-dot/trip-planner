/** orderCities 가 정말 최소인지, 모든 순열을 다 세어 확인한다. */
import { readFile } from 'node:fs/promises';
const index = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const C = (s) => index.cities.find((c) => c.slug === s);
const { orderCities, measuredTable } = await import('../src/lib/itinerary.ts');
const { fastest, fmtDur } = await import('../src/lib/routing.ts');
const measured = measuredTable(index.cities);
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const leg = (a, b) => fastest(a, b, measured.get(key(a.slug, b.slug))).totalMin;
const cost = (path, back) => {
  let t = 0;
  for (let i = 1; i < path.length; i++) t += leg(path[i - 1], path[i]);
  if (back) t += leg(path[path.length - 1], back);
  return t;
};
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));

const cases = [
  { slugs: ['barcelona','seville','bilbao'], start: null, end: null },
  { slugs: ['barcelona','seville','bilbao','madrid'], start: null, end: null },
  { slugs: ['barcelona','seville','madrid','valencia'], start: 'barcelona', end: 'seville' },
  { slugs: ['madrid','seville','granada','malaga','valencia'], start: 'madrid', end: 'madrid' },
  { slugs: ['barcelona','valencia','alicante','malaga','seville','madrid'], start: 'barcelona', end: 'madrid' },
];
let bad = 0;
for (const c of cases) {
  const cities = c.slugs.map(C);
  const round = c.start && c.start === c.end;
  const got = orderCities(cities, c.start, c.end, measured);
  const back = round ? C(c.start) : null;
  // 무차별: 제약을 만족하는 모든 순열
  let best = null, bestC = Infinity;
  for (const perm of perms(cities)) {
    if (c.start && perm[0].slug !== c.start) continue;
    if (c.end && !round && perm[perm.length-1].slug !== c.end) continue;
    const v = cost(perm, back);
    if (v < bestC) { bestC = v; best = perm; }
  }
  const gotC = cost(got, back);
  const ok = Math.abs(gotC - bestC) < 1;
  if (!ok) bad++;
  console.log(`${c.slugs.length}곳${round?'(왕복)':''}${c.start?` ${c.start}시작`:''}${c.end&&!round?` ${c.end}끝`:''}`);
  console.log(`  엔진: ${got.map(x=>x.name).join(' → ')}  ${fmtDur(gotC)}`);
  console.log(`  최소: ${best.map(x=>x.name).join(' → ')}  ${fmtDur(bestC)}  ${ok?'일치 ✓':'✗ 최적 아님'}`);
}
console.log(bad ? `\n✗ ${bad}건 최적이 아님` : '\n✓ 모든 경우에서 최소 경로');
process.exit(bad ? 1 : 0);
