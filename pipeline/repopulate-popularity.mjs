/**
 * 이미 만들어 둔 데이터의 명성만 다시 매긴다.
 *
 * ## 왜 전체 재수집이 아닌가
 *
 * `docs/27` 에서 셈법을 고쳤다(위키백과 언어판만 센다). 그리고 순위가
 * 원값을 쓰게 되어 `sitelinks` 필드가 필요해졌다. 둘 다 **이미 고른 장소는
 * 그대로 두고 숫자만 바꾸면 되는 일**이다.
 *
 * `collect.mjs` 를 다시 돌리면 장소 선정까지 함께 흔들린다 — 특히
 * `fetchNearby` 의 넓은 반경 보강은 캐시되지 않아 돌릴 때마다 결과가
 * 달라진다. 순위 작업 중에 발밑의 데이터가 바뀌면 무엇 때문에 성적이
 * 변했는지 알 수 없게 된다. 그래서 이 스크립트는 **`sitelinks` 와
 * `popularity` 두 필드만** 건드린다.
 *
 *   node pipeline/repopulate-popularity.mjs spain [--dry]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { sitelinksByWikidata, popularityOf } from './src/enrich.mjs';

const country = process.argv[2] ?? 'spain';
const dry = process.argv.includes('--dry');
const dir = new URL(`../app/public/data/${country}/cities/`, import.meta.url);

const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
const cities = [];
const ids = new Set();
for (const f of files) {
  const items = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  cities.push({ f, items });
  for (const it of items) if (it.wikidata) ids.add(it.wikidata);
}
console.log(`${country} · 도시 ${files.length}곳 · 항목 ${cities.reduce((a, c) => a + c.items.length, 0)}개 · 위키데이터 id ${ids.size}개`);

console.log('언어판 수를 받는 중…');
const counts = {};
const list = [...ids];
for (let i = 0; i < list.length; i += 50) {
  Object.assign(counts, await sitelinksByWikidata(list.slice(i, i + 50)));
  process.stderr.write(`\r  ${Math.min(i + 50, list.length)}/${list.length}`);
  await new Promise((r) => setTimeout(r, 1200));
}
process.stderr.write('\n');
const gone = list.filter((q) => counts[q] === undefined);
if (gone.length) console.log(`  위키데이터에서 사라진 항목 ${gone.length}개 — 등급을 건드리지 않는다: ${gone.join(' ')}`);

const moved = {};
let changed = 0;
for (const c of cities) {
  for (const it of c.items) {
    const n = it.wikidata ? counts[it.wikidata] : undefined;
    /*
     * 연결이 없거나 조회가 안 된 것은 원값을 '모른다'(null)로 둔다.
     * 0 으로 적으면 '찾아봤더니 위키백과에 하나도 없다' 는 뜻이 되어
     * 순위가 그것을 사실로 믿는다. 모르는 것과 없는 것은 다르다.
     */
    const before = it.popularity;
    it.sitelinks = n ?? null;
    if (n !== undefined) it.popularity = popularityOf(n);
    if (it.popularity !== before) { changed++; moved[`${before}→${it.popularity}`] = (moved[`${before}→${it.popularity}`] ?? 0) + 1; }
  }
  // 키 차례를 collect.mjs 가 쓰는 것과 맞춘다(sitelinks 를 popularity 앞에).
  c.items = c.items.map((it) => {
    const { sitelinks, popularity, ...rest } = it;
    const out = {};
    for (const [k, v] of Object.entries(rest)) {
      out[k] = v;
      if (k === 'indoor') { out.sitelinks = sitelinks; out.popularity = popularity; }
    }
    if (!('popularity' in out)) { out.sitelinks = sitelinks; out.popularity = popularity; }
    return out;
  });
  // 앱이 받는 파일이라 collect.mjs 와 같은 모양(공백 없는 한 줄)으로 쓴다.
  if (!dry) await writeFile(new URL(c.f, dir), JSON.stringify(c.items));
}

const all = cities.flatMap((c) => c.items);
const known = all.filter((i) => i.sitelinks !== null);
console.log(`\n등급이 바뀐 항목 ${changed}개 (${Math.round(changed / all.length * 100)}%)`);
console.log('  ' + Object.entries(moved).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
console.log(`언어판 수를 아는 항목 ${known.length}개 · 모르는 항목 ${all.length - known.length}개`);
const dist = {};
for (const i of known) dist[i.popularity] = (dist[i.popularity] ?? 0) + 1;
console.log('  등급 분포 ' + [1, 2, 3, 4, 5].map((p) => `pop${p}:${dist[p] ?? 0}`).join(' '));
console.log(dry ? '\n--dry 이므로 파일은 쓰지 않았다' : '\n파일을 다시 썼다');
