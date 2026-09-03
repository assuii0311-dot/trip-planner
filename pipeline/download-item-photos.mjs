#!/usr/bin/env node
/**
 * 대표급 아이템 사진만 내려받아 앱에 함께 넣는다.
 *
 * 사진이 있는 아이템은 1,053개지만 전부 넣으면 앱이 30MB를 넘는다.
 * 현지에서 로밍 없이 쓰는 것이 전제라 오프라인 동작을 포기할 수는 없으므로,
 * 3단계에서 눈에 먼저 들어와야 하는 대표급(인기도 4 이상)만 담고
 * 나머지는 앱이 위키미디어 축소본을 원격으로 띄운다.
 *
 * 가로 400px — 목록 썸네일이 96px 이므로 고해상도 화면에서도 충분하다.
 */
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { Jimp } from 'jimp';

const WIDTH = 400;
const MIN_POPULARITY = Number(process.env.MIN_POPULARITY ?? 4);
const countrySlug = process.argv[2] ?? 'spain';
const OUT = new URL('../app/public/item/', import.meta.url);

const media = JSON.parse(await readFile(new URL(`./out/${countrySlug}-item-media.json`, import.meta.url), 'utf8'));
/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, 첫 인자로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const dir = new URL(`../app/public/data/${COUNTRY}/cities/`, import.meta.url);
const items = [];
for (const f of (await readdir(dir)).sort()) {
  if (f.endsWith('.json')) items.push(...JSON.parse(await readFile(new URL(f, dir), 'utf8')));
}

const wanted = items.filter((i) => i.popularity >= MIN_POPULARITY && media[i.id]);
console.error(`인기도 ${MIN_POPULARITY} 이상 · 사진 있음: ${wanted.length}개`);

await mkdir(OUT, { recursive: true });
let ok = 0;
const failed = [];
for (const it of wanted) {
  const dest = new URL(`${it.id}.jpg`, OUT);
  try {
    await stat(dest);
    ok += 1;
    continue; // 이미 받아 둔 것은 건너뛴다.
  } catch { /* 계속 */ }

  try {
    // 원본은 수 MB 짜리도 있다. 커먼즈에 축소본을 요청해 받는다.
    const url = media[it.id].remote.replace(/width=\d+/, `width=${WIDTH * 2}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'trip-planner-pipeline/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const img = await Jimp.read(Buffer.from(await res.arrayBuffer()));
    if (img.bitmap.width > WIDTH) img.resize({ w: WIDTH });
    await writeFile(dest, await img.getBuffer('image/jpeg', { quality: 70 }));
    ok += 1;
    process.stderr.write(`\r받는 중 ${ok}/${wanted.length}`.padEnd(40));
  } catch (err) {
    failed.push(`${it.id}: ${err.message}`);
  }
}
process.stderr.write('\n');
console.log(`사진 ${ok} / ${wanted.length}장 준비`);
if (failed.length) console.log(`실패 ${failed.length}건:\n  ${failed.slice(0, 10).join('\n  ')}`);
