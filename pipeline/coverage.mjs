#!/usr/bin/env node
// 아이템 설명 작성 진행률.
//   완료  summary + why 를 새 형식으로 쓴 것
//   구형  옛 desc 한 줄만 있는 것 (다시 써야 함)
//   미작성 영문 그대로인 것
import { readFile, readdir } from 'node:fs/promises';
/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, 첫 인자로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const dir = new URL(`../app/public/data/${COUNTRY}/cities/`, import.meta.url);
const koDir = new URL('./ko/spain/', import.meta.url);

const ko = {};
for (const f of await readdir(koDir)) {
  if (f.endsWith('.json')) Object.assign(ko, JSON.parse(await readFile(new URL(f, koDir), 'utf8')));
}

const state = (id) => {
  const k = ko[id];
  if (!k) return 'none';
  if (k.summary && k.why) return 'done';
  return 'old';
};

let done = 0; let old = 0; let none = 0;
const rows = [];
for (const f of (await readdir(dir)).sort()) {
  const items = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  const c = { done: 0, old: 0, none: 0 };
  for (const i of items) c[state(i.id)] += 1;
  done += c.done; old += c.old; none += c.none;
  rows.push({ city: f.replace('.json', ''), ...c, all: items.length });
}
console.log(`${'도시'.padEnd(24)} 완료  구형 미작성   전체`);
console.log('-'.repeat(52));
for (const r of rows.sort((a, b) => a.done / a.all - b.done / b.all)) {
  if (r.done === r.all) continue;
  console.log(`${r.city.padEnd(24)} ${String(r.done).padStart(4)} ${String(r.old).padStart(5)} ${String(r.none).padStart(5)} ${String(r.all).padStart(6)}`);
}
const total = done + old + none;
console.log(`\n새 형식 ${done} / ${total} (${((done / total) * 100).toFixed(1)}%)`
  + ` · 구형 ${old} · 미작성 ${none}`);
