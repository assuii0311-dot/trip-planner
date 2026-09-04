// Gap fill for cities whose Wikivoyage article is thin.
//
// Overpass was the original plan, but Wikidata's own geospatial search turns
// out to be the better source here: everything it returns is notable enough to
// have its own item, it carries Korean labels where they exist, and it is CC0 —
// no share-alike obligation, unlike OSM's ODbL.
import { THEMES } from './extract.mjs';
import { popularityByWikidata } from './enrich.mjs';

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
      // 아래에서 위키보이지 경로와 같은 함수로 다시 매긴다. 여기 값은 조회가
      // 실패했을 때만 남는 임시값이다.
      popularity: 2,
      energy: theme === 'activity' ? 4 : theme === 'nature' ? 3 : 2,
      tags: [],
      url: null,
      wikidata: qid,
      source: 'wikidata',
      attribution: 'Wikidata, CC0',
    });
    if (items.length >= limit) break;
  }

  /*
   * popularity 는 여기서 매기지 않고 위키보이지 경로와 **같은 함수**로 받는다.
   *
   * 예전에는 이 파일이 자기 등급표를 갖고 있었는데 그 표에는 1 등급이 없어
   * (`40→5 : 18→4 : 7→3 : 그 외 2`), 언어판이 한둘뿐인 곳이 수집 경로에
   * 따라 1 이 되기도 2 가 되기도 했다. 게다가 SPARQL 의 `wikibase:sitelinks`
   * 는 커먼즈·위키보이지까지 세는 값이라 위쪽 칸막이도 헐거웠다.
   *
   * SPARQL 의 sitelinks 는 이제 **싼 1차 거르개로만** 쓴다(위 FILTER 와
   * 산봉우리 규칙). 실제 등급은 위키백과 언어판만 세어 정한다.
   */
  try {
    const pop = await popularityByWikidata(items.map((i) => i.wikidata));
    for (const it of items) it.popularity = pop[it.wikidata] ?? 2;
  } catch (err) {
    console.error(`  ${city.name}: 언어판 수 조회 실패, 임시값 2 로 둔다 (${err.message})`);
  }
  return items;
}
