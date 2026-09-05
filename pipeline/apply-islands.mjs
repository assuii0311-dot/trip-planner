/**
 * 섬 정체성과 섬 추가 항목을 이미 만들어 둔 데이터에 반영한다.
 *
 * 전체 수집을 다시 돌리면 위키 원본이 그동안 바뀌어 다른 결과가 나온다.
 * 지금 고치려는 것은 '섬을 자치주로 다뤘다' 는 모델 문제와 '도시 밖 명소가
 * 통째로 빠졌다' 는 누락 문제뿐이므로, 그 부분만 얹는다.
 *
 * 항목을 넣는 일 자체는 `src/extras.mjs` 가 한다 — 본토의 손으로 적은
 * 장소(`apply-manual.mjs`)와 같은 규칙을 쓰기 위해서다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { ISLANDS, ISLAND_OF } from './registry/spain-character.mjs';
import { ISLAND_EXTRAS } from './island-extras.mjs';
import { applyExtras } from './src/extras.mjs';

/* 데이터는 나라마다 폴더가 따로다. 기본은 스페인, 첫 인자로 바꾼다. */
const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const root = new URL(`../app/public/data/${COUNTRY}/`, import.meta.url);
const idx = JSON.parse(await readFile(new URL('index.json', root), 'utf8'));

idx.islands = ISLANDS;
for (const c of idx.cities) c.island = ISLAND_OF[c.slug] ?? null;

await applyExtras(root, idx, ISLAND_EXTRAS, '섬 추가 항목');

await writeFile(new URL('index.json', root), `${JSON.stringify(idx)}\n`);
console.log(`섬 ${ISLANDS.length}개 · 도시 ${idx.cities.filter((c) => c.island).length}곳에 island 부여`);
