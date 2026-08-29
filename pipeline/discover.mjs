#!/usr/bin/env node
// Usage: node pipeline/discover.mjs Spain [--depth 2] [--out pipeline/out/spain-candidates.json]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { discover } from './src/discover.mjs';

const args = process.argv.slice(2);
const country = args.find((a) => !a.startsWith('--'));
if (!country) {
  console.error('Usage: node pipeline/discover.mjs <Country> [--depth 1|2] [--out <file>]');
  process.exit(1);
}
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const out = flag('out', `pipeline/out/${country.toLowerCase().replace(/\s+/g, '-')}-candidates.json`);

console.error(`Discovering cities in ${country} ...`);
const rows = await discover(country, {
  depth: Number(flag('depth', 3)),
  onProgress: ({ phase, name }) => process.stderr.write(`\r  ${phase}: ${name}`.padEnd(60)),
});
process.stderr.write('\n');

const width = Math.max(...rows.map((r) => r.label.length), 6);
console.log(`${'CITY'.padEnd(width)}  GRADE  ITEMS  ARTICLE`);
for (const r of rows) {
  console.log(`${r.label.padEnd(width)}  ${r.grade.padEnd(5)}  ${String(r.count).padStart(5)}  ${r.title}`);
}
const tally = rows.reduce((acc, r) => ({ ...acc, [r.grade]: (acc[r.grade] ?? 0) + 1 }), {});
console.log(`\n${rows.length} candidates — ` + ['A', 'B', 'C', 'D'].map((g) => `${g}:${tally[g] ?? 0}`).join('  '));
console.log('A >=40 listings, B 25-39, C 1-24, D none (needs OSM/manual)');

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(rows, null, 2));
console.log(`\nWrote ${out}`);
