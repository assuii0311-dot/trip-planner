/**
 * 손으로 적은 본토 장소를 이미 만들어 둔 데이터에 얹는다.
 *
 * 어떤 장소를 왜 넣는지는 `manual-extras.mjs` 머리말에 있다.
 * 넣는 일 자체는 `src/extras.mjs` 가 하고, 섬 항목(`apply-islands.mjs`)과
 * 같은 규칙을 쓴다.
 *
 * 넣은 뒤에는 언어판 수를 받아 채워야 한다:
 *
 *   node pipeline/apply-manual.mjs
 *   node pipeline/repopulate-popularity.mjs spain
 *
 *   npx tsx app/scripts/rank-truth.mjs   ← 등록부 결손이 줄었는지 본다
 */
import { readFile, writeFile } from 'node:fs/promises';
import { MANUAL_EXTRAS, MANUAL_FIXES } from './manual-extras.mjs';
import { applyExtras, applyFixes } from './src/extras.mjs';

const COUNTRY = process.argv.find((a) => /^--country=/.test(a))?.split('=')[1] ?? 'spain';
const root = new URL(`../app/public/data/${COUNTRY}/`, import.meta.url);
const idx = JSON.parse(await readFile(new URL('index.json', root), 'utf8'));

await applyExtras(root, idx, MANUAL_EXTRAS, '손으로 적은 장소');
await applyFixes(root, idx, MANUAL_FIXES, '잘못 분류된 항목');

await writeFile(new URL('index.json', root), `${JSON.stringify(idx)}\n`);
