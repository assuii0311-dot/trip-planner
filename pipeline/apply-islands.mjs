/**
 * 섬 정체성과 섬 추가 항목을 이미 만들어 둔 데이터에 반영한다.
 *
 * 전체 수집을 다시 돌리면 위키 원본이 그동안 바뀌어 다른 결과가 나온다.
 * 지금 고치려는 것은 '섬을 자치주로 다뤘다' 는 모델 문제와 '도시 밖 명소가
 * 통째로 빠졌다' 는 누락 문제뿐이므로, 그 부분만 얹는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { ISLANDS, ISLAND_OF } from './registry/spain-character.mjs';
import { ISLAND_EXTRAS } from './island-extras.mjs';

/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, 첫 인자로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const root = new URL(`../app/public/data/${COUNTRY}/`, import.meta.url);
const idx = JSON.parse(await readFile(new URL('spain.json', root), 'utf8'));

idx.islands = ISLANDS;
for (const c of idx.cities) c.island = ISLAND_OF[c.slug] ?? null;

const byCity = new Map();
for (const e of ISLAND_EXTRAS) {
  const list = byCity.get(e.city) ?? [];
  list.push(e);
  byCity.set(e.city, list);
}

for (const [slug, extras] of byCity) {
  const f = new URL(`cities/${slug}.json`, root);
  const items = JSON.parse(await readFile(f, 'utf8'));
  const have = new Set(items.map((i) => i.id));
  let added = 0;
  for (const e of extras) {
    if (have.has(e.id)) continue;
    items.push({
      id: e.id, name: e.name, nameEn: e.nameEn, nameLocal: e.nameEn, city: e.city,
      district: null, theme: e.theme, lat: e.lat, lon: e.lon,
      durationMin: e.durationMin, priceEur: e.priceEur, hours: null,
      bestSlots: e.bestSlots, indoor: e.indoor, popularity: e.popularity,
      energy: e.energy, tags: e.tags, url: null, wikidata: e.wikidata,
      source: 'manual', attribution: 'Wikidata, CC0 (좌표) · 설명 직접 작성',
      summary: e.summary, why: e.why, practical: e.practical,
      caution: e.caution, photo: null,
    });
    added++;
  }
  await writeFile(f, `${JSON.stringify(items, null, 1)}\n`);
  // 인덱스의 개수·테마 집계도 맞춘다.
  const city = idx.cities.find((c) => c.slug === slug);
  if (city) {
    city.itemCount = items.length;
    const t = {};
    for (const i of items) t[i.theme] = (t[i.theme] ?? 0) + 1;
    city.themes = t;
  }
  console.log(`  ${slug.padEnd(22)} +${added}곳 → ${items.length}곳`);
}

await writeFile(new URL('spain.json', root), `${JSON.stringify(idx, null, 1)}\n`);
console.log(`\n섬 ${ISLANDS.length}개 · 도시 ${idx.cities.filter((c) => c.island).length}곳에 island 부여`);
