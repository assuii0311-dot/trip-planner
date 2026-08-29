#!/usr/bin/env node
// Compact dump of collected items for the Korean curation pass.
// Usage: node pipeline/dump.mjs barcelona girona
import { readFile } from 'node:fs/promises';
for (const slug of process.argv.slice(2)) {
  const items = JSON.parse(await readFile(new URL(`../app/public/data/cities/${slug}.json`, import.meta.url), 'utf8'));
  console.log(`### ${slug} (${items.length})`);
  for (const i of items) {
    console.log(`${i.id}\t${i.theme}\t${i.name}\t${i.desc.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
  console.log();
}
