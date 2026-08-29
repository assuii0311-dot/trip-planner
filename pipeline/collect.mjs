#!/usr/bin/env node
/**
 * Collect a country's travel items into the dataset the app ships with.
 *
 *   node pipeline/collect.mjs spain                 # everything in the registry
 *   node pipeline/collect.mjs spain --list          # just show the cities and stop
 *   node pipeline/collect.mjs spain --exclude a,b   # skip these city slugs
 *   node pipeline/collect.mjs spain --only a,b      # collect only these
 *
 * Sources are limited to what may legally be stored: Wikivoyage (CC BY-SA),
 * Wikidata (CC0) and OpenStreetMap (ODbL). Ratings and opening hours from
 * commercial map providers are deliberately not collected — the app links out
 * to them live instead.
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { collectCity } from './src/extract.mjs';
import { enrichItem, popularityByWikidata } from './src/enrich.mjs';
import { fetchNearby } from './src/wdnearby.mjs';
import { selectBalanced } from './src/select.mjs';

const [, , countrySlug = 'spain', ...rest] = process.argv;
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i === -1 ? null : rest[i + 1]; };
const has = (n) => rest.includes(`--${n}`);

const registry = await import(`./registry/${countrySlug}.mjs`);
const { COUNTRY, CITIES, ATTRIBUTION } = registry;

/** 도시당 아이템 상한. 거점은 더 많이, 근교는 하루치면 충분하다. */
const CAP = { hub: Number(flag('cap-hub') ?? 70), satellite: Number(flag('cap-sat') ?? 40) };
const MIN_ITEMS = 12;
/** 이 수에 못 미치는 도시는 Wikidata 근접 검색으로 채운다. */
const FILL_TARGET = { hub: 40, satellite: 22 };
/** 식사·술자리를 뺀 '볼거리' 하한. 이 아래면 하루를 채울 수가 없다. */
const SIGHT_TARGET = { hub: 26, satellite: 13 };
const isSight = (it) => it.theme !== 'food' && it.theme !== 'nightlife';

const exclude = new Set((flag('exclude') ?? '').split(',').filter(Boolean));
const only = new Set((flag('only') ?? '').split(',').filter(Boolean));

function table(cities) {
  const w = Math.max(...cities.map((c) => c.name.length + 2), 10);
  console.log(`\n${'도시'.padEnd(w)} ${'구분'.padEnd(6)} ${'지역'.padEnd(12)} 근교`);
  console.log('-'.repeat(w + 40));
  for (const c of cities) {
    console.log(
      `${c.name.padEnd(w)} ${(c.isHub ? '거점' : '근교').padEnd(6)} ${c.region.padEnd(12)} ` +
      `${c.isHub ? `${c.dayTrips.length}곳` : `← ${CITIES.find((x) => x.slug === c.hub)?.name ?? ''}`}`,
    );
  }
  console.log(`\n총 ${cities.length}곳 (거점 ${cities.filter((c) => c.isHub).length} · 근교 ${cities.filter((c) => !c.isHub).length})`);
}

/** 제외할 도시를 물어본다. 파이프로 실행하면 건너뛴다. */
async function askExclusions() {
  if (!process.stdin.isTTY) return new Set();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n제외할 도시 slug 를 쉼표로 입력하세요 (없으면 엔터): ');
  rl.close();
  return new Set(answer.split(',').map((s) => s.trim()).filter(Boolean));
}

/** 사람이 손본 한국어 이름/설명. pipeline/ko/<country>/<city>.json 에 둔다. */
async function loadKorean(country) {
  const dir = new URL(`./ko/${country}/`, import.meta.url);
  const merged = {};
  try {
    for (const f of await readdir(dir)) {
      if (!f.endsWith('.json')) continue;
      Object.assign(merged, JSON.parse(await readFile(new URL(f, dir), 'utf8')));
    }
  } catch { /* 아직 번역 파일이 없으면 영문으로 둔다. */ }
  return merged;
}

let selected = CITIES.filter((c) => (only.size ? only.has(c.slug) : !exclude.has(c.slug)));
table(selected);
if (has('list')) process.exit(0);

const asked = await askExclusions();
if (asked.size) {
  selected = selected.filter((c) => !asked.has(c.slug));
  console.log(`${asked.size}곳 제외 → ${selected.length}곳 수집`);
}

