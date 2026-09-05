import { readFileSync, existsSync } from 'node:fs';
import { isMeal } from '../src/lib/capacity.ts';
const here=(p)=>new URL(p,import.meta.url);
const idx=JSON.parse(readFileSync(here('../public/data/spain/index.json'),'utf8'));
const all=[];
for (const c of idx.cities){const f=here(`../public/data/spain/cities/${c.slug}.json`);
  if(existsSync(f)) for(const i of JSON.parse(readFileSync(f,'utf8'))) all.push({i,c});}
const sights=all.filter(x=>!isMeal(x.i));
const noWd=sights.filter(x=>!x.i.wikidata);
const noWdCoord=noWd.filter(x=>x.i.lat!=null&&x.i.lon!=null);
const noWdNoCoord=noWd.filter(x=>x.i.lat==null||x.i.lon==null);
console.log(`볼거리 ${sights.length}곳`);
console.log(`  wikidata 있음            ${sights.length-noWd.length}곳 (${Math.round((sights.length-noWd.length)/sights.length*100)}%)`);
console.log(`  wikidata 없음            ${noWd.length}곳 (${Math.round(noWd.length/sights.length*100)}%)`);
console.log(`     그중 좌표 있음 (찾을 수 있음) ${noWdCoord.length}곳`);
console.log(`     그중 좌표 없음 (못 찾음)      ${noWdNoCoord.length}곳`);
console.log(`\n  wikidata 없는 것의 출처: ${JSON.stringify(noWd.reduce((a,x)=>{a[x.i.source??'-']=(a[x.i.source??'-']??0)+1;return a;},{}))}`);
const th={}; for(const x of noWdCoord) th[x.i.theme]=(th[x.i.theme]??0)+1;
console.log(`  좌표 있는 것의 테마: ${Object.entries(th).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(' · ')}`);
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/nowd.json', JSON.stringify(noWdCoord.map(x=>({
  name:x.i.name, nameEn:x.i.nameEn, city:x.c.name, citySlug:x.c.slug,
  lat:x.i.lat, lon:x.i.lon, theme:x.i.theme, pop:x.i.popularity })),null,0));
console.log(`\n  → 좌표 있는 ${noWdCoord.length}곳을 /tmp/nowd.json 에 적었다`);
