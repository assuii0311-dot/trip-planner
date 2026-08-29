// Country -> candidate city list, with a measured item count for each.
// This is step 1-2 of the agreed process: list the cities in a country and
// report how much data each one actually yields, so cities can be excluded
// before the expensive full collection runs.
import { wikitext, subpages, templateCalls, parseTemplate, plain } from './wv.mjs';

/** Page titles linked from a `{{marker|type=city|name=[[X]]}}` call. */
function markerTargets(text, types = ['city', 'vicinity']) {
  const out = [];
  for (const call of templateCalls(text)) {
    const { name, params } = parseTemplate(call);
    if (name !== 'marker' || !types.includes((params.type || '').toLowerCase())) continue;
    const link = (params.name || '').match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (!link) continue;
    out.push({ title: link[1].trim(), label: plain(link[2] || link[1]).trim(), wikidata: params.wikidata || null });
  }
  return out;
}

/**
 * Region article titles referenced by a `{{Regionlist}}`.
 * Both `regionNname` and `regionNitems` have to be read: a single-community
 * region such as Andalusia is linked from the name alone and has no item list,
 * so reading only the items silently drops it and every town beneath it.
 */
function regionTargets(text) {
  const out = [];
  for (const call of templateCalls(text)) {
    const { name, params } = parseTemplate(call);
    if (name !== 'regionlist') continue;
    for (const [key, value] of Object.entries(params)) {
      if (!/^region\d+(items|name)$/.test(key)) continue;
      for (const m of value.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) out.push(m[1].trim());
    }
  }
  return out;
}

const LISTING_RE = /\{\{\s*(see|do|eat|drink|buy)\b/gi;

/** How many listings a city article yields, counting district subpages. */
export async function measure(title) {
  const page = await wikitext(title);
  if (!page) return null;
  let count = (page.text.match(LISTING_RE) ?? []).length;
  const pages = [page.title];
  if (/\{\{\s*(district|huge ?city|guidecity)/i.test(page.text) || page.text.length > 60000) {
    for (const sub of await subpages(page.title)) {
      const sp = await wikitext(sub);
      if (!sp) continue;
      count += (sp.text.match(LISTING_RE) ?? []).length;
      pages.push(sp.title);
    }
  }
  return { title: page.title, count, bytes: page.text.length, pages };
}

/**
 * Walk a country article and its regions to build the candidate city list.
 * `depth` 1 reads the country page only; 2 also reads each region page,
 * which is where most mid-size cities are listed.
 */
/**
 * Walk a country article and its region tree to build the candidate city list.
 * Andalusia-style regions list provinces rather than cities, so the walk has to
 * recurse: `depth` 1 reads the country page only, 2 adds its regions, 3 adds
 * their sub-regions, which is where towns like Ronda and Nerja are listed.
 */
export async function discover(country, { depth = 3, onProgress = () => {} } = {}) {
  const root = await wikitext(country);
  if (!root) throw new Error(`Wikivoyage has no article for "${country}"`);

  const candidates = new Map();
  const add = (c) => { if (!candidates.has(c.title)) candidates.set(c.title, c); };
  markerTargets(root.text).forEach(add);

  const visitedRegions = new Set([root.title]);
  let frontier = regionTargets(root.text);
  for (let level = 2; level <= depth && frontier.length; level++) {
    const next = [];
    for (const region of frontier) {
      if (visitedRegions.has(region)) continue;
      visitedRegions.add(region);
      onProgress({ phase: `region L${level}`, name: region });
      const page = await wikitext(region);
      if (!page) continue;
      markerTargets(page.text).forEach(add);
      next.push(...regionTargets(page.text));
    }
    frontier = next;
  }

  const rows = [];
  const seenCanonical = new Set();
  for (const c of candidates.values()) {
    onProgress({ phase: 'measure', name: c.label });
    const m = await measure(c.title);
    // [[Malaga]] and [[Málaga]] are the same article; keep one row per target.
    const canonical = m?.title ?? c.title;
    if (seenCanonical.has(canonical)) continue;
    seenCanonical.add(canonical);
    rows.push({
      label: c.label,
      title: m?.title ?? c.title,
      wikidata: c.wikidata,
      count: m?.count ?? 0,
      pages: m?.pages ?? [],
      grade: !m || m.count === 0 ? 'D' : m.count >= 40 ? 'A' : m.count >= 25 ? 'B' : 'C',
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}
