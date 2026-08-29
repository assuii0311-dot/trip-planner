#!/usr/bin/env node
// Compact dump of collected items for the Korean curation pass.
// Usage: node pipeline/dump.mjs barcelona girona
import { readFile, readdir } from 'node:fs/promises';

// 손으로 쓴 한국어. 앞의 표시는  없음=완료, ~=옛 desc 만, !=미작성.
const koDir = new URL('./ko/spain/', import.meta.url);
const ko = {};
for (const f of await readdir(koDir)) {
  if (f.endsWith('.json')) Object.assign(ko, JSON.parse(await readFile(new URL(f, koDir), 'utf8')));
}
for (const slug of process.argv.slice(2)) {
  const items = JSON.parse(await readFile(new URL(`../app/public/data/cities/${slug}.json`, import.meta.url), 'utf8'));
  console.log(`### ${slug} (${items.length})`);
  for (const i of items) {
    const hand = ko[i.id] ?? {};
    const mark = hand.summary ? '' : hand.desc || hand.why ? '~' : '!';
    console.log([
      mark + i.id, i.theme, i.name,
      i.practical.price ?? '-', i.practical.closed ?? '-', i.practical.hours ?? '-',
      (i.summary || '').replace(/\s+/g, ' '),
      (i.why || '').replace(/\s+/g, ' ').slice(0, 200),
    ].join('\t'));
  }
  console.log();
}
