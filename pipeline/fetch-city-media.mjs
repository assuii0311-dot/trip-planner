#!/usr/bin/env node
/**
 * 도시 카드에 쓸 대표 사진과 위키데이터 식별자를 모은다.
 * Wikivoyage 문서 → wikibase item → P18(대표 이미지) → Commons FilePath URL.
 * Commons 이미지는 자유 라이선스이지만 저작자 표시가 필요하므로
 * 파일명과 라이선스, 저작자를 함께 저장한다.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { getJSON } from './src/wv.mjs';
import { CITIES } from './registry/spain.mjs';

const WV = 'https://en.wikivoyage.org/w/api.php';
const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/** Wikivoyage 문서 제목 → 위키데이터 Q번호 */
async function qidsFor(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const data = await getJSON(WV, {
      action: 'query', prop: 'pageprops', ppprop: 'wikibase_item',
      titles: batch.join('|'), redirects: '1',
    });
    const norm = new Map();
    for (const n of data.query?.normalized ?? []) norm.set(n.to, n.from);
    for (const r of data.query?.redirects ?? []) norm.set(r.to, r.from);
    for (const page of data.query?.pages ?? []) {
      const qid = page.pageprops?.wikibase_item;
      if (!qid) continue;
      // 정규화·리다이렉트를 거슬러 올라가 원래 요청한 제목을 찾는다.
      let title = page.title;
      const seen = new Set();
      while (norm.has(title) && !seen.has(title)) { seen.add(title); title = norm.get(title); }
      out[title] = qid;
    }
  }
  return out;
}

/** Q번호 → P18 이미지 파일명 */
async function imagesFor(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const data = await getJSON(WD, {
      action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'claims',
    });
    for (const [qid, ent] of Object.entries(data.entities ?? {})) {
      const file = ent.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (file) out[qid] = file;
    }
  }
  return out;
}

/** Commons 파일명 → 저작자와 라이선스 */
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
  }
  return out;
}

const titles = CITIES.map((c) => c.title);
console.error(`위키데이터 식별자 조회 중 (${titles.length}곳)…`);
const qids = await qidsFor(titles);

const wanted = CITIES.map((c) => qids[c.title]).filter(Boolean);
console.error(`대표 이미지 조회 중 (${wanted.length}곳)…`);
const images = await imagesFor(wanted);

const files = [...new Set(Object.values(images))];
console.error(`저작자·라이선스 조회 중 (${files.length}건)…`);
const credits = await creditsFor(files);

const media = {};
const missing = [];
for (const c of CITIES) {
  const qid = qids[c.title];
  const file = qid ? images[qid] : null;
  if (!file) { missing.push(c.slug); continue; }
  media[c.slug] = {
    wikidata: qid,
    // Special:FilePath 는 원본으로 리다이렉트한다. width 를 주면 축소본이 온다.
    photo: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=900`,
    photoFile: file,
    photoAuthor: credits[file]?.author ?? null,
    photoLicense: credits[file]?.license ?? null,
  };
}

await mkdir(new URL('./out/', import.meta.url), { recursive: true });
await writeFile(new URL('./out/spain-media.json', import.meta.url), JSON.stringify(media, null, 2));
console.log(`사진 확보 ${Object.keys(media).length} / ${CITIES.length}곳`);
if (missing.length) console.log(`사진 없음: ${missing.join(', ')}`);
const noCredit = Object.entries(media).filter(([, m]) => !m.photoLicense).map(([s]) => s);
if (noCredit.length) console.log(`라이선스 정보 없음: ${noCredit.join(', ')}`);
