#!/usr/bin/env node
// 설명 작성용 덤프. 도시 하나의 아이템을 한 줄씩, 원문과 함께 보여준다.
// 앞의 표시 — 공백: 새 형식 완료, ~: 옛 desc 만 있음, !: 아직 손 안 댐.
//   node pipeline/dump.mjs teruel
import { readFile, readdir } from 'node:fs/promises';

/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, --country= 로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';

const koDir = new URL('./ko/spain/', import.meta.url);
const ko = {};
for (const f of await readdir(koDir)) {
  if (f.endsWith('.json')) Object.assign(ko, JSON.parse(await readFile(new URL(f, koDir), 'utf8')));
}

/** 원문 영어 설명. 본선/대표명소/보강 캐시 세 군데에 흩어져 있다. */
async function englishFor(slug) {
  const en = {};
  const add = (id, text) => { if (id && text && !en[id]) en[id] = text; };
  try {
    const raw = JSON.parse(await readFile(new URL(`./out/raw/${slug}.json`, import.meta.url), 'utf8'));
    for (const it of raw.items) add(it.id, it.descEn);
  } catch { /* 캐시 없음 */ }
  for (const suffix of ['-headline', '-fill']) {
    try {
      const list = JSON.parse(await readFile(new URL(`./out/raw/${slug}${suffix}.json`, import.meta.url), 'utf8'));
      for (const it of list) add(it.id, it.desc);
    } catch { /* 캐시 없음 */ }
  }
  return en;
}

for (const slug of process.argv.slice(2)) {
  const items = JSON.parse(await readFile(new URL(`../app/public/data/${COUNTRY}/cities/${slug}.json`, import.meta.url), 'utf8'));
  const en = await englishFor(slug);
  console.log(`### ${slug} (${items.length})`);
  for (const i of items) {
    const hand = ko[i.id] ?? {};
    const mark = hand.summary && hand.why ? ' ' : hand.desc ? '~' : '!';
    const p = i.practical;
    console.log([
      mark + i.id,
      i.theme,
      i.name,
      i.nameEn,
      `${p.price ?? '-'} | ${p.closed ?? '-'} | ${p.hours ?? '-'}`,
      `KO: ${(hand.desc ?? hand.why ?? '').replace(/\s+/g, ' ')}`,
      `EN: ${(en[i.id] ?? '').replace(/\s+/g, ' ').slice(0, 240)}`,
    ].join('\t'));
  }
  console.log();
}
