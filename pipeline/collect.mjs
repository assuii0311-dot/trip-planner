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
import { collectCity, EVENT_RE, parsePrice } from './src/extract.mjs';
import { enrichItem, popularityByWikidata } from './src/enrich.mjs';
import { fetchNearby } from './src/wdnearby.mjs';
import { selectBalanced } from './src/select.mjs';
import { describe } from './src/practical.mjs';

const [, , countrySlug = 'spain', ...rest] = process.argv;
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i === -1 ? null : rest[i + 1]; };
const has = (n) => rest.includes(`--${n}`);

const registry = await import(`./registry/${countrySlug}.mjs`);
const { COUNTRY, CITIES, ATTRIBUTION } = registry;

/** 도시 성격 프로필과 사진. 1단계 카드와 취향 역산에 쓴다. */
const { CHARACTER, MACRO_REGIONS, ISLANDS, ISLAND_OF } = await import(`./registry/${countrySlug}-character.mjs`);
const media = JSON.parse(await readFile(new URL(`./out/${countrySlug}-media.json`, import.meta.url), 'utf8').catch(() => '{}'));
/**
 * 아이템 대표 사진 — fetch-item-media.mjs 가 모아 둔 것.
 * 대표급은 app/public/item/ 에 파일로 함께 넣고, 나머지는 앱이 커먼즈
 * 축소본을 원격으로 띄운다. 어느 쪽인지는 파일이 실제로 있는지로 정한다.
 */
const itemMedia = JSON.parse(await readFile(new URL(`./out/${countrySlug}-item-media.json`, import.meta.url), 'utf8').catch(() => '{}'));
const bundled = new Set(
  (await readdir(new URL('../app/public/item/', import.meta.url)).catch(() => []))
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => f.slice(0, -4)),
);
const macroOf = (region) => MACRO_REGIONS.find((m) => m.regions.includes(region))?.id ?? 'other';

/** 도시당 아이템 상한. 거점은 더 많이, 근교는 하루치면 충분하다. */
const CAP = { hub: Number(flag('cap-hub') ?? 70), satellite: Number(flag('cap-sat') ?? 40) };
/**
 * 이 수에 못 미치는 도시는 Wikidata 근접 검색으로 채운다.
 *
 * 무작위 여행 800건 × 데이터 비율 7단계를 시뮬레이션해 정한 값이다.
 * 여행에 쓰인 가장 작은 도시의 아이템 수별로 빈 일자를 재 보면
 * 15~19개에서 13%, 20~24개에서 9%, 25~29개에서 7%로 20개 부근에서 곡선이 꺾인다.
 * 그래서 하한을 20개로 잡고, 보강이 목표를 다 못 채우는 경우를 감안해
 * 목표는 그보다 높게 둔다. 자세한 근거는 docs/04-data-volume.md 참조.
 */
const FILL_TARGET = { hub: 44, satellite: 26 };
/** 식사·술자리를 뺀 '볼거리' 하한. 이 아래면 하루를 채울 수가 없다. */
const SIGHT_TARGET = { hub: 28, satellite: 15 };
/** 검증으로 정한 도시당 절대 하한. 이 아래면 보고서에 경고를 낸다. */
const FLOOR = 20;

/**
 * 자동 중복 판정이 못 잡는 같은 장소들. 이름이 서로 겹치지 않아서
 * 규칙을 넓히면 '말라가 대성당'과 '말라가 박물관'까지 합쳐 버린다.
 * 전수 점검에서 나온 두 건뿐이라 그냥 이름으로 지운다.
 */
