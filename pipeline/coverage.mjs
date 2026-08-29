#!/usr/bin/env node
// 한국어 정제 진행률. 아직 영어로 남은 아이템이 몇 개인지 도시별로 보여준다.
import { readFile, readdir } from 'node:fs/promises';
const dir = new URL('../app/public/data/cities/', import.meta.url);
const koDir = new URL('./ko/spain/', import.meta.url);

const ko = {};
for (const f of await readdir(koDir)) {
  if (f.endsWith('.json')) Object.assign(ko, JSON.parse(await readFile(new URL(f, koDir), 'utf8')));
}
let done = 0; let total = 0;
const rows = [];
for (const f of (await readdir(dir)).sort()) {
  const items = JSON.parse(await readFile(new URL(f, dir), 'utf8'));
  const n = items.filter((i) => ko[i.id]).length;
  done += n; total += items.length;
  rows.push({ city: f.replace('.json', ''), n, all: items.length });
}
for (const r of rows.sort((a, b) => a.n / a.all - b.n / b.all)) {
  if (r.n === r.all) continue;
  console.log(`${r.city.padEnd(24)} ${String(r.n).padStart(4)} / ${String(r.all).padStart(4)}`);
}
console.log(`\n한국어 정제 ${done} / ${total} (${((done / total) * 100).toFixed(1)}%)`);
