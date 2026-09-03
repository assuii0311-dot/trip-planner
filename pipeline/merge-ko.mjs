#!/usr/bin/env node
// 새 형식 설명 패치를 기존 ko 파일에 접어 넣는다.
//   node pipeline/merge-ko.mjs teruel
// pipeline/ko-patch/<slug>.json 의 { id: {summary, why, booking?, busy?, caution?} } 를
// pipeline/ko/spain/<slug>.json 에 병합하고, 다 쓴 desc 는 지운다.
// name/theme/durationMin/energy/bestSlots 같은 기존 보정값은 그대로 둔다.
import { readFile, writeFile } from 'node:fs/promises';

/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, --country= 로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';

const slug = process.argv[2];
if (!slug) { console.error('usage: node pipeline/merge-ko.mjs <slug>'); process.exit(1); }

const koPath = new URL(`./ko/spain/${slug}.json`, import.meta.url);
const patchPath = new URL(`./ko-patch/${slug}.json`, import.meta.url);
const items = JSON.parse(await readFile(new URL(`../app/public/data/${COUNTRY}/cities/${slug}.json`, import.meta.url), 'utf8'));

let ko = {};
try { ko = JSON.parse(await readFile(koPath, 'utf8')); } catch { /* 첫 작성 */ }
const patch = JSON.parse(await readFile(patchPath, 'utf8'));

const live = new Set(items.map((i) => i.id));
const unknown = Object.keys(patch).filter((id) => !live.has(id));
if (unknown.length) console.error(`데이터에 없는 id ${unknown.length}개: ${unknown.join(', ')}`);

for (const [id, v] of Object.entries(patch)) {
  const prev = ko[id] ?? {};
  delete prev.desc;
  for (const k of ['booking', 'busy', 'caution']) if (v[k] === null) delete prev[k];
  ko[id] = { ...prev, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)) };
}

// 키 순서를 데이터 순서에 맞춰 다시 쓴다. 사람이 훑기 좋게.
const sorted = {};
for (const i of items) if (ko[i.id]) sorted[i.id] = ko[i.id];
for (const id of Object.keys(ko)) if (!sorted[id]) sorted[id] = ko[id];

await writeFile(koPath, `${JSON.stringify(sorted, null, 2)}\n`);
const done = items.filter((i) => sorted[i.id]?.summary && sorted[i.id]?.why).length;
console.log(`${slug}: ${done} / ${items.length} 새 형식`);
