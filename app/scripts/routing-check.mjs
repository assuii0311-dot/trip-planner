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

/* ── 전 구간 훑기: 고른 편이 정말 최선인가 ───────────────────────── */
/*
 * 두 번 같은 모양으로 틀렸다.
 *
 *   그라나다 → 지로나 : 렌터카 10시간 52분  (후보를 못 만들어서)
 *   말라가  → 그라나다 : 09:30 출발 18:15 도착 (고르는 숫자가 대기를 빼서)
 *
 * 원인은 달랐지만 증상은 같다 — 아침에 나서 저녁에 닿는 안을 '가장 빠른
 * 것' 이라 부르고 화면에 올렸다. 한 구간씩 알려질 때마다 고치면 세 번째가
 * 온다. 그래서 구간을 하나씩 보지 않고 **전부** 본다.
 *
 * 지키는 것 하나: 어느 구간, 어느 시각에 나서든, 앱이 고른 편이 그때 갈 수
 * 있는 가장 이른 도착보다 크게 늦지 않는다. 렌터카는 언제든 떠날 수 있으므로
 * 이 한 줄이 '몇 시간을 역에서 기다리는 안' 과 '하루를 차 안에서 보내는 안'
 * 을 둘 다 막는다.
 */
console.log('\n=== 전 구간 훑기 — 고른 편이 그때의 최선과 얼마나 벌어지는가 ===');
{
  const { bestFrom } = await import('../src/lib/routing.ts');
  /** 근교 규칙(렌터카를 되도록 피함)이 허용하는 여유. routing.ts 의 AVOID_MARGIN. */
  const SLACK = 30;
  const READY = [7 * 60, 9 * 60 + 30, 12 * 60, 15 * 60 + 30, 19 * 60];
  const slugs = index.cities.map((c) => c.slug);

  let n = 0;
  const off = [];   // 최선과 벌어진 경우
  for (const a of slugs) {
    for (const b of slugs) {
      if (a === b) continue;
      const svc = servicesBetween(city(a), city(b));
      for (const ready of READY) {
        const runs = svc.map((x) => nextDeparture(x, ready)).filter(Boolean);
        if (!runs.length) continue;
        const best = runs.reduce((p, q) => (q.arriveAt < p.arriveAt ? q : p));
        // 앱이 실제로 쓰는 두 규칙 그대로.
        for (const [rule, picked] of [
          ['이동', bestFrom(svc, ready)],
          ['근교', bestFrom(svc, ready, { avoid: 'car' })],
        ]) {
          if (!picked) continue;
          const d = nextDeparture(picked, ready);
          if (!d) continue;
          n++;
          const gap = d.arriveAt - best.arriveAt;
          const limit = rule === '근교' ? SLACK : 0;
          if (gap > limit) {
            off.push({ a, b, ready, rule, gap, picked: picked.label, best: best.service.label });
          }
        }
      }
    }
  }
  off.sort((x, y) => y.gap - x.gap);
  const worst = off.length ? off[0].gap : 0;
  console.log(`  ${n}가지 (구간 × 나서는 시각 × 규칙) 확인 · 한도를 넘은 것 ${off.length}건 · 가장 벌어진 것 ${worst}분`);
  for (const o of off.slice(0, 8)) {
    console.log(`    ✗ ${city(o.a).name}→${city(o.b).name} ${fmtHm(o.ready)} 나섬 [${o.rule}]`
      + ` — 고른 것 ${o.picked} 가 최선(${o.best})보다 ${fmtDur(o.gap)} 늦다`);
  }
  if (off.length) bad += off.length;
  else console.log('  ✓ 어느 구간도 최선보다 크게 늦은 편을 고르지 않는다');
}

/* ── 자정을 넘겨 닿는 이동 ─────────────────────────────────────────── */
/*
 * `fmtHm` 은 1440분으로 나눈 나머지를 쓴다. 그래서 자정을 넘겨 닿으면
 * "09:30 숙소 출발 · 00:09 도착" — 떠나기 전에 닿는 것처럼 보인다.
 * 계산은 맞는데 화면이 다른 말을 하는, 이 저장소가 되풀이해 온 모양이다.
 */
