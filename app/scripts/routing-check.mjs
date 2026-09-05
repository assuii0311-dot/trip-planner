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
  /*
   * 아래 셋은 실제로 틀렸던 값들이다.
   *
   * 바르셀로나~지로나·피게레스에는 고속(AVE·AVANT)과 완행(MD·REGIONAL)이
   * 섞여 다닌다. 전체 중앙값을 쓰던 때는 완행 쪽에 표본이 하나 더 많다는
   * 이유로 79분·110분이 나왔고(실제 38분·55분), 그 값이 렌터카에게 져서
   * 화면에 열차가 아예 안 나왔다.
   *
   * 산티아고~라코루냐는 고속철 축 목록에 라코루냐가 빠져 있어 후보가
   * 아예 없었다 — Avant 30분 구간을 렌터카 1시간 39분으로 안내했다.
   */
  ['barcelona', 'girona', 'ave', 38, 'AVE·AVANT 38분'],
  ['barcelona', 'figueres', 'ave', 55, 'AVE 55분'],
  ['santiago', 'a-coruna', 'ave', 30, 'Avant 30분'],
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
/* ── 섞여 다니는 구간을 어느 열차로 대표하는가 ────────────────────── */
console.log('\n=== 고속과 완행이 섞인 구간을 빠른 쪽으로 대표하는가 ===');
{
  /*
   * 한 구간에 성격이 다른 열차가 섞여 다닌다. 전부 섞어 중앙값을 내던
   * 때는 표본이 하나 더 많다는 이유로 완행 쪽 값이 나왔다. 21개 구간이
   * 그렇게 부풀어 있었고, 코르도바→타라고나는 **10시간 22분**으로
   * 안내됐다(실제 5시간).
   *
   * 위쪽 KNOWN 검사는 시간표를 올리기 전에 도는 추정값 검사라 이것을
   * 잡지 못한다. 여기는 실제 시간표가 올라온 뒤다.
   */
  const MIXED = [
    ['jerez', 'cordoba', 100, 150, 'Alvia 약 2시간'],
    ['cordoba', 'tarragona', 260, 350, 'AVE 약 5시간'],
    ['seville', 'malaga', 110, 160, 'AVANT 약 2시간'],
  ];
  for (const [a, b, lo, hi, label] of MIXED) {
    const svc = servicesBetween(city(a), city(b)).find((x) => x.timetable?.length);
    if (!svc) { console.log(`  ${a}→${b}: 실측 후보 없음 ✗`); bad++; continue; }
    const ok = svc.rideMin >= lo && svc.rideMin <= hi;
    if (!ok) bad++;
    console.log(`  ${(city(a).name + '→' + city(b).name).padEnd(24)} ${svc.label.padEnd(8)} ${String(svc.rideMin).padStart(4)}분 (기대 ${lo}~${hi}) ${ok ? '✓' : '✗ ' + label}`);
  }
}

/* ── 시간표에서 어느 편을 고르는가 ─────────────────────────────────── */
console.log('\n=== 먼저 떠나는 편이 아니라 먼저 닿는 편을 고르는가 ===');
{
  /*
   * 한 구간에 고속과 완행이 섞여 다닌다. 예전에는 탈 수 있는 첫 편을 그냥
   * 집어서, 09:56 완행(79분)을 타고 10:10 고속(41분)을 놓쳤다. 역에서 조금
   * 더 기다리는 쪽이 목적지에 40분 일찍 닿는데도 그랬다.
   *
   * 하루를 30분 간격으로 훑어, 고른 편의 도착이 **그 시각에 가능한 가장
   * 이른 도착**과 같은지 본다.
   */
  const svc = servicesBetween(city('barcelona'), city('girona')).find((x) => x.timetable?.length);
  if (!svc) { console.log('  실측 시간표 없음 ✗'); bad++; } else {
    let worst = 0, checked = 0, differ = 0;
    for (let ready = 5 * 60; ready <= 21 * 60; ready += 30) {
      const d = nextDeparture(svc, ready);
      if (!d) continue;
      checked++;
      const can = svc.timetable.filter((r) => r.d >= ready + svc.accessMin);
      const best = Math.min(...can.map((r) => r.a));
      const first = can[0].a;                      // 예전 방식이 골랐을 편
      if (first !== best) differ++;
      worst = Math.max(worst, (d.arriveAt - svc.egressMin) - best);
    }
    const ok = worst === 0;
    if (!ok) bad++;
    console.log(`  ${checked}개 시각 확인 · 가장 이른 도착보다 늦게 고른 적 ${worst}분 ${ok ? '✓' : '✗'}`);
    console.log(`  (그중 ${differ}개 시각에서 '첫 출발' 과 '가장 이른 도착' 이 서로 다르다 — 여기가 예전에 틀리던 자리)`);
    if (differ === 0) { console.log('  ✗ 두 방식이 갈리는 시각이 없어 이 검사는 아무것도 지키지 못한다'); bad++; }
  }
}

/* ── 긴 구간이 렌터카로 떨어지지 않는가 ───────────────────────────── */
console.log('\n=== 축이 달라도 고속철 환승이 후보로 나오는가 ===');
{
  /*
   * 그라나다→지로나는 렌터카 10시간 52분만 나왔다. 지로나가 고속철 축
   * 목록에 없어 환승 후보를 만들지 못했기 때문이다. 실제로는 마드리드에서
   * 갈아타 7~8시간이면 간다. 하루를 통째로 차 안에서 보내라는 안내였다.
   */
  const LONG = [
    ['granada', 'girona', 'AVE 환승'],
    ['seville', 'girona', 'AVE 환승'],
  ];
  for (const [a, b, label] of LONG) {
    const list = servicesBetween(city(a), city(b));
    const best = list[0];
    const rail = list.find((s) => s.mode === 'ave');
    const ok = Boolean(rail) && best.mode !== 'car';
    if (!ok) bad++;
    console.log(`  ${(city(a).name + '→' + city(b).name).padEnd(22)} 최선 ${best.label} ${fmtDur(best.totalMin)}`
      + ` · 고속철 ${rail ? fmtDur(rail.totalMin) : '없음'} ${ok ? '✓' : '✗ ' + label}`);
  }
}

console.log(bad ? `\n✗ ${bad}건 어긋남` : '\n✓ 교통 엔진 정상');
process.exit(bad ? 1 : 0);