const ko = await loadKorean(countrySlug);
const outCities = [];
const report = [];
const filled = new Map();

for (const [i, city] of selected.entries()) {
  process.stderr.write(`\r[${i + 1}/${selected.length}] ${city.name} 수집 중…`.padEnd(50));
  const cachePath = new URL(`./out/raw/${city.slug}.json`, import.meta.url);
  let items;
  let popularity;
  if (!has('refresh')) {
    try {
      ({ items, popularity } = JSON.parse(await readFile(cachePath, 'utf8')));
    } catch { /* 캐시가 없으면 새로 받는다. */ }
  }
  if (!items) {
    ({ items } = await collectCity(city.title, city.slug, city.slug));
    const ids = [...new Set(items.map((it) => it.wikidata).filter(Boolean))];
    popularity = await popularityByWikidata(ids);
    await mkdir(new URL('./out/raw/', import.meta.url), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ items, popularity }));
  }

  const cap = city.isHub ? CAP.hub : CAP.satellite;
  const enriched = selectBalanced(items.map((it) => enrichItem(it, popularity)), cap, city.isHub)
    .map((it) => {
      const override = ko[it.id] ?? {};
      return {
        id: it.id,
        name: override.name ?? it.name,
        nameEn: it.name,
        nameLocal: it.nameLocal,
        city: city.slug,
        district: it.district,
        theme: override.theme ?? it.theme,
        desc: override.desc ?? it.descEn.slice(0, 180),
        lat: it.lat, lon: it.lon,
        durationMin: override.durationMin ?? it.durationMin,
        priceEur: it.priceEur,
        hours: it.hours,
        bestSlots: it.bestSlots,
        indoor: it.indoor,
        popularity: it.popularity,
        energy: override.energy ?? it.energy,
        tags: it.tags,
        url: it.url,
        wikidata: it.wikidata,
        source: it.source,
        attribution: 'Wikivoyage, CC BY-SA 4.0',
      };
    });

  // Wikivoyage 가 얇은 도시는 Wikidata 근접 검색으로 채운다.
  // 근교 당일치기 대상이 아이템 7개짜리면 그 하루를 짤 수가 없다.
  const target = city.isHub ? FILL_TARGET.hub : FILL_TARGET.satellite;
  const sightTarget = city.isHub ? SIGHT_TARGET.hub : SIGHT_TARGET.satellite;
  const sights = enriched.filter(isSight).length;
  if (enriched.length < target || sights < sightTarget) {
    try {
      const fillPath = new URL(`./out/raw/${city.slug}-fill.json`, import.meta.url);
      let extra;
      if (!has('refresh')) {
        try { extra = JSON.parse(await readFile(fillPath, 'utf8')); } catch { /* 캐시 없음 */ }
      }
      if (!extra) {
        extra = await fetchNearby(city, {
          radiusKm: city.isHub ? 6 : 5,
          minSitelinks: 3,
          exclude: new Set(enriched.flatMap((e) => [e.nameEn, e.name])),
          limit: Math.max(target - enriched.length, sightTarget - sights) + 10,
        });
        await writeFile(fillPath, JSON.stringify(extra));
      }
      for (const it of extra) {
        const override = ko[it.id] ?? {};
        enriched.push({ ...it, ...override, city: city.slug });
      }
      filled.set(city.slug, extra.length);

      // 소도시는 반경 5km 안에 볼거리가 없을 수 있다.
      // 포옌사처럼 여전히 모자라면 근처 마을까지 포함해 한 번 더 넓힌다.
      if (enriched.filter(isSight).length < sightTarget) {
        const wide = await fetchNearby(city, {
          radiusKm: city.isHub ? 15 : 12,
          minSitelinks: 2,
          exclude: new Set(enriched.flatMap((e) => [e.nameEn, e.name])),
          limit: sightTarget * 2,
        });
        for (const it of wide) {
          const override = ko[it.id] ?? {};
          enriched.push({ ...it, ...override, city: city.slug });
        }
        filled.set(city.slug, (filled.get(city.slug) ?? 0) + wide.length);
      }
    } catch (err) {
      console.error(`\n  ${city.name}: Wikidata 보강 실패 (${err.message})`);
    }
  }

  // Wikidata 는 식당을 거의 담지 않는다. 그대로 두면 근교 당일치기 일정에
  // 점심과 저녁이 통째로 빠져 계획이 망가진 것처럼 보인다.
  // 특정 가게를 지어내지 않고, 어디서 먹으면 되는지 '구역'을 알려준다.
  const foodCount = enriched.filter((it) => it.theme === 'food').length;
  if (foodCount < 3) {
    const areas = [
      { key: 'old-town', name: `${city.name} 구시가 식당가`, desc: '구시가 광장 주변에 식당이 모여 있습니다. 현지 기준 점심은 14시, 저녁은 21시에 시작합니다.', slots: ['lunch'] },
      { key: 'menu-del-dia', name: `${city.name} 오늘의 메뉴(Menú del día)`, desc: '평일 점심에 전채·메인·후식·음료가 함께 나오는 정식입니다. 대부분의 동네 식당이 12~15유로에 내놓습니다.', slots: ['lunch'] },
      { key: 'dinner-area', name: `${city.name} 저녁 식사`, desc: '중심가 보행자 거리에서 타파스나 정식으로. 예약 없이 가려면 20시 전후가 자리 잡기 쉽습니다.', slots: ['dinner'] },
    ];
    for (const area of areas.slice(0, 3 - foodCount)) {
      enriched.push({
        id: `${city.slug}-dining-${area.key}`,
        name: area.name,
        nameEn: `${city.nameEn} dining area`,
        nameLocal: null,
        city: city.slug,
        district: null,
        theme: 'food',
        desc: area.desc,
        lat: city.lat,
        lon: city.lon,
        durationMin: 75,
        priceEur: 15,
        hours: null,
        bestSlots: area.slots,
        indoor: true,
        popularity: 3,
        energy: 1,
        tags: ['local'],
        url: null,
        wikidata: null,
        source: 'manual',
        attribution: '직접 작성',
      });
    }
  }

  const themes = {};
  for (const it of enriched) themes[it.theme] = (themes[it.theme] ?? 0) + 1;

  await mkdir(new URL('../app/public/data/cities/', import.meta.url), { recursive: true });
  await writeFile(
    new URL(`../app/public/data/cities/${city.slug}.json`, import.meta.url),
    JSON.stringify(enriched),
  );

  outCities.push({
    slug: city.slug, name: city.name, nameEn: city.nameEn, region: city.region,
    lat: city.lat, lon: city.lon, isHub: !!city.isHub, hub: city.hub ?? null,
    dayTrips: city.dayTrips ?? [], itemCount: enriched.length, themes,
    blurb: city.blurb, transitGuide: city.transitGuide,
  });
  report.push({ city: city.name, slug: city.slug, sights: enriched.filter(isSight).length, items: enriched.length, themes: Object.keys(themes).length, translated: enriched.filter((e) => ko[e.id]).length, filled: filled.get(city.slug) ?? 0 });
}
process.stderr.write('\n');

