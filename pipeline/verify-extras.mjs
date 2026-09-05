/**
 * 손으로 넣은 항목의 좌표·위키데이터 id 가 실제와 맞는지 다시 확인한다.
 *
 * 좌표는 지어내면 안 되는 값이다. 한 번 잘못 적으면 지도에서만 티가 나고
 * 검사로는 안 잡힌다 — 그래서 위키데이터에 직접 물어 대조한다.
 * 섬 항목(`island-extras.mjs`)과 본토 항목(`manual-extras.mjs`)을 함께 본다.
 *
 *   node pipeline/verify-extras.mjs
 */
import { ISLAND_EXTRAS } from './island-extras.mjs';
import { MANUAL_EXTRAS } from './manual-extras.mjs';

const ALL = [...ISLAND_EXTRAS.map((e) => ({ ...e, from: '섬' })),
             ...MANUAL_EXTRAS.map((e) => ({ ...e, from: '본토' }))];
let bad = 0;
for (const it of ALL) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${it.wikidata}.json`);
  if (!r.ok) { console.log(`  ✗ ${it.name} — HTTP ${r.status}`); bad++; continue; }
  const e = (await r.json()).entities[it.wikidata];
  const co = e?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  const label = e?.labels?.en?.value ?? e?.labels?.es?.value ?? e?.labels?.ca?.value ?? e?.labels?.gl?.value ?? '?';
  if (!co) { console.log(`  ✗ ${it.name} — 좌표 없음 (${label})`); bad++; continue; }
  const d = Math.hypot(co.latitude - it.lat, co.longitude - it.lon);
  const ok = d < 0.02;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${it.from.padEnd(3)} ${it.name.slice(0, 18).padEnd(20)} ${it.wikidata.padEnd(11)} ${label.slice(0, 30).padEnd(32)} ${co.latitude.toFixed(5)},${co.longitude.toFixed(5)}`);
  await new Promise((s) => setTimeout(s, 700));
}
console.log(bad === 0 ? `\n✓ 손으로 넣은 ${ALL.length}곳의 좌표 확인` : `\n✗ ${bad}건 불일치`);
process.exit(bad ? 1 : 0);
