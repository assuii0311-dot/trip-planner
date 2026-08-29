// Turn a Wikivoyage city article into normalized travel items.
import { wikitext, subpages, templateCalls, parseTemplate, plain } from './wv.mjs';

/** Listing templates that describe a completed activity a traveller can do. */
const LISTING = new Set(['see', 'do', 'eat', 'drink', 'buy', 'listing']);

/**
 * Activity themes (3단계 활동 테마).
 * Order matters: the first theme whose pattern matches wins, so specific
 * themes are listed before the broad fallbacks.
 */
/**
 * Fold accents away before matching. Catalan and Spanish names carry diacritics
 * ("Aquàrium", "Zoològic", "Música") that ASCII patterns would otherwise miss,
 * and every miss silently dumps the item into the wrong theme.
 */
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const THEMES = [
  {
    id: 'nature', ko: '자연경관',
    re: /\b((?<!amusement )(?<!theme )(?<!water )parks?|parcs?|parques?|gardens?|jardin(?:es)?|jardins?|beach(?:es)?|playas?|platjas?|mountains?|sierra|montana|viewpoints?|miradors?|lakes?|lagos?|rivers?|forests?|nature reserve|natural park|cliffs?|caves?|cuevas?|islands?|islas?|botanic(?:al)?|dunes?|delta|lagoons?|albufera|hills?)\b/,
  },
  {
    id: 'activity', ko: '액티비티',
    re: /\b(hik(?:e|ing)|trails?|trek(?:king)?|kayak(?:ing)?|surf(?:ing)?|div(?:e|ing)|snorkel(?:ling)?|cycl(?:e|ing)|bikes?|bicycles?|boat trips?|sail(?:ing)?|climb(?:ing)?|zip.?lines?|ski(?:ing)?|guided tours?|walking tours?|bus tours?|cable cars?|funiculars?|paddle|horse riding|zoo\w*|aquarium\w*|amusement parks?|theme parks?|water ?parks?|stadiums?|estadio|camp nou|spas?|hammam|cooking class(?:es)?|workshops?|bullrings?|plaza de toros)\b/,
  },
  {
    id: 'art', ko: '예술·박물관',
    re: /\b(museums?|museos?|museus?|galler(?:y|ies)|galerias?|exhibitions?|arts? cent(?:re|er)s?|fundacio(?:ns?)?|fundacion(?:es)?|foundations?|theatres?|theaters?|teatros?|teatres?|opera|concert halls?|auditoriums?|philharmonic|cultural cent(?:re|er)s?|musica|liceu|caixaforum)\b/,
  },
  {
    id: 'history', ko: '역사·유적',
    re: /\b(cathedrals?|catedrals?|churches|church|iglesias?|esglesias?|basilicas?|chapels?|ermitas?|monaster(?:y|ies)|monasterios?|monestirs?|convents?|abbeys?|castles?|castillos?|castells?|fortress(?:es)?|forts?|citadels?|alcazars?|alcazabas?|palaces?|palacios?|palaus?|roman|ruins?|ruinas?|aqueducts?|acueducto|medieval|mosques?|mezquitas?|synagogues?|sinagogas?|city walls?|murallas?|tombs?|necropolis|archaeolog\w*|old town|casco antiguo|barri gotic|jewish quarter|juderia|world heritage|cloisters?)\b/,
  },
  {
    id: 'landmark', ko: '랜드마크·건축',
    re: /\b(towers?|torres?|bridges?|puentes?|ponts?|plazas?|placas?|squares?|gates?|puertas?|portas?|modernis(?:m|me|t)|gaudi|architecture|architects?|monuments?|statues?|estatuas?|lighthouses?|faros?|obelisks?|fountains?|fuentes?|promenades?|paseos?|rambla|boulevards?|skyline|observation decks?|panoram\w*|pavilions?)\b/,
  },
  {
    id: 'nightlife', ko: '나이트라이프',
    re: /\b(bars?|pubs?|nightclubs?|clubs?|nightlife|cocktails?|flamenco|tablaos?|breweries|brewery|cervecerias?|wine bars?|bodegas?|discos?|discotecas?|live music|jazz|rooftop)\b/,
  },
  {
    id: 'shopping', ko: '쇼핑·시장',
    re: /\b(markets?|mercados?|mercats?|shops?|shopping|boutiques?|stores?|malls?|crafts?|artisans?|souvenirs?|antiques?|flea markets?|bookshops?)\b/,
  },
  {
    id: 'food', ko: '미식',
    re: /\b(restaurants?|restaurantes?|tapas?|pintxos?|cafes?|cafeterias?|bakeries|bakery|panaderias?|pastr(?:y|ies)|pastelerias?|seafood|paella|cuisine|gastronom\w*|dining|eater(?:y|ies)|bistros?|churros|ice cream|heladerias?|chocolate|taverns?|tabernas?|asadors?|marisquerias?)\b/,
  },
];

/** Wikivoyage section a listing came from → the theme we fall back to. */
const TYPE_FALLBACK = { see: 'landmark', do: 'activity', eat: 'food', drink: 'nightlife', buy: 'shopping' };

/** Rough visit duration in minutes, by theme. Refined per-item by the curation pass. */
const DURATION = { nature: 90, activity: 150, art: 120, history: 90, landmark: 45, nightlife: 90, shopping: 60, food: 75 };

