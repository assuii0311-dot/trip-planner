/**
 * 손으로 적은 장소를 이미 만들어 둔 데이터에 얹는다.
 *
 * 수집기가 못 잡는 종류가 있다. 위키보이지 목록은 '건물 하나' 단위라
 * **거리·지구·산책로·곶**이 통째로 빠진다 — 코르도바 유대인 지구,
 * 그라나다 알바이신, 로그로뇨 칼레 라우렐, 네르하 유럽의 발코니가 그렇다.
 * 등록부가 대표로 꼽아 둔 것 중 20개가 그런 이유로 데이터에 없었다.
 *
 * 규칙 두 가지.
 *
 * 1. **좌표와 위키데이터 id 는 지어내지 않는다.** 위키데이터에서 받아
 *    확인한 것만 쓰고, 확인 못 한 것은 넣지 않는다.
 * 2. **언어판 수는 여기 적지 않는다.** 손으로 적으면 위키백과가 움직일
 *    때마다 틀린 값이 남는다. `repopulate-popularity.mjs` 가 id 로 받아
 *    채우므로 `sitelinks: null` 로 두고, `popularity` 는 그때까지 쓰는
 *    어림값이다.
 *
 * 전체 재수집을 하지 않는 이유는 `repopulate-popularity.mjs` 와 같다 —
 * 다시 돌리면 위키 원본이 그동안 바뀌어 장소 선정까지 달라진다.
 */
import { readFile, writeFile } from 'node:fs/promises';

/** 아이템 하나를 앱이 읽는 모양으로 만든다. */
function toItem(e) {
  return {
    id: e.id, name: e.name, nameEn: e.nameEn, nameLocal: e.nameLocal ?? e.nameEn, city: e.city,
    district: null, theme: e.theme, lat: e.lat, lon: e.lon,
    durationMin: e.durationMin, priceEur: e.priceEur, hours: e.hours ?? null,
    bestSlots: e.bestSlots, indoor: e.indoor,
    sitelinks: null, popularity: e.popularity,
    energy: e.energy, tags: e.tags, url: null, wikidata: e.wikidata,
    source: 'manual', attribution: 'Wikidata, CC0 (좌표) · 설명 직접 작성',
    summary: e.summary, why: e.why, practical: e.practical,
    caution: e.caution ?? null, photo: null,
  };
}

/**
 * `list` 의 항목을 도시 파일에 넣고 인덱스 집계를 맞춘다.
 * 이미 같은 id 가 있으면 건드리지 않는다 — 여러 번 돌려도 같다.
 */
export async function applyExtras(root, idx, list, label) {
  const byCity = new Map();
  for (const e of list) {
    const a = byCity.get(e.city) ?? [];
    a.push(e);
    byCity.set(e.city, a);
  }
  let total = 0;
  for (const [slug, extras] of byCity) {
    const f = new URL(`cities/${slug}.json`, root);
    const items = JSON.parse(await readFile(f, 'utf8'));
    const have = new Set(items.map((i) => i.id));
    let added = 0;
    for (const e of extras) {
      if (have.has(e.id)) continue;
      items.push(toItem(e));
      added++;
    }
    // collect.mjs 와 같은 모양(공백 없는 한 줄)으로 쓴다. 여기만 들여쓰기를
    // 하면 그 도시만 파일 모양이 달라져, 값 하나만 고쳐도 diff 가 수천 줄이 된다.
    await writeFile(f, JSON.stringify(items));
    const city = idx.cities.find((c) => c.slug === slug);
    if (city) {
      city.itemCount = items.length;
      const t = {};
      for (const i of items) t[i.theme] = (t[i.theme] ?? 0) + 1;
      city.themes = t;
    }
    total += added;
    console.log(`  ${slug.padEnd(22)} +${added}곳 → ${items.length}곳`);
  }
  console.log(`${label}: ${total}곳 추가`);
  return total;
}

/**
 * 이미 있는 항목의 몇 개 필드만 고친다.
 *
 * 추가와 달리 **덮어쓰는** 일이라, 목록에 적힌 필드만 건드리고 나머지는
 * 손대지 않는다. 없는 id 는 소리 없이 넘어가지 않고 알린다 — 수집 결과가
 * 바뀌어 고칠 대상이 사라졌다는 뜻이기 때문이다.
 */
export async function applyFixes(root, idx, fixes, label) {
  let done = 0;
  for (const fx of fixes) {
    const f = new URL(`cities/${fx.city}.json`, root);
    const items = JSON.parse(await readFile(f, 'utf8'));
    const it = items.find((i) => i.id === fx.id);
    if (!it) { console.log(`  ! ${fx.id} — 데이터에 없다. 고칠 대상이 사라졌는지 확인할 것`); continue; }
    const { id, city, ...patch } = fx;
    Object.assign(it, patch);
    await writeFile(f, JSON.stringify(items));
    const c = idx.cities.find((x) => x.slug === fx.city);
    if (c) { const t = {}; for (const i of items) t[i.theme] = (t[i.theme] ?? 0) + 1; c.themes = t; }
    console.log(`  ${fx.city.padEnd(22)} ${it.name} → ${Object.keys(patch).join(', ')}`);
    done++;
  }
  console.log(`${label}: ${done}곳 고침`);
  return done;
}
