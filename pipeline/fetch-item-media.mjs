#!/usr/bin/env node
/**
 * 아이템 대표 사진을 모은다.
 *
 * 아이템의 위키데이터 Q번호 → P18(대표 이미지) → 커먼즈 축소본 URL + 저작자·라이선스.
 * 도시 사진(fetch-city-media.mjs)과 같은 경로를 쓰지만, 출발점이 Wikivoyage 문서
 * 제목이 아니라 이미 수집해 둔 아이템의 Q번호라는 점만 다르다.
 *
 * 결과는 out/<country>-item-media.json 에 남기고, collect.mjs 가 이것을 읽어
 * 아이템에 붙인다. 사진을 앱에 함께 넣을지(대표급) 원격으로 띄울지는
 * download-item-photos.mjs 와 앱이 정한다.
 */
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { getJSON } from './src/wv.mjs';

const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const countrySlug = process.argv[2] ?? 'spain';

/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, 첫 인자로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const dir = new URL(`../app/public/data/${COUNTRY}/cities/`, import.meta.url);
const items = [];
for (const f of (await readdir(dir)).sort()) {
  if (f.endsWith('.json')) items.push(...JSON.parse(await readFile(new URL(f, dir), 'utf8')));
}

// Q번호 하나에 아이템이 여러 개 걸릴 수 있다(같은 대상이 두 도시에 잡힌 경우).
const byQid = new Map();
for (const it of items) {
  if (!it.wikidata) continue;
  const list = byQid.get(it.wikidata) ?? [];
  list.push(it.id);
  byQid.set(it.wikidata, list);
}
const qids = [...byQid.keys()];
console.error(`아이템 ${items.length}개 중 위키데이터 보유 ${qids.length}건`);

/** Q번호 → P18 이미지 파일명 */
async function imagesFor(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await getJSON(WD, {
      action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims',
    });
    for (const [qid, ent] of Object.entries(data.entities ?? {})) {
      const file = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (file) out[qid] = file;
    }
    process.stderr.write(`\r대표 이미지 조회 ${Math.min(i + 50, ids.length)}/${ids.length}`.padEnd(40));
  }
  process.stderr.write('\n');
  return out;
}

/** 커먼즈 파일명 → 저작자와 라이선스. 표기 의무를 지키려면 반드시 있어야 한다. */
async function creditsFor(files) {
  const out = {};
  for (let i = 0; i < files.length; i += 25) {
    const data = await getJSON(COMMONS, {
      action: 'query', prop: 'imageinfo', iiprop: 'extmetadata',
      titles: files.slice(i, i + 25).map((f) => `File:${f}`).join('|'),
    });
    for (const page of data.query?.pages ?? []) {
      const meta = page.imageinfo?.[0]?.extmetadata ?? {};
      const strip = (s) => (s ? String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null);
      out[page.title.replace(/^File:/, '')] = {
        author: strip(meta.Artist?.value),
        license: strip(meta.LicenseShortName?.value),
      };
    }
    process.stderr.write(`\r저작자·라이선스 조회 ${Math.min(i + 25, files.length)}/${files.length}`.padEnd(40));
  }
  process.stderr.write('\n');
  return out;
}

const images = await imagesFor(qids);
const files = [...new Set(Object.values(images))];
const credits = await creditsFor(files);

const media = {};
for (const [qid, file] of Object.entries(images)) {
  const c = credits[file] ?? {};
  const enc = encodeURIComponent(file);
  for (const id of byQid.get(qid) ?? []) {
    media[id] = {
      file,
      // Special:FilePath 는 원본으로 리다이렉트하고, width 를 주면 축소본이 온다.
      remote: `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=400`,
      author: c.author ?? null,
      license: c.license ?? null,
      source: `https://commons.wikimedia.org/wiki/File:${enc}`,
    };
  }
}

await mkdir(new URL('./out/', import.meta.url), { recursive: true });
await writeFile(
  new URL(`./out/${countrySlug}-item-media.json`, import.meta.url),
  JSON.stringify(media, null, 2),
);

const withWd = items.filter((i) => i.wikidata).length;
console.log(`사진 확보 ${Object.keys(media).length}개 (위키데이터 보유 ${withWd}개 중)`);
const noLicense = Object.entries(media).filter(([, m]) => !m.license).length;
if (noLicense) console.log(`⚠ 라이선스 정보 없음 ${noLicense}개 — 표기 의무를 지킬 수 없으므로 앱에서 제외한다`);