const DROP_IDS = new Set([
  // Wikidata 근접 검색이 반경 안이라는 이유로 끌어온, 다른 지자체의 대상들.
  // 시체스에 묵는 사람이 15~25km 떨어진 카녜예스 성을 보러 가지 않는다.
  'sitges-wd-sant-julia-de-l-arboc',          // 라르보스 (약 20km)
  'sitges-wd-castell-de-canyelles',           // 카녜예스 (약 15km)
  'sitges-wd-castell-convent-de-penyafort',   // 산타마르가리다 (약 25km)
  'sitges-wd-platges-de-cunit',               // 쿠닛 해변 — 시체스에도 해변이 있다
  'sitges-wd-mediterranean-technology-park',  // 연구단지. 관광 대상이 아니다
  'pollenca-wd-ses-cases-de-son-serra',       // 무로 (약 20km)
  'penyiscola-wd-vinaros-bullring',           // 비나로스 (약 25km)
  'teruel-wd-la-escalinata',   // = teruel-escalinata-neo-mudejar
  'jerez-damajuana',           // = jerez-damajuana-cafe-bar
  'girona-wd-museo-de-historia-de-girona', // = girona-museu-d-historia-de-girona
  'madrid-wd-bernabeu',        // = madrid-real-madrid
  'toledo-wd-church-of-santo-tome', // = toledo-the-burial-of-the-count-of-orgaz
  'salamanca-wd-monterrey-palace',  // = salamanca-palacio-de-monterey
  'salamanca-wd-museo-de-art-nouveau-y-art-deco', // = salamanca-casa-lis
  'salamanca-wd-salamanca-old-cathedral', // = salamanca-new-old-cathedrals 에 포함
  'cordoba-wd-puente-romano',       // = cordoba-roman-bridge
  'cadiz-wd-roman-theatre-of-cadiz', // = cadiz-teatro-romano
  'granada-wd-banos-arabes-del-banuelo',   // = granada-hamman-el-banuelo
  'granada-wd-basilica-of-saint-john-of-god', // = granada-basilica-san-juan-de-dios
  'malaga-wd-castle-of-gibralfaro',        // = malaga-castillo-de-gibralfaro
  'malaga-wd-carmen-thyssen-museum',       // = malaga-museo-carmen-thyssen
  'malaga-wd-casa-natal-de-pablo-ruiz-picasso', // = malaga-picasso-s-birthplace
  'san-sebastian-wd-san-telmo-museoa', // = san-sebastian-san-telmo-museum
  'vitoria-wd-fournier-museum-of-playing-cards', // = vitoria-fournier-playing-card-museum
  'vitoria-wd-museo-de-bellas-artes-de-alava',   // = vitoria-fine-arts-museum
  'pamplona-wd-museum-of-navarre',  // = pamplona-museo-de-navarra
  'santander-wd-botin-centre',      // = santander-centro-botin
  'santander-wd-museo-de-arte-moderno-y-contemporaneo-de-santand', // = santander-museum-of-modern-contemporary-art
  'santander-wd-museo-de-prehistoria-y-arqueologia-de-cantabria',  // = santander-museum-of-prehistory-and-archaeology-of-cantabri
  'santander-wd-faro-de-cabo-mayor', // = santander-faro-cabo-mayor-art-centre
  'santiago-wd-galicia-contemporary-art-center', // = santiago-cgac-galician-centre-for-contemporary-art
  'a-coruna-wd-casa-del-hombre-la-coruna',       // = a-coruna-domus
  'a-coruna-wd-iglesia-de-santiago',             // = a-coruna-church-of-santiago
  'a-coruna-wd-casa-de-las-ciencias-la-coruna',  // = a-coruna-casa-das-ciencias
  'vigo-wd-concatedral-de-santa-maria-de-vigo',  // = vigo-vigo-co-cathedral
  'vigo-wd-castro-fortress',                     // = vigo-castillo-de-san-sebastian
  'oviedo-wd-santa-maria-del-naranjo',           // = oviedo-santa-maria-del-naranco
  'oviedo-wd-metropolitan-cathedral-basilica-of-the-holy-savi', // = oviedo-cathedral-of-san-salvador
  'oviedo-wd-fine-arts-museum-of-asturias',      // = oviedo-museum-of-fine-arts
  'palma-wd-basilica-of-st-francis',            // = palma-basilica-de-sant-francesc
  'palma-wd-arab-baths-of-palma-de-mallorca',   // = palma-banys-arabs
  'palma-wd-poble-espanyol-de-palma',           // = palma-pueblo-espanol
  'palma-wd-museu-fundacio-juan-march',         // = palma-fundacion-juan-march-palma
  'santa-cruz-tenerife-wd-museum-of-science-and-the-cosmos', // 실제로는 라라구나에 있다
  'las-palmas-wd-cathedral-basilica-of-st-ann', // = las-palmas-catedral-de-santa-ana
  'las-palmas-auditorio-alfredo-kraus',         // = las-palmas-alfredo-kraus-auditorium
]);
const isSight = (it) => it.theme !== 'food' && it.theme !== 'nightlife';

