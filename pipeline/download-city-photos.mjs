#!/usr/bin/env node
/**
 * 도시 사진을 내려받아 앱에 함께 넣는다.
 *
 * 원격 링크로 두면 두 가지가 걸린다. 오프라인에서 카드가 비고, 위키미디어에
 * 닿지 못하는 망에서는 아예 안 보인다. 현지에서 로밍 없이 쓰는 것이 이 앱의
 * 전제이므로 사진도 함께 넣는다. 가로 560px 로 줄여 용량을 낮춘다.
 */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { Jimp } from 'jimp';

const WIDTH = 560;
const OUT = new URL('../app/public/city/', import.meta.url);
const TMP = new URL('./out/photo-tmp/', import.meta.url);

const media = JSON.parse(await readFile(new URL('./out/spain-media.json', import.meta.url), 'utf8'));
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

let ok = 0;
const failed = [];
for (const [slug, m] of Object.entries(media)) {
  const raw = new URL(`${slug}.orig`, TMP);
  const dest = new URL(`${slug}.jpg`, OUT);
  try {
    await stat(dest);
    ok++;
    continue; // 이미 받아 둔 것은 건너뛴다.
  } catch { /* 계속 */ }

  try {
    const res = await fetch(m.photo, { headers: { 'User-Agent': 'trip-planner-pipeline/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(raw, buf);
    // 가로 560px, 세로는 비율 유지. 카드는 132px 높이로 잘라 쓰므로 충분하다.
    const img = await Jimp.read(buf);
    if (img.bitmap.width > WIDTH) img.resize({ w: WIDTH });
    await writeFile(dest, await img.getBuffer('image/jpeg', { quality: 72 }));
    ok++;
    process.stderr.write(`\r받는 중 ${ok}/${Object.keys(media).length}`.padEnd(40));
  } catch (err) {
    failed.push(`${slug}: ${err.message}`);
  }
}
process.stderr.write('\n');
console.log(`사진 ${ok} / ${Object.keys(media).length}장 준비`);
if (failed.length) console.log('실패:', failed.join(' · '));
