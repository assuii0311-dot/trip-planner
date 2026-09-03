/**
 * 섬 모델과 묶음 제안을 검사한다.
 *
 * 섬은 자치주가 아니라 섬 하나가 여행 단위다. 그 전제가 깨지면 대서양을
 * 렌터카로 건너라는 안내가 나온다 — 실제로 그랬다.
 */
import { readFile } from 'node:fs/promises';
const idx = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const load = async (s) => JSON.parse(await readFile(new URL(`../public/data/spain/cities/${s}.json`, import.meta.url), 'utf8'));
const { servicesBetween, fmtDur } = await import('../src/lib/routing.ts');
const { measuredTable } = await import('../src/lib/itinerary.ts');
const { expandIslandScope, rehomeIslandItems } = await import('../src/lib/island.ts');
const { BUNDLES, bundlesFor } = await import('../src/lib/bundles.ts');

let fail = 0;
const ok = (c, label, detail = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!c) fail++;
};
const C = (s) => idx.cities.find((c) => c.slug === s);
const m = measuredTable(idx.cities);
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const svc = (a, b) => servicesBetween(C(a), C(b), m.get(key(a, b)));

console.log('=== 섬 정체성 ===');
ok(Array.isArray(idx.islands) && idx.islands.length === 3, '섬 목록이 실려 있다',
  (idx.islands ?? []).map((i) => i.name).join(' · '));
ok(idx.cities.filter((c) => c.island).length === 9, '섬 도시에 island 가 붙어 있다',
  `${idx.cities.filter((c) => c.island).length}곳`);
ok(C('santa-cruz-tenerife').island !== C('las-palmas').island,
  '테네리페와 그란카나리아는 다른 섬이다',
  `${C('santa-cruz-tenerife').island} vs ${C('las-palmas').island}`);

console.log('\n=== 바다를 육로로 건너지 않는가 ===');
{
  const s = svc('santa-cruz-tenerife', 'las-palmas');
  const land = s.filter((x) => x.mode === 'car' || x.mode === 'train' || x.mode === 'ave' || x.mode === 'bus');
  ok(land.length === 0, '섬 사이에 육로 수단이 없다',
    s.map((x) => `${x.label} ${fmtDur(x.totalMin)}`).join(' | '));
  ok(s.some((x) => x.mode === 'ferry'), '가까운 섬끼리는 배가 제시된다');
  ok(s[0] && s[0].totalMin < 200, '가장 빠른 수단이 상식적이다', `${s[0]?.label} ${fmtDur(s[0]?.totalMin ?? 0)}`);
}

console.log('\n=== 없는 철도를 지어내지 않는가 ===');
{
  const s = svc('las-palmas', 'maspalomas');
  ok(!s.some((x) => x.mode === 'train' || x.mode === 'ave'),
    '그란카나리아에 열차를 만들지 않는다', s.map((x) => x.label).join(' | '));
  const t = svc('santa-cruz-tenerife', 'la-laguna');
  ok(t.length > 0, '테네리페 섬 안 이동은 남아 있다', t.map((x) => x.label).join(' | '));
}

console.log('\n=== 섬 전체가 후보가 되는가 ===');
for (const [pick, needs] of [
  ['palma', ['드라크 동굴', '에스 트렌크', '데이아', '세라 데 트라문타나', '발데모사']],
  ['santa-cruz-tenerife', ['테이데 화산', '로스 히간테스']],
  ['las-palmas', ['로케 누블로', '마스팔로마스 모래언덕']],
]) {
  const scope = expandIslandScope([pick], idx.cities, idx.islands);
  const items = (await Promise.all(scope.map(load))).flat();
  const homed = rehomeIslandItems(items, idx.cities, idx.islands, [pick]);
  const mine = homed.filter((i) => i.city === pick);
  for (const n of needs) {
    ok(mine.some((i) => i.name.includes(n)), `${C(pick).name} 후보에 ${n} 이 있다`);
  }
  ok(mine.some((i) => i.islandFrom), `${C(pick).name} 에 섬 안 다른 동네 표시가 붙는다`,
    `${mine.filter((i) => i.islandFrom).length}곳`);
}

console.log('\n=== 본토는 영향을 받지 않는가 ===');
{
  const scope = expandIslandScope(['barcelona'], idx.cities, idx.islands);
  ok(scope.length === 1, '본토 도시는 그대로 하나다', scope.join(','));
  const items = await load('barcelona');
  const homed = rehomeIslandItems(items, idx.cities, idx.islands, ['barcelona']);
  ok(homed.every((i) => !i.islandFrom), '본토 아이템에는 섬 표시가 안 붙는다');
}

console.log('\n=== 묶음 제안 ===');
for (const b of BUNDLES) {
  const items = await load(b.city);
  const r = bundlesFor(b.city, items).find((x) => x.id === b.id);
  ok(!!r && r.items.length >= 2, `${b.title}`,
    r ? `${r.items.length}곳${r.passEur ? ` · 통합권 €${r.passEur} vs 낱장 €${r.singleEur}` : ''}` : '조립 실패');
}
{
  const items = await load('madrid');
  const r = bundlesFor('madrid', items).find((x) => x.id === 'madrid-paseo-del-arte');
  ok(r.passEur < r.singleEur, '통합권이 낱장 합계보다 싸다', `€${r.passEur} < €${r.singleEur}`);
  ok(bundlesFor('barcelona', await load('barcelona')).length >= 2, '바르셀로나에 묶음이 둘 이상');
  ok(bundlesFor('ronda', await load('ronda')).length === 0, '묶음이 없는 도시는 빈 목록');
}

console.log(fail === 0 ? '\n✓ 섬·묶음 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
