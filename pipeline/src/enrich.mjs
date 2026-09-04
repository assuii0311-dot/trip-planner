// Fill in the fields the planner needs but Wikivoyage does not state outright.
import { getJSON } from './wv.mjs';

const WD_API = 'https://www.wikidata.org/w/api.php';

/**
 * 위키백과 언어판만 센다.
 *
 * 위키데이터의 sitelink 에는 위키백과 말고도 커먼즈·위키보이지·위키인용집·
 * 위키뉴스가 섞여 있다. 전부 세면 '몇 개 언어의 백과사전이 이 곳을
 * 다루는가' 가 아니라 '위키미디어 어딘가에 페이지가 있는가' 가 된다.
 *
 * 전부 세던 때를 실측했다(스페인 볼거리 1,064곳):
 *
 *   - **917곳(86%)이 커먼즈 하나 때문에 정확히 +1** 이었다
 *   - 등급이 한 칸 부풀어 있던 것 256곳(24%). 그중 198곳은 언어판이
 *     2개인데 3으로 세어져 pop 1 대신 2 를 받았다
 *
 * 위키보이지가 섞이는 것은 특히 나쁘다. 이 앱의 원자료가 위키보이지라,
 * **자기가 읽은 가이드에 실렸다는 이유로 명성을 한 칸 얹어 주는 셈**이다.
 *
 * 주의 — 이 함수를 고친 시점에 `app/public/data/` 의 값은 옛 셈법으로
 * 만들어진 것이다. 다시 수집하면 24%의 등급이 한 칸 내려가고 기준선
 * `RANK_FLOOR` 을 넘는 볼거리가 420 → 400곳이 된다. 재수집은 기준선을
 * 다시 실측하는 일과 함께 해야 한다(docs/26 3단계).
 */
const NOT_ENCYCLOPEDIA = /^(commons|species|meta|wikidata|mediawiki|incubator|outreach)wiki$/;
export const wikipediaEditions = (keys) =>
  keys.filter((k) => /wiki$/.test(k) && !NOT_ENCYCLOPEDIA.test(k)).length;

/**
 * 언어판 수 → 1~5.
 *
 * 40개 언어로 쓰인 대성당은 대표 명소이고, 두 개짜리는 동네 발견이다.
 * 위키데이터 sitelink 는 CC0 라 저장해도 된다 — 후기 사이트의 평점과 달리.
 *
 * **표는 여기 한 곳에만 둔다.** 예전에는 `wdnearby.mjs` 가 자기 표를
 * 따로 갖고 있었고, 그 표에는 1 등급이 아예 없어서(`... : 7→3 : 그 외 2`)
 * 언어판이 하나뿐인 곳이 수집 경로에 따라 1 이 되기도 2 가 되기도 했다.
 */
export const popularityOf = (n) => (n >= 40 ? 5 : n >= 18 ? 4 : n >= 7 ? 3 : n >= 3 ? 2 : 1);

/** 위키데이터 id → popularity. 없는 항목은 넣지 않는다(호출부가 기본값을 정한다). */
export async function popularityByWikidata(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await getJSON(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks' });
    for (const [id, ent] of Object.entries(data.entities ?? {})) {
      if (ent.missing !== undefined) continue;
      out[id] = popularityOf(wikipediaEditions(Object.keys(ent.sitelinks ?? {})));
    }
  }
  return out;
}

const HIGH_ENERGY = /\b(hike|hiking|trek|climb|summit|cycl|bike|kayak|surf|dive|snorkel|zip|canyon|via ferrata|marathon|steep|ascent|stairs)/i;
const LOW_ENERGY = /\b(cafe|café|bar|restaurant|spa|bath|cruise|boat|show|concert|cinema|tasting|market hall)/i;

const OUTDOOR_THEMES = new Set(['nature', 'landmark', 'activity']);

/** Which parts of the day an item actually works in. */
function bestSlots(item) {
  switch (item.theme) {
    case 'food': return ['lunch', 'dinner'];
    case 'nightlife': return ['evening', 'night'];
    case 'shopping': return ['morning', 'afternoon'];
    case 'nature': return ['morning', 'afternoon', 'evening'];
    case 'art':
    case 'history': return ['morning', 'afternoon'];
    default: return ['morning', 'afternoon', 'evening'];
  }
}

/** Duration refined by theme and by what the description implies. */
function duration(item) {
  const text = `${item.name} ${item.descEn}`;
  if (/\b(day trip|full day|whole day)\b/i.test(text)) return 300;
  if (/\b(half.?day|3 hours|three hours)\b/i.test(text)) return 180;
  if (/\b(viewpoint|mirador|statue|fountain|gate|bridge|plaza)\b/i.test(text)) return 30;
  return item.durationMin;
}

export function enrichItem(item, popularity) {
  const text = `${item.name} ${item.descEn}`;
  let energy = OUTDOOR_THEMES.has(item.theme) ? 3 : 2;
  if (HIGH_ENERGY.test(text)) energy = 5;
  else if (LOW_ENERGY.test(text)) energy = 1;

  return {
    ...item,
    popularity: item.wikidata ? popularity[item.wikidata] ?? 2 : 2,
    energy,
    indoor: !OUTDOOR_THEMES.has(item.theme),
    bestSlots: bestSlots(item),
    durationMin: duration(item),
    tags: tagsFor(item, text),
  };
}

/** Tags the preference screen can match against (음식 취향 등). */
function tagsFor(item, text) {
  const tags = [];
  const add = (re, tag) => { if (re.test(text)) tags.push(tag); };
  if (item.theme === 'food' || item.theme === 'nightlife') {
    add(/\btapas|pintxo/i, 'tapas');
    add(/\bmichelin|fine dining|tasting menu|gourmet/i, 'fine');
    add(/\bmarket|mercado|street food|stall/i, 'street');
    add(/\bseafood|fish|marisco|paella|pescado/i, 'seafood');
    add(/\bvegetarian|vegan|veggie/i, 'vegetarian');
    add(/\bcafe|café|coffee|churros|pastry|bakery|dessert|ice cream|helad/i, 'cafe');
    add(/\bwine|bodega|vineyard|winery|cava|sherry|vermouth/i, 'wine');
    add(/\btraditional|home.?cooked|local cuisine|casera|typical/i, 'local');
  }
  add(/\bunesco|world heritage/i, 'unesco');
  add(/\bfree\b|no charge|gratis/i, 'free');
  add(/\bviewpoint|mirador|panoram|skyline|sunset/i, 'view');
  add(/\bfamily|children|kids/i, 'family');
  return [...new Set(tags)];
}
