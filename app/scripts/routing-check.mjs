/**
 * 교통 엔진이 상식에 맞는 값을 내는지 검사한다.
 * 실제로 알려진 소요 시간과 비교해, 크게 어긋나면 실패시킨다.
 */
import { readFile } from 'node:fs/promises';
const index = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const city = (s) => index.cities.find((c) => c.slug === s);

const { servicesBetween, nextDeparture, fmtHm, fmtDur, MODE_ICON } =
  await import('../src/lib/routing.ts');

/** 실제로 알려진 값 (Renfe·ALSA 공식 소요 시간, 탑승 시간 기준) */
const KNOWN = [
  ['madrid', 'barcelona', 'ave', 170, 'AVE 2시간 30분~3시간'],
  ['madrid', 'seville', 'ave', 155, 'AVE 2시간 30분'],
  ['madrid', 'malaga', 'ave', 175, 'AVE 2시간 40분'],
  ['madrid', 'valencia', 'ave', 115, 'AVE 1시간 50분'],
  ['madrid', 'cordoba', 'ave', 105, 'AVE 1시간 45분'],
  ['seville', 'cordoba', 'ave', 45, 'AVE 45분'],
  ['barcelona', 'valencia', 'ave', 175, 'Euromed 2시간 55분'],
  ['madrid', 'bilbao', 'train', 300, 'Alvia 약 5시간 (고속철 없음)'],
];

let bad = 0;
console.log('구간                     수단        엔진 탑승   실제      차이');
console.log('-'.repeat(72));
for (const [a, b, mode, realRide, label] of KNOWN) {
  const svcs = servicesBetween(city(a), city(b));
  const s = svcs.find((x) => x.mode === mode);
  if (!s) { console.log(`${a}→${b}: ${mode} 후보 없음 ✗`); bad++; continue; }
  const diff = s.rideMin - realRide;
  const pct = Math.abs(diff) / realRide;
  const ok = pct <= 0.3;
  if (!ok) bad++;
  console.log(`${(city(a).name+'→'+city(b).name).padEnd(24)} ${mode.padEnd(8)} ${String(s.rideMin).padStart(6)}분 ${String(realRide).padStart(6)}분 ${(diff>0?'+':'')+diff}분 ${ok?'':'✗ '+label}`);
}

console.log('\n=== 수단 비교: 마드리드 → 바르셀로나 (아침 9시 출발 준비) ===');
for (const s of servicesBetween(city('madrid'), city('barcelona'))) {
  const d = nextDeparture(s, 9 * 60);
  console.log(`${MODE_ICON[s.mode]} ${s.label.padEnd(16)} 문앞~문앞 ${fmtDur(d.doorToDoorMin).padStart(9)} · ${fmtHm(d.leaveAt)} 출발 → ${fmtHm(d.arriveAt)} 도착 · 대기 ${s.headwayMin?d.waitMin+'분':'없음'} · €${s.costEur}`);
}

console.log('\n=== 막차 이후: 마드리드 → 세비야, 밤 10시 준비 ===');
const late = servicesBetween(city('madrid'), city('seville'))
  .map((s) => [s, nextDeparture(s, 22 * 60)]);
for (const [s, d] of late) console.log(`  ${s.label.padEnd(18)} ${d ? fmtHm(d.departAt)+' 출발' : '막차 끊김 — 그날은 못 감'}`);

console.log('\n=== 섬: 바르셀로나 → 팔마 ===');
for (const s of servicesBetween(city('barcelona'), city('palma'))) {
  console.log(`  ${MODE_ICON[s.mode]} ${s.label} · 문앞~문앞 ${fmtDur(s.totalMin)}`);
}


// ── 실제 시간표(Renfe GTFS) 검증 ────────────────────────────────────────
const { setRailTable, railBetween, railOnDay } = await import('../src/lib/rail.ts');
let rail = null;
try {
  rail = JSON.parse(await readFile(new URL('../public/data/spain/rail.json', import.meta.url), 'utf8'));
} catch { /* 없으면 건너뛴다 */ }

if (!rail) {
  console.log('\n실제 시간표 파일이 없습니다. pipeline/fetch-renfe-gtfs.mjs 를 먼저 돌리세요.');
} else {
  setRailTable(rail);
  console.log(`\n=== 실제 시간표 (${rail.source}, ${rail.validFrom}~${rail.validTo}) ===`);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (today > rail.validTo) { console.log(`✗ 시간표가 ${rail.validTo} 로 만료됐습니다. 다시 받아야 합니다.`); bad++; }

  // 알려진 최단 소요와 대조한다. 시간표는 편마다 다르므로 가장 빠른 편으로 본다.
  const FASTEST = [
    ['madrid', 'barcelona', 150, 200],
    ['madrid', 'seville', 140, 180],
    ['seville', 'cordoba', 35, 60],
    ['madrid', 'malaga', 150, 200],
    ['madrid', 'bilbao', 280, 340],
  ];
  for (const [a, b, lo, hi] of FASTEST) {
    const list = railBetween(a, b);
    if (!list) { console.log(`  ${a}→${b}: 직통 없음 ✗`); bad++; continue; }
    const best = Math.min(...list.map((r) => r.a - r.d));
    const ok = best >= lo && best <= hi;
    if (!ok) bad++;
    console.log(`  ${(city(a).name + '→' + city(b).name).padEnd(24)} ${String(list.length).padStart(3)}편 · 최단 ${best}분 (기대 ${lo}~${hi}) ${ok ? '✓' : '✗'}`);
  }

  // 요일 필터가 실제로 거르는지
  const mon = railOnDay(railBetween('madrid', 'barcelona'), 1);
  const sun = railOnDay(railBetween('madrid', 'barcelona'), 0);
  console.log(`  요일 필터: 월 ${mon.length}편 · 일 ${sun.length}편 ${mon.length && sun.length ? '✓' : '✗'}`);
  if (!mon.length || !sun.length) bad++;
}
process.exit(bad ? 1 : 0);
