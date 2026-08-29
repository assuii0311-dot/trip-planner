// Wikivoyage / Wikidata / Overpass access layer.
// No dependencies: Node 22 built-in fetch only.

const UA = 'trip-planner-pipeline/1.0 (https://github.com/assuii0311-dot/0829_kos_basic_001)';
const WV_API = 'https://en.wikivoyage.org/w/api.php';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with retry + backoff. Wikimedia asks for a polite crawl rate. */
export async function getJSON(base, params, { tries = 4, gap = 250 } = {}) {
  const url = `${base}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await sleep(gap);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(700 * 2 ** i);
    }
  }
}

/** Raw wikitext of a page, following redirects. Returns null when the page is missing. */
export async function wikitext(title) {
  const data = await getJSON(WV_API, { action: 'parse', page: title, prop: 'wikitext', redirects: '1' });
  if (data.error || !data.parse) return null;
  return { title: data.parse.title, text: data.parse.wikitext };
}

/** Subpages of a page, e.g. Barcelona/Eixample. Used for district-split city articles. */
export async function subpages(title) {
  const data = await getJSON(WV_API, { action: 'query', list: 'prefixsearch', pssearch: `${title}/`, pslimit: '50' });
  return (data.query?.prefixsearch ?? [])
    .map((p) => p.title)
    .filter((t) => t.startsWith(`${title}/`));
}

/**
 * Split a `{{template|a=1|b=2}}` call into its named parameters.
 * Brace/bracket aware so that nested templates and [[wiki links]] containing
 * a pipe do not terminate a parameter early.
 */
export function parseTemplate(src) {
  const body = src.slice(2, -2);
  const parts = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; buf += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; buf += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += body[i];
  }
  parts.push(buf);

  const name = parts.shift().trim().toLowerCase();
  const params = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return { name, params };
}

/** Every top-level `{{...}}` call in a page, as raw strings. */
export function templateCalls(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text.slice(i, i + 2) !== '{{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text.slice(j, j + 2) === '{{') { depth++; j++; continue; }
      if (text.slice(j, j + 2) === '}}') {
        depth--; j++;
        if (depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; }
      }
    }
  }
  return out;
}

/** Strip wiki markup down to plain prose. */
export function plain(s = '') {
  return s
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Labels and coordinates for Wikidata entities, batched 50 at a time. CC0, safe to store. */
export async function wikidataEntities(ids, langs = ['ko', 'es', 'en']) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await getJSON('https://www.wikidata.org/w/api.php', {
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'labels|claims',
      languages: langs.join('|'),
    });
    for (const [id, ent] of Object.entries(data.entities ?? {})) {
      if (ent.missing !== undefined) continue;
      const coord = ent.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      out[id] = {
        labels: Object.fromEntries(langs.map((l) => [l, ent.labels?.[l]?.value]).filter(([, v]) => v)),
        lat: coord?.latitude ?? null,
        lon: coord?.longitude ?? null,
        image: ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null,
      };
    }
  }
  return out;
}