/**
 * Wikivoyage's Eat and Drink sections mix places with dishes: "Paella",
 * "Orxata" and "Fideuà" are listed exactly like restaurants. A dish has no
 * address, no hours, no price and no link, and putting one in a day plan
 * produces a 13:00 appointment with a rice dish. Anything whose text names a
 * venue is kept, so a bar with a thin listing survives.
 */
const VENUE_WORDS = /\b(bar|tavern|taberna|restaurant|cafe|caf[ée]|theatre|theater|venue|club|market|shop|hall|terrace|bodega)\b/i;
function isVisitable(it) {
  if (it.theme !== 'food' && it.theme !== 'nightlife') return true;
  if (it.lat !== null || it.address || it.url || it.hours || it.priceRaw) return true;
  return VENUE_WORDS.test(`${it.name} ${it.descEn}`);
}

/** 같은 장소가 위키보야지와 위키데이터 양쪽에서 들어올 수 있다. */
/**
 * 같은 장소가 위키보야지와 위키데이터 양쪽에서 들어올 수 있다.
 * 이름 비교는 보수적으로 한다. 일반명사를 걷어내고 포함 관계까지 보면
 * "Malaga Cathedral" 과 "Museo de Malaga" 가 모두 "malaga" 로 뭉개져
 * 대성당이 조용히 사라진다.
 */
function dedupe(items) {
  const seenId = new Set();
  const seenQid = new Set();
  const names = [];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  // 뒤에 붙은 종류 이름만 떼어 낸다. "Arzak Restaurant" 는 "Arzak" 이다.
  const core = (s) => norm(s.replace(/\s+(restaurante?|museum|museo|museu|stadium|estadio|hotel)$/i, ''));
  // "X" 와 "X of Y" 만 같은 곳으로 본다.
  const sameAs = (a, b) => {
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return long.startsWith(short) && /^(of|de|del|dela|dels)/.test(long.slice(short.length));
  };
  const out = [];
  for (const it of items) {
    if (seenId.has(it.id)) continue;
    if (it.wikidata && seenQid.has(it.wikidata)) continue;
    const n = core(it.nameEn ?? it.name);
    if (n.length >= 3 && names.some((m) => sameAs(m, n))) continue;
    seenId.add(it.id);
    if (it.wikidata) seenQid.add(it.wikidata);
    names.push(n);
    out.push(it);
  }
  return out;
}

