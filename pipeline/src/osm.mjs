// OpenStreetMap gap fill for towns whose Wikivoyage article is thin.
// ODbL: storable with attribution. Overpass is volunteer-run, so this only
// runs for the handful of cities that fall below the minimum item count.

// The public Overpass instances are volunteer-run and return 429/503 under
// load, so rotate through the mirrors rather than failing the whole run.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const UA = 'trip-planner-pipeline/1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastError;
  for (let round = 0; round < 2; round++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        await sleep(1200 * (round + 1));
      }
    }
  }
  throw lastError ?? new Error('Overpass unreachable');
}

/** OSM tag → our activity theme, with the visit duration each implies. */
const MAPPING = [
  { q: 'tourism=museum',                theme: 'art',      dur: 90,  energy: 2 },
  { q: 'tourism=gallery',               theme: 'art',      dur: 60,  energy: 2 },
  { q: 'tourism=artwork',               theme: 'art',      dur: 20,  energy: 1 },
  { q: 'tourism=viewpoint',             theme: 'landmark', dur: 30,  energy: 3 },
  { q: 'tourism=attraction',            theme: 'landmark', dur: 60,  energy: 2 },
  { q: 'historic=castle',               theme: 'history',  dur: 90,  energy: 3 },
  { q: 'historic=monastery',            theme: 'history',  dur: 60,  energy: 2 },
  { q: 'historic=ruins',                theme: 'history',  dur: 45,  energy: 3 },
  { q: 'historic=archaeological_site',  theme: 'history',  dur: 60,  energy: 3 },
  { q: 'historic=city_gate',            theme: 'history',  dur: 20,  energy: 1 },
  { q: 'historic=monument',             theme: 'landmark', dur: 20,  energy: 1 },
  { q: 'amenity=place_of_worship',      theme: 'history',  dur: 40,  energy: 1 },
  { q: 'leisure=park',                  theme: 'nature',   dur: 60,  energy: 2 },
  { q: 'leisure=garden',                theme: 'nature',   dur: 45,  energy: 2 },
  { q: 'natural=beach',                 theme: 'nature',   dur: 120, energy: 2 },
  { q: 'natural=cave_entrance',         theme: 'nature',   dur: 60,  energy: 4 },
  { q: 'amenity=marketplace',           theme: 'shopping', dur: 45,  energy: 2 },
  { q: 'amenity=restaurant',            theme: 'food',     dur: 75,  energy: 1 },
  { q: 'amenity=cafe',                  theme: 'food',     dur: 40,  energy: 1 },
  { q: 'amenity=bar',                   theme: 'nightlife', dur: 60, energy: 1 },
];

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);

function buildQuery(lat, lon, radiusM) {
  const clauses = MAPPING.map(({ q }) => {
    const [k, v] = q.split('=');
    return `nwr["${k}"="${v}"]["name"](around:${radiusM},${lat},${lon});`;
  }).join('\n  ');
  return `[out:json][timeout:90];\n(\n  ${clauses}\n);\nout center tags 400;`;
}

/**
 * Places around a city centre, mapped into our item shape.
 * `exclude` holds names already taken from Wikivoyage so the two do not double up.
 */
export async function fetchOSM(city, { radiusM = 4000, exclude = new Set(), limit = 40 } = {}) {
  const data = await overpass(buildQuery(city.lat, city.lon, radiusM));

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const taken = new Set([...exclude].map(norm));
  const items = [];

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const name = tags['name:en'] ?? tags.name;
    if (!name || taken.has(norm(name))) continue;

    const hit = MAPPING.find(({ q }) => { const [k, v] = q.split('='); return tags[k] === v; });
    if (!hit) continue;

    // 이름 없는 동네 성당·작은 바까지 다 담으면 목록이 흐려진다.
    // 위키데이터 항목이 있거나 웹사이트가 있는, 최소한의 존재감이 있는 곳만 남긴다.
    const notable = Boolean(tags.wikidata || tags.wikipedia || tags.website || tags.tourism || tags.historic);
    if (!notable) continue;

    taken.add(norm(name));
    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;

    items.push({
      id: `${city.slug}-osm-${slug(name)}`,
      name,
      nameEn: name,
      nameLocal: tags.name ?? null,
      city: city.slug,
      district: null,
      theme: hit.theme,
      desc: describe(tags, hit.theme),
      lat: lat === null ? null : +lat.toFixed(6),
      lon: lon === null ? null : +lon.toFixed(6),
      durationMin: hit.dur,
      priceEur: tags.fee === 'no' ? 0 : null,
      hours: tags.opening_hours ?? null,
      bestSlots: hit.theme === 'food' ? ['lunch', 'dinner']
        : hit.theme === 'nightlife' ? ['evening', 'night']
        : ['morning', 'afternoon'],
      indoor: !['nature', 'landmark'].includes(hit.theme),
      popularity: tags.wikidata ? 3 : tags.wikipedia ? 3 : 2,
      energy: hit.energy,
      tags: osmTags(tags),
      url: tags.website ?? null,
      wikidata: tags.wikidata ?? null,
      source: 'osm',
      attribution: '© OpenStreetMap contributors, ODbL',
    });
    if (items.length >= limit) break;
  }
  return items;
}

const KIND_KO = {
  museum: '박물관', gallery: '갤러리', artwork: '공공 예술 작품', viewpoint: '전망 포인트',
  attraction: '명소', castle: '성', monastery: '수도원', ruins: '유적', monument: '기념물',
  archaeological_site: '고고 유적', city_gate: '옛 성문', park: '공원', garden: '정원',
  beach: '해변', cave_entrance: '동굴', marketplace: '시장', restaurant: '식당',
  cafe: '카페', bar: '바', place_of_worship: '종교 건축',
};

function describe(tags, theme) {
  const kind = KIND_KO[tags.tourism] ?? KIND_KO[tags.historic] ?? KIND_KO[tags.leisure]
    ?? KIND_KO[tags.natural] ?? KIND_KO[tags.amenity] ?? '';
  const bits = [];
  if (kind) bits.push(kind);
  if (tags.cuisine) bits.push(tags.cuisine.split(';')[0].replace(/_/g, ' '));
  if (tags.opening_hours) bits.push(`영업 ${tags.opening_hours}`);
  return bits.length ? bits.join(' · ') : `${theme} 관련 장소`;
}

function osmTags(tags) {
  const out = [];
  const cuisine = (tags.cuisine ?? '').toLowerCase();
  if (/tapas|pintxo/.test(cuisine)) out.push('tapas');
  if (/seafood|fish/.test(cuisine)) out.push('seafood');
  if (/coffee|cake|ice_cream|dessert/.test(cuisine) || tags.amenity === 'cafe') out.push('cafe');
  if (tags['diet:vegetarian'] === 'yes' || /vegetarian|vegan/.test(cuisine)) out.push('vegetarian');
  if (/wine/.test(cuisine) || tags.craft === 'winery') out.push('wine');
  if (/regional|spanish|local/.test(cuisine)) out.push('local');
  if (tags.fee === 'no') out.push('free');
  if (tags.tourism === 'viewpoint') out.push('view');
  if (tags.heritage || tags['heritage:operator']) out.push('unesco');
  return [...new Set(out)];
}