console.log('\n=== 자정을 넘겨 닿으면 그렇다고 말하는가 ===');
{
  const { fmtDayHm, bestFrom } = await import('../src/lib/routing.ts');
  const slugs = index.cities.map((c) => c.slug);
  const late = [];
  for (const a of slugs) {
    for (const b of slugs) {
      if (a === b) continue;
      const svc = servicesBetween(city(a), city(b));
      const d = nextDeparture(bestFrom(svc, 9 * 60 + 30) ?? svc[0], 9 * 60 + 30);
      if (d && d.arriveAt >= 1440) late.push({ a, b, arr: d.arriveAt, label: d.service.label });
    }
  }
  console.log(`  아침에 나서 자정을 넘기는 구간 ${late.length}건`);
  for (const x of late) {
    const shown = fmtDayHm(x.arr);
    const ok = shown.includes('다음 날');
    if (!ok) bad++;
    console.log(`    ${city(x.a).name}→${city(x.b).name} ${x.label} · 화면 표시 "${shown}" ${ok ? '✓' : '✗ 자정을 넘긴다고 말하지 않는다'}`);
  }
  // 이 검사가 실제로 무언가를 지키는지 — 넘기는 구간이 하나도 없으면 검사가 아니다.
  if (!late.length) { console.log('  ✗ 자정을 넘기는 구간이 하나도 없어 이 검사는 아무것도 지키지 못한다'); bad++; }
  const same = fmtDayHm(23 * 60 + 59);
  const ok2 = !same.includes('다음 날');
  if (!ok2) bad++;
  console.log(`  같은 날 23:59 는 그냥 "${same}" ${ok2 ? '✓' : '✗'}`);
}

/* ── 탈 것에 맞춰 나서는가 ─────────────────────────────────────────── */
/*
 * 사용자가 보내 준 화면.
 *
 *   그라나다 → 바르셀로나
 *   09:00 숙소 출발 · 13:40 탑승 · 16:18 도착      7시간 18분
 *   국내선 항공 · 공항에서 대기 145분
 *
 * 09:00 에 나서서 13:40 비행기를 타라는 말이다. 수속 135분을 빼도 145분을
 * 공항에 앉아 있으라는 안내였다. 11:25 에 나서면 될 일이다.
 *
 * 앞의 '전 구간 훑기' 는 **어느 편을 고르는가** 만 봤다. 고른 편은 맞았다
 * (그 시각에 가장 일찍 닿는 것이 항공이다). 그런데 **몇 시에 나서라고 하는가**
 * 는 아무도 안 봤다. 그래서 이 검사를 따로 둔다.
 *
 * 지키는 것: 숙소를 나서고 탈 것에 오르기까지는 그 수단의 수속 시간을
 * 넘지 않는다. 넘는다면 그만큼 더 자도 되는데 깨운 것이다.
 */
console.log('\n=== 탈 것에 맞춰 나서는가 (공항·역에 일찍 데려다 놓지 않는가) ===');
{
  const { bestFrom } = await import('../src/lib/routing.ts');
  const READY = [7 * 60, 9 * 60, 9 * 60 + 30, 12 * 60, 15 * 60 + 30, 19 * 60];
  const slugs = index.cities.map((c) => c.slug);
  let n = 0;
  const off = [];
  for (const a of slugs) {
    for (const b of slugs) {
      if (a === b) continue;
      const svc = servicesBetween(city(a), city(b));
      for (const ready of READY) {
        const pick = bestFrom(svc, ready);
        if (!pick) continue;
        const d = nextDeparture(pick, ready);
        if (!d) continue;
        n++;
        const early = (d.departAt - d.leaveAt) - pick.accessMin;
        if (early > 0) {
          off.push(`${city(a).name}→${city(b).name} ${fmtHm(ready)} 나설 수 있음 · ${pick.label}`
            + ` — ${fmtHm(d.leaveAt)} 나서 ${fmtHm(d.departAt)} 탑승, 수속 ${pick.accessMin}분을 빼도 ${early}분을 그냥 기다린다`);
        }
      }
    }
  }
  off.sort((x, y) => (Number(y.match(/(\d+)분을 그냥/)?.[1] ?? 0)) - (Number(x.match(/(\d+)분을 그냥/)?.[1] ?? 0)));
  console.log(`  ${n}가지 확인 · 일찍 데려다 놓는 것 ${off.length}건`);
  for (const o of off.slice(0, 6)) console.log(`    ✗ ${o}`);
  if (off.length) bad += off.length;
  else console.log('  ✓ 어느 구간도 탈 것보다 일찍 나서게 하지 않는다');
}

console.log(bad ? `\n✗ ${bad}건 어긋남` : '\n✓ 교통 엔진 정상');
process.exit(bad ? 1 : 0);
