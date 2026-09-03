/** 동선 엔진이 상식에 맞는 순서를 내는지. */
import { readFile } from 'node:fs/promises';
const index = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const C = (s) => index.cities.find((c) => c.slug === s);
const { orderCities, measuredTable, assignLodging, buildHops } = await import('../src/lib/itinerary.ts');
const { fmtDur, MODE_ICON } = await import('../src/lib/routing.ts');
const measured = measuredTable(index.cities);

const cases = [
  { name: '나라를 가로지르는 조합', slugs: ['barcelona','seville','bilbao','madrid'], start: null, end: null },
  { name: '공항 고정 (BCN in / SVQ out)', slugs: ['barcelona','seville','madrid','valencia'], start: 'barcelona', end: 'seville' },
  { name: '안달루시아 + 근교', slugs: ['seville','cordoba','granada','malaga','ronda'], start: null, end: null },
  { name: '섬 포함', slugs: ['barcelona','palma','valencia'], start: 'barcelona', end: 'barcelona' },
];
for (const c of cases) {
  const cities = c.slugs.map(C);
  const naive = cities;
  const ordered = orderCities(cities, c.start, c.end, measured);
  const sum = (list) => { let t = 0; for (let i=1;i<list.length;i++){ const {fastest}=null??{}; } return t; };
  const { fastest } = await import('../src/lib/routing.ts');
  const key=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  const tot = (list) => list.slice(1).reduce((a,_,i)=>a+fastest(list[i],list[i+1],measured.get(key(list[i].slug,list[i+1].slug))).totalMin,0);
  console.log(`\n■ ${c.name}`);
  console.log(`  고른 순서 : ${naive.map(x=>x.name).join(' → ')}  (${fmtDur(tot(naive))})`);
  console.log(`  최적 순서 : ${ordered.map(x=>x.name).join(' → ')}  (${fmtDur(tot(ordered))})`);
  const saved = tot(naive)-tot(ordered);
  console.log(`  절약      : ${saved>0?fmtDur(saved):'없음(이미 최적)'}`);
  const stops = assignLodging(ordered, () => 1.2, measured);
  console.log(`  숙박      : ${stops.map(s=>s.sleep?`${s.city.name}(${s.nights}박)`:`${s.city.name}[당일치기←${C(s.base).name}]`).join(' · ')}`);
  for (const h of buildHops(stops, measured)) {
    console.log(`    ${h.from.name} → ${h.to.name}: ${h.options.map(o=>`${MODE_ICON[o.mode]}${fmtDur(o.totalMin)}`).join(' / ')}`);
  }
}
