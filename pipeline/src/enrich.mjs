// Fill in the fields the planner needs but Wikivoyage does not state outright.
import { getJSON } from './wv.mjs';

const WD_API = 'https://www.wikidata.org/w/api.php';

/**
 * Popularity proxy: how many Wikipedia language editions cover the place.
 * A cathedral written up in 40 languages is a headline sight; one in two is a
 * local find. This is Wikidata sitelink data (CC0), so it is safe to store —
 * unlike a review platform's rating, which is not.
 */
export async function popularityByWikidata(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await getJSON(WD_API, { action: 'wbgetentities', ids: batch.join('|'), props: 'sitelinks' });
    for (const [id, ent] of Object.entries(data.entities ?? {})) {
      if (ent.missing !== undefined) continue;
      const n = Object.keys(ent.sitelinks ?? {}).length;
      out[id] = n >= 40 ? 5 : n >= 18 ? 4 : n >= 7 ? 3 : n >= 3 ? 2 : 1;
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
