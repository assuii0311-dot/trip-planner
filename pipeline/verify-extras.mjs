/** 섬 추가 항목의 좌표·Wikidata id 가 실제와 맞는지 다시 확인한다. */
import { ISLAND_EXTRAS } from './island-extras.mjs';
let bad = 0;
for (const it of ISLAND_EXTRAS) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${it.wikidata}.json`);
  if (!r.ok) { console.log(`  ✗ ${it.name} — HTTP ${r.status}`); bad++; continue; }
  const e = (await r.json()).entities[it.wikidata];
  const co = e?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  const label = e?.labels?.en?.value ?? e?.labels?.es?.value ?? e?.labels?.ca?.value ?? '?';
  if (!co) { console.log(`  ✗ ${it.name} — 좌표 없음 (${label})`); bad++; continue; }
  const d = Math.hypot(co.latitude - it.lat, co.longitude - it.lon);
  const ok = d < 0.02;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${it.name.padEnd(16)} ${it.wikidata.padEnd(10)} ${label.padEnd(28)} ${co.latitude.toFixed(5)},${co.longitude.toFixed(5)}`);
  await new Promise((s) => setTimeout(s, 700));
}
console.log(bad === 0 ? '\n✓ 섬 추가 항목 좌표 확인' : `\n✗ ${bad}건 불일치`);
process.exit(bad ? 1 : 0);