await writeFile(
  new URL(`../app/public/data/${countrySlug}.json`, import.meta.url),
  JSON.stringify({
    country: COUNTRY.slug, name: COUNTRY.name,
    generatedAt: new Date().toISOString().slice(0, 10),
    attribution: ATTRIBUTION,
    cities: outCities,
  }),
);

console.log(`\n${'도시'.padEnd(24)} 아이템 볼거리  테마  보강  번역`);
console.log('-'.repeat(60));
for (const r of report) {
  const warn = r.items < MIN_ITEMS ? '  ⚠ 부족' : r.sights < 8 ? '  ⚠ 볼거리 부족' : '';
  console.log(`${r.city.padEnd(24)} ${String(r.items).padStart(5)} ${String(r.sights).padStart(5)} ${String(r.themes).padStart(5)} ${String(r.filled).padStart(5)} ${String(r.translated).padStart(5)}${warn}`);
}
const total = report.reduce((a, r) => a + r.items, 0);
console.log(`\n총 아이템 ${total}개 / ${report.length}개 도시 (평균 ${(total / report.length).toFixed(1)})`);
const thin = report.filter((r) => r.items < MIN_ITEMS);
if (thin.length) console.log(`아이템이 부족한 도시 ${thin.length}곳: ${thin.map((r) => r.slug).join(', ')}`);
