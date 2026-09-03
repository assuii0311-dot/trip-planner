/**
 * 공항 시간이 계획에 실제로 반영되는지 검사한다.
 *
 * 달력 날짜만 세면 11일 여행에 11일치를 담는다. 그런데 첫날 오후 4시에
 * 내리면 그날은 저녁 한 끼가 전부이고, 마지막 날 낮 12시 비행기면 아침에
 * 짐을 끌고 공항으로 간다.
 */
import { readFile } from 'node:fs/promises';
const idx = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const { AIRPORTS, airportOf } = await import('../src/lib/airports.ts');
const { arrivalLeg, departureLeg, transferMin, tripWindow, parseHm, fmtHm } =
  await import('../src/lib/airporttime.ts');

let fail = 0;
const ok = (c, label, detail = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!c) fail++;
};
const C = (s) => idx.cities.find((c) => c.slug === s);

console.log('=== 공항 ↔ 시내 이동이 실제와 맞는가 ===');
/* 공식 교통편 기준 알려진 값. ±12분이면 맞다고 본다 — 수단마다 다르다. */
for (const [iata, real] of [['MAD', 40], ['BCN', 35], ['GRX', 45], ['BIO', 25], ['SCQ', 30], ['PMI', 25]]) {
  const a = airportOf(iata);
  const got = transferMin(a, C(a.city));
  ok(Math.abs(got - real) <= 12, `${iata} 공항~시내`, `계산 ${got}분 · 실제 ${real}분`);
}

console.log('\n=== 입국·출국 절차 ===');
{
  const mad = airportOf('MAD');
  const inLeg = arrivalLeg(mad, C('madrid'));
  const outLeg = departureLeg(mad, C('madrid'));
  ok(inLeg.total > 100, '직항 공항은 입국심사를 넉넉히 잡는다', `${inLeg.total}분 — ${inLeg.note}`);
  ok(outLeg.process === 180, '장거리 국제선은 3시간 전 도착', `${outLeg.total}분 — ${outLeg.note}`);
  const grx = airportOf('GRX');
  const inG = arrivalLeg(grx, C('granada'));
  const outG = departureLeg(grx, C('granada'));
  ok(inG.process < inLeg.process, '경유 입국은 심사가 끝나 있다', `${inG.process}분 vs ${inLeg.process}분`);
  ok(outG.process === 120, '셍겐 안 단거리는 2시간', `${outG.total}분`);
}

console.log('\n=== 쓸 수 있는 날 계산 ===');
{
  const mad = airportOf('MAD');
  const inLeg = arrivalLeg(mad, C('madrid'));
  const outLeg = departureLeg(mad, C('madrid'));
  const cases = [
    ['16:00 착륙 · 12:00 이륙', '16:00', '12:00'],
    ['09:00 착륙 · 21:00 이륙', '09:00', '21:00'],
    ['06:00 착륙 · 08:00 이륙', '06:00', '08:00'],
  ];
  for (const [label, a, d] of cases) {
    const w = tripWindow(11, parseHm(a), parseHm(d), inLeg, outLeg, 9.5 * 60, 22 * 60);
    console.log(`  ${label.padEnd(26)} 첫날 ${w.firstDayStart !== null ? fmtHm(w.firstDayStart) : '-'}부터 · `
      + `마지막 ${w.lastDayEnd !== null ? fmtHm(w.lastDayEnd) : '-'}까지 · 쓸 수 있는 날 ${w.usableDays}/11 (손실 ${w.lostDays})`);
  }
  const late = tripWindow(11, parseHm('16:00'), parseHm('12:00'), inLeg, outLeg, 9.5 * 60, 22 * 60);
  const good = tripWindow(11, parseHm('09:00'), parseHm('21:00'), inLeg, outLeg, 9.5 * 60, 22 * 60);
  ok(late.usableDays < good.usableDays, '늦게 내리고 일찍 뜨면 쓸 수 있는 날이 준다',
    `${late.usableDays}일 vs ${good.usableDays}일`);
  ok(late.usableDays < 11 && late.usableDays > 8, '손실이 상식적인 크기다', `${late.usableDays}/11일`);
  const worst = tripWindow(11, parseHm('06:00'), parseHm('08:00'), inLeg, outLeg, 9.5 * 60, 22 * 60);
  ok(worst.lastDayEnd < 9.5 * 60, '새벽 비행기면 마지막 날은 못 쓴다', fmtHm(worst.lastDayEnd));
  ok(tripWindow(11, null, null, inLeg, outLeg, 9.5 * 60, 22 * 60).usableDays === 11,
    '시각을 안 넣으면 예전처럼 달력 일수', '11일');
}

console.log('\n=== 날짜의 뜻이 헷갈리지 않는가 ===');
{
  /*
   * '출발일/도착일' 과 '도착 시각/출발 시각' 이 같은 화면에서 정반대 날을
   * 가리켰다. 출발일은 스페인 첫날인데 출발 시각은 스페인 마지막 날이었다.
   * 라벨은 화면 검사(verify.mjs)에서 보고, 여기서는 계산이 스페인 기준으로
   * 일관되는지만 본다.
   */
  const mad = airportOf('MAD');
  const w = tripWindow(11, parseHm('16:00'), parseHm('12:00'),
    arrivalLeg(mad, C('madrid')), departureLeg(mad, C('madrid'), 0), 9.5 * 60, 22 * 60);
  ok(w.firstDayStart > parseHm('16:00'), '첫날은 착륙 시각 뒤에 시작한다', fmtHm(w.firstDayStart));
  ok(w.lastDayEnd < parseHm('12:00'), '마지막 날은 이륙 시각 앞에 끝난다', fmtHm(w.lastDayEnd));
}

console.log('\n=== 마지막 날 있는 도시가 공항 도시와 다를 때 ===');
{
  const mad = airportOf('MAD');
  const here = departureLeg(mad, C('madrid'), 0);
  // 세비야에서 마지막 밤을 보내고 마드리드에서 뜨는 경우 — 실제로 흔하다.
  const away = departureLeg(mad, C('madrid'), 197);
  ok(away.total > here.total + 150, '도시 간 이동이 출국 준비에 더해진다',
    `${here.total}분 → ${away.total}분`);
  ok(/도시 간 이동 \d+분/.test(away.note), '그 이동을 내역에 밝힌다', away.note);
  const w = tripWindow(8, parseHm('16:00'), parseHm('12:00'), arrivalLeg(mad, C('madrid')), away, 9.5 * 60, 22 * 60);
  ok(w.lastDayEnd < 9.5 * 60, '멀리서 뜨는 날은 아침부터 나서야 한다', fmtHm(w.lastDayEnd));
}

console.log('\n=== 모든 공항에서 값이 상식적인가 ===');
{
  let bad = [];
  for (const a of AIRPORTS) {
    const c = C(a.city);
    const t = transferMin(a, c);
    // 공항이 다른 도시를 서비스한다고 note 에 적힌 경우는 멀어도 정상이다.
    if (t > 90 && !a.note) bad.push(`${a.iata} ${t}분`);
    if (t < 10) bad.push(`${a.iata} ${t}분(너무 짧음)`);
  }
  ok(bad.length === 0, '설명 없는 공항이 비상식적으로 멀지 않다', bad.join(', ') || `${AIRPORTS.length}곳 확인`);
}

console.log(fail === 0 ? '\n✓ 공항 시간 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