/**
 * Score every theme instead of taking the first pattern that hits.
 *
 * The listing's own name is the strongest signal, the Wikivoyage section it
 * sits under is the next strongest (an "Eat" listing is food even when its
 * description dwells on the building's architecture), and the prose only
 * breaks ties. First-match ordering got this wrong in both directions:
 * "Cathedral" landed in art because its description mentioned paintings, and
 * every listing whose text named the city landed in nightlife because the
 * pattern `\b(bar|...)` matched "Barcelona".
 */
function classify(type, name, content) {
  const foldedName = fold(name);
  const foldedBody = fold(content);
  const scores = {};
  for (const t of THEMES) {
    const g = new RegExp(t.re.source, 'g');
    const inName = (foldedName.match(g) ?? []).length;
    const inBody = (foldedBody.match(new RegExp(t.re.source, 'g')) ?? []).length;
    scores[t.id] = inName * 8 + Math.min(inBody, 4);
  }
  const sectionTheme = TYPE_FALLBACK[type] ?? 'landmark';
  scores[sectionTheme] += 4;

  let best = sectionTheme;
  for (const [id, score] of Object.entries(scores)) {
    if (score > scores[best]) best = id;
  }
  return best;
}

/**
 * Recurring festivals and fairs are dates, not places — dropping them into a
 * day plan produces an itinerary the traveller cannot actually follow.
 * Exported and applied at selection time too, so widening this pattern does
 * not mean re-crawling every city.
 */
export const EVENT_RE = /\b(annual|annually|festival|takes place (?:each|every)|held (?:each|every)|every (?:year|september|august|july)|semana santa|holy week|feria de (?:abril|sevilla)|carnival|carnaval|las fallas|san fermin|corpus christi|feast day|processions)\b/i;

/** "Go to Teatre del Liceu" is a sentence, not a name. */
function cleanName(s) {
  return s.replace(/^(go to|visit|see|take|try|explore|wander|walk)\s+(the\s+)?/i, '').trim();
}

/** Parse a Wikivoyage price string ("€12", "free", "€8-15") into a euro number. */
function parsePrice(raw) {
  if (!raw) return null;
  const s = plain(raw).toLowerCase();
  if (/\b(free|gratis|no charge|libre)\b/.test(s)) return 0;
  const nums = [...s.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)].map((m) => parseFloat(m[1].replace(',', '.')));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function slug(s) {
  return plain(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

/** Extract every usable listing from one article (a city or one of its districts). */
function itemsFromText(text, { city, citySlug, district }) {
  const items = [];
  let section = '';
  // Walk the article so we know which == Section == each template sits under.
  const tokens = text.split(/(?=\n==)/);
  for (const chunk of tokens) {
    const head = chunk.match(/^\n?==+\s*(.+?)\s*==+/);
    if (head) section = head[1].toLowerCase();
    for (const call of templateCalls(chunk)) {
      const { name, params } = parseTemplate(call);
      if (!LISTING.has(name)) continue;
      const type = name === 'listing' ? (params.type || section).toLowerCase() : name;
      if (!TYPE_FALLBACK[type]) continue;

      const label = cleanName(plain(params.name || params.alt || ''));
      const content = plain(params.content || '');
      // Quality gate: a usable item needs a name, and either a description or a location.
      if (label.length < 2) continue;
      if (content.length < 25 && !params.lat) continue;
      if (EVENT_RE.test(`${label} ${content}`)) continue;

      const lat = parseFloat(params.lat);
      const lon = parseFloat(params.long ?? params.lng);
      items.push({
        id: `${citySlug}-${slug(label)}`,
        source: 'wikivoyage',
        sourceType: type,
        city,
        district: district || null,
        name: label,
        nameLocal: plain(params.alt || '') || null,
        theme: classify(type, label, content),
        descEn: content,
        address: plain(params.address || '') || null,
        lat: Number.isFinite(lat) ? +lat.toFixed(6) : null,
        lon: Number.isFinite(lon) ? +lon.toFixed(6) : null,
        hours: plain(params.hours || '') || null,
        priceEur: parsePrice(params.price),
        priceRaw: plain(params.price || '') || null,
        url: params.url || null,
        wikidata: params.wikidata || null,
        durationMin: DURATION[classify(type, label, content)],
      });
    }
  }
  return items;
}

/** Collect one city, merging its district sub-articles when the article is split. */
export async function collectCity(title, displayName, citySlug) {
  const main = await wikitext(title);
  if (!main) return { title, items: [], pages: [] };

  const pages = [{ title: main.title, text: main.text }];
  // District-split articles (Barcelona, Madrid) keep their listings on subpages.
  if (/\{\{\s*(district|huge ?city|guidecity)/i.test(main.text) || main.text.length > 60000) {
    for (const sub of await subpages(main.title)) {
      const page = await wikitext(sub);
      if (page) pages.push({ title: page.title, text: page.text });
    }
  }

  const seen = new Set();
  const items = [];
  for (const page of pages) {
    const district = page.title.includes('/') ? page.title.split('/').pop() : null;
    for (const item of itemsFromText(page.text, { city: displayName, citySlug, district })) {
      const key = item.wikidata || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return { title: main.title, items, pages: pages.map((p) => p.title) };
}
