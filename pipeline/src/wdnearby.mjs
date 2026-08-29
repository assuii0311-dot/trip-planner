// Gap fill for cities whose Wikivoyage article is thin.
//
// Overpass was the original plan, but Wikidata's own geospatial search turns
// out to be the better source here: everything it returns is notable enough to
// have its own item, it carries Korean labels where they exist, it hands back
// the sitelink count the popularity score already uses, and it is CC0 — no
// share-alike obligation, unlike OSM's ODbL.
import { THEMES } from './extract.mjs';

const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'trip-planner-pipeline/1.0';

/** Types that exist at a location but are not somewhere you visit. */
const NOT_A_DESTINATION = /\b(municipality|city|town|village|human settlement|province|comarca|autonomous community|road|motorway|highway|street|railway station|metro station|bus station|airport|university|school|hospital|company|business|football club|newspaper|political|river|stream|reservoir|river basin|festival|award|competition|tournament|championship|neighborhood|district|county|region|parish|diocese)\b/i;

const query = (lat, lon, radiusKm, minSitelinks) => `
SELECT ?item ?itemLabel ?koLabel ?desc ?lat ?lon ?typeLabel ?sitelinks WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  ?item wdt:P31 ?type .
  ?item p:P625/psv:P625 ?cv .
  ?cv wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  OPTIONAL { ?item rdfs:label ?koLabel . FILTER(LANG(?koLabel)="ko") }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY DESC(?sitelinks)
LIMIT 200`;

/** Theme implied by a Wikidata type label, or null when the type says nothing. */
function themeFromType(typeLabel) {
  const folded = typeLabel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const t of THEMES) if (new RegExp(t.re.source).test(folded)) return t.id;
  return null;
}

const DURATION = { nature: 60, activity: 120, art: 90, history: 60, landmark: 30, nightlife: 60, shopping: 45, food: 75 };
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);

async function run(sparql, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${SPARQL}?query=${encodeURIComponent(sparql)}`, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

/**
 * Extra items around a city centre. `exclude` holds names already taken from
 * Wikivoyage so the two sources do not double up on the same cathedral.
 */
export async function fetchNearby(city, { radiusKm = 4, minSitelinks = 4, exclude = new Set(), excludeIds = new Set(), otherCities = [], limit = 30 } = {}) {
  const data = await run(query(city.lat, city.lon, radiusKm, minSitelinks));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const taken = [...exclude].map(norm).filter(Boolean);
  /** "Royal Chapel" 과 "Royal Chapel of Granada" 는 같은 곳이다. 포함 관계까지 본다. */
  const isDuplicate = (name) => {
    const n = norm(name);
    return taken.some((t) => t === n || (t.length >= 6 && n.length >= 6 && (t.includes(n) || n.includes(t))));
  };
  const seen = new Set();
  const items = [];

  for (const row of data.results?.bindings ?? []) {
    const name = row.itemLabel?.value;
    const typeLabel = row.typeLabel?.value ?? '';
    if (!name || name.startsWith('Q') === false && !name) continue;
    if (/^Q\d+$/.test(name)) continue;                 // 라벨이 없는 항목
    if (NOT_A_DESTINATION.test(typeLabel)) continue;
    // 도시 그 자체("Palma")와, 이미 헐린 건물은 갈 곳이 아니다.
    const cityNorm = norm(city.nameEn);
    const thisNorm = norm(name);
    if (thisNorm === cityNorm || thisNorm === norm(city.name)) continue;
    if (thisNorm.length >= 4 && (cityNorm.startsWith(thisNorm) || thisNorm.startsWith(cityNorm))) continue;
    if (/\b(demolished|destroyed|former site|no longer exists)\b/i.test(row.desc?.value ?? '')) continue;

    // Wikidata 좌표가 틀린 항목이 드물게 있다. 마드리드의 경기장이 빌바오
    // 반경 6km 안에서 나오는 식이다. 설명에 다른 도시 이름이 박혀 있으면 버린다.
    const blurb = `${name} ${row.desc?.value ?? ''}`;
    if (otherCities.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(blurb))) continue;

    // 이름 없는 봉우리와 언덕이 무더기로 딸려 온다. 시체스 한 곳에서만
    // "mountain in Spain" 이 열다섯 개 나왔다. 널리 알려진 산만 남긴다.
    const sitelinks = Number(row.sitelinks.value);
    if (/^(mountain|hill|peak|summit|elevation)\b/i.test(typeLabel) && sitelinks < 8) continue;

    const theme = themeFromType(typeLabel);
    if (!theme) continue;

    const key = row.item.value;
    const qid = key.split('/').pop();
    if (excludeIds.has(qid) || seen.has(key) || isDuplicate(name)) continue;
    seen.add(key);
    taken.push(norm(name));

    items.push({
      id: `${city.slug}-wd-${slug(name)}`,
      name: row.koLabel?.value ?? name,
      nameEn: name,
      nameLocal: null,
      city: city.slug,
      district: null,
      theme,
      desc: row.desc?.value ?? typeLabel,
      lat: +Number(row.lat.value).toFixed(6),
      lon: +Number(row.lon.value).toFixed(6),
      durationMin: DURATION[theme],
      priceEur: null,
      hours: null,
      bestSlots: theme === 'food' ? ['lunch', 'dinner']
        : theme === 'nightlife' ? ['evening', 'night']
        : ['morning', 'afternoon'],
      indoor: !['nature', 'landmark', 'activity'].includes(theme),
      popularity: sitelinks >= 40 ? 5 : sitelinks >= 18 ? 4 : sitelinks >= 7 ? 3 : 2,
      energy: theme === 'activity' ? 4 : theme === 'nature' ? 3 : 2,
      tags: [],
      url: null,
      wikidata: qid,
      source: 'wikidata',
      attribution: 'Wikidata, CC0',
    });
    if (items.length >= limit) break;
  }
  return items;
}