const exclude = new Set((flag('exclude') ?? '').split(',').filter(Boolean));
/** 다른 도시 이름. 좌표가 잘못 붙은 위키데이터 항목을 걸러내는 데 쓴다. */
const cityNames = (self) => CITIES.map((c) => c.nameEn).filter((n) => n !== self);
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
const headlines = new Map();

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

  // 가격은 캐시에 이미 파싱된 값이 들어 있다. 파서를 고쳐도 다시 크롤링하지
  // 않으려고, 원문(priceRaw)이 남아 있으면 여기서 다시 읽는다.
  for (const it of items) {
    if (it.priceRaw !== undefined) it.priceEur = parsePrice(it.priceRaw);
  }

  const cap = city.isHub ? CAP.hub : CAP.satellite;
  const places = items.filter((it) => !EVENT_RE.test(`${it.name} ${it.descEn}`) && isVisitable(it));
  const enriched = selectBalanced(places.map((it) => enrichItem(it, popularity)), cap, city.isHub)
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

  // 대표 명소 보정.
  // 알함브라는 Wikivoyage 에서 별도 문서라 그라나다 리스팅에 잡히지 않는다.
  // 도시의 가장 유명한 장소가 빠진 목록은 신뢰를 잃으므로, 아이템 수와
  // 무관하게 언어판이 20개 이상인 곳을 한 번 더 확인해 채운다.
  try {
    const headlinePath = new URL(`./out/raw/${city.slug}-headline.json`, import.meta.url);
    let headline;
    if (!has('refresh')) {
      try { headline = JSON.parse(await readFile(headlinePath, 'utf8')); } catch { /* 캐시 없음 */ }
    }
    if (!headline) {
      headline = await fetchNearby(city, {
        radiusKm: city.isHub ? 6 : 4,
        minSitelinks: 20,
        exclude: new Set(enriched.flatMap((e) => [e.nameEn, e.name])),
        excludeIds: new Set(enriched.map((e) => e.wikidata).filter(Boolean)),
        otherCities: cityNames(city.nameEn),
        limit: 12,
      });
      await writeFile(headlinePath, JSON.stringify(headline));
    }
    for (const it of headline) {
      const override = ko[it.id] ?? {};
      enriched.push({ ...it, ...override, city: city.slug });
    }
    headlines.set(city.slug, headline.length);
  } catch (err) {
    console.error(`\n  ${city.name}: 대표 명소 확인 실패 (${err.message})`);
  }

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
          radiusKm: city.isHub ? 20 : 18,
          minSitelinks: 2,
          exclude: new Set(enriched.flatMap((e) => [e.nameEn, e.name])),
          otherCities: cityNames(city.nameEn),
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


  const finalItems = dedupe(enriched).filter((it) => !DROP_IDS.has(it.id));

  // Wikidata 는 식당을 거의 담지 않는다. 그대로 두면 근교 당일치기 일정에
  // 점심과 저녁이 통째로 빠져 계획이 망가진 것처럼 보인다.
  // 특정 가게를 지어내지 않고, 어디서 먹으면 되는지 '구역'을 알려준다.
  const foodCount = finalItems.filter((it) => it.theme === 'food').length;
  if (foodCount < 3) {
    const areas = [
      {
        key: 'old-town',
        name: `${city.name} 구시가 식당가`,
        summary: '구시가 광장 주변 식당가에서 한 끼',
        desc: '가게를 하나 정해두기보다, 광장 둘레를 한 바퀴 돌며 사람이 앉아 있는 집으로 들어가는 편이 실패가 적습니다. 관광지 한복판보다 한 골목 안쪽이 값도 맛도 낫습니다.',
        busy: '현지 기준 점심은 14시, 저녁은 21시에 시작합니다',
        slots: ['lunch'],
      },
      {
        key: 'menu-del-dia',
        name: `${city.name} 오늘의 메뉴(Menú del día)`,
        summary: '평일 점심 정식. 12~15유로에 세 접시',
        desc: '평일 점심에 전채·메인·후식·음료가 함께 나오는 정식입니다. 스페인에서 가장 싸게 제대로 먹는 방법이고, 동네 식당 대부분이 내놓습니다.',
        busy: '보통 13~16시에만 주문할 수 있습니다',
        slots: ['lunch'],
      },
      {
        key: 'dinner-area',
        name: `${city.name} 저녁 식사`,
        summary: '중심가 보행자 거리에서 타파스나 정식',
        desc: '저녁은 타파스를 두세 접시 나눠 먹거나 정식 한 상을 시킵니다. 스페인의 저녁 시간은 늦어서, 21시 전에는 손님이 거의 없습니다.',
        busy: '예약 없이 가려면 20시 전후가 자리 잡기 쉽습니다',
        slots: ['dinner'],
      },
    ];
    for (const area of areas.slice(0, 3 - foodCount)) {
      finalItems.push({
        id: `${city.slug}-dining-${area.key}`,
        name: area.name,
        nameEn: `${city.nameEn} dining area`,
        nameLocal: null,
        city: city.slug,
        district: null,
        theme: 'food',
        summary: area.summary,
        desc: area.desc,
        busy: area.busy,
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

  // 설명은 여기서 한 번에 4부분으로 만든다.
  // 자리마다 override 를 섞으면 대표 명소·보강으로 들어온 아이템이 빠지기 쉬워서,
  // 최종 목록을 통째로 한 번 훑는 쪽이 안전하다.
  for (const it of finalItems) {
    const own = it.source === 'manual' ? { summary: it.summary, busy: it.busy } : {};
    const { summary, why, practical, caution } = describe(it, { ...own, ...(ko[it.id] ?? {}) });
    it.summary = summary;
    it.why = why;
    it.practical = practical;
    it.caution = caution;
    // 사진. 저작자 표기가 안 되는 것은 라이선스 이행이 불가능하므로 붙이지 않는다.
    const m = itemMedia[it.id];
    it.photo = m && m.license
      ? { file: m.file, bundled: bundled.has(it.id), author: m.author, license: m.license }
      : null;
    delete it.desc;
    delete it.busy;
  }

  const themes = {};
  for (const it of finalItems) themes[it.theme] = (themes[it.theme] ?? 0) + 1;

  await mkdir(new URL(`../app/public/data/${countrySlug}/cities/`, import.meta.url), { recursive: true });
  await writeFile(
    new URL(`../app/public/data/${countrySlug}/cities/${city.slug}.json`, import.meta.url),
    JSON.stringify(finalItems),
  );

  const ch = CHARACTER[city.slug] ?? {};
  outCities.push({
    slug: city.slug, name: city.name, nameEn: city.nameEn,
    region: city.region, macroRegion: macroOf(city.region),
    // 섬은 자치주가 아니라 섬이 여행 단위다. 본토면 null.
    island: ISLAND_OF?.[city.slug] ?? null,
    lat: city.lat, lon: city.lon,
    // isHub/hub 는 '보통 이렇게 묵는다'는 참고값이다.
    // 실제 거점은 사용자가 고른 도시 조합을 보고 앱이 다시 정한다.
    isHub: !!city.isHub, hub: city.hub ?? null,
    dayTrips: city.dayTrips ?? [], itemCount: finalItems.length, themes,
    transitGuide: city.transitGuide,
    // 도시 성격 — 취향 역산과 1단계 카드의 재료
    tagline: ch.tagline ?? city.blurb,
    suitedFor: ch.suitedFor ?? null,
    highlights: ch.highlights ?? [],
    season: ch.season ?? null,
    profile: ch.profile ?? null,
    nights: ch.nights ?? [1, 2],
    firstTimer: !!ch.firstTimer,
    tags: ch.tags ?? [],
    // 앱에 함께 넣은 사진을 쓴다. 원격 링크로 두면 오프라인에서 비고,
    // 위키미디어에 닿지 못하는 망에서는 아예 안 보인다.
    photo: media[city.slug] ? `city/${city.slug}.jpg` : null,
    photoCredit: media[city.slug]
      ? {
          author: media[city.slug].photoAuthor,
          license: media[city.slug].photoLicense,
          source: media[city.slug].photo,
        }
      : null,
    wikidata: media[city.slug]?.wikidata ?? null,
  });
  report.push({ city: city.name, slug: city.slug, sights: finalItems.filter(isSight).length, items: finalItems.length, headline: headlines.get(city.slug) ?? 0, themes: Object.keys(themes).length, translated: finalItems.filter((e) => ko[e.id]).length, filled: filled.get(city.slug) ?? 0 });
}
process.stderr.write('\n');

/**
 * 나라 인덱스에 담을 도시 목록.
 *
 * 이번 실행이 전체 수집이면 방금 만든 것이 곧 전부다.
 * --only / --exclude / 대화식 제외로 일부만 돌렸다면 이것은 '전부'가 아니다.
 * 그대로 쓰면 60곳짜리 인덱스가 수집한 도시 수만큼으로 줄어들고,
 * 앱은 이 인덱스로 도시 목록을 그리므로 나머지 도시가 통째로 사라진다.
 * 그래서 부분 수집일 때는 기존 인덱스를 읽어 해당 도시만 갈아 끼운다.
 *
 * 순서는 항상 레지스트리(CITIES) 순서로 맞춘다. 갈아 끼운 도시가 뒤로
 * 밀리면 앱의 권역별 목록 순서가 흐트러진다.
 */
const indexPath = new URL(`../app/public/data/${countrySlug}/index.json`, import.meta.url);
const partial = selected.length < CITIES.length;
let cities = outCities;

if (partial) {
  const prev = await readFile(indexPath, 'utf8')
    .then((t) => JSON.parse(t).cities)
    .catch(() => null);
  if (Array.isArray(prev)) {
    const merged = new Map(prev.map((c) => [c.slug, c]));
    for (const c of outCities) merged.set(c.slug, c);
    const order = new Map(CITIES.map((c, i) => [c.slug, i]));
    // 레지스트리에서 빠진 도시가 인덱스에 남아 있으면 맨 뒤로 보낸다.
    cities = [...merged.values()].sort(
      (a, b) => (order.get(a.slug) ?? Infinity) - (order.get(b.slug) ?? Infinity),
    );
    console.log(`부분 수집 — 기존 인덱스 ${prev.length}곳에 ${outCities.length}곳을 갱신해 ${cities.length}곳 유지`);
  } else {
    console.log(`⚠ 부분 수집인데 기존 인덱스를 읽지 못했습니다. `
      + `인덱스가 이번에 수집한 ${outCities.length}곳만 남게 됩니다. `
      + `되돌리려면 전체 수집(node pipeline/collect.mjs ${countrySlug})을 한 번 돌리세요.`);
  }
}

await writeFile(
  indexPath,
  JSON.stringify({
    country: COUNTRY.slug, name: COUNTRY.name,
    generatedAt: new Date().toISOString().slice(0, 10),
    attribution: ATTRIBUTION,
    macroRegions: MACRO_REGIONS,
    islands: ISLANDS ?? [],
    cities,
  }),
);

console.log(`\n${'도시'.padEnd(24)} 아이템 볼거리  테마  대표  보강  번역`);
console.log('-'.repeat(66));
for (const r of report) {
  const warn = r.items < FLOOR ? `  ⚠ 하한(${FLOOR}) 미달` : r.sights < 8 ? '  ⚠ 볼거리 부족' : '';
  console.log(`${r.city.padEnd(24)} ${String(r.items).padStart(5)} ${String(r.sights).padStart(5)} ${String(r.themes).padStart(5)} ${String(r.headline).padStart(5)} ${String(r.filled).padStart(5)} ${String(r.translated).padStart(5)}${warn}`);
}
const total = report.reduce((a, r) => a + r.items, 0);
console.log(`\n총 아이템 ${total}개 / ${report.length}개 도시 (평균 ${(total / report.length).toFixed(1)})`);
const thin = report.filter((r) => r.items < FLOOR);
if (thin.length) {
  console.log(`하한 ${FLOOR}개에 못 미치는 도시 ${thin.length}곳: `
    + thin.map((r) => `${r.slug}(${r.items})`).join(', '));
} else {
  console.log(`모든 도시가 하한 ${FLOOR}개를 넘습니다.`);
}
