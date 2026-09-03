/**
 * 날짜 — 시간대를 바꿔도 달력이 흔들리지 않는가.
 *
 * 이 검사가 없어서 놓친 버그가 있었다. 컨테이너가 UTC 라 모든 검사가
 * 통과했지만, 한국(+9)에서 4월 30일 출발을 넣으면 4단계 일정이
 * 4월 29일부터 시작했다. 로컬 자정으로 파싱하고 UTC 로 되돌린 탓이다.
 *
 * 그래서 여기서는 시간대를 갈아 끼우며 같은 계산을 돌린다.
 *   npx tsx scripts/date-check.mjs
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** UTC 보다 앞선 곳, 뒤진 곳, 서머타임 있는 곳, 30분 단위인 곳. */
const ZONES = [
  'UTC', 'Asia/Seoul', 'Asia/Tokyo', 'Pacific/Kiritimati',
  'America/Los_Angeles', 'America/New_York', 'Europe/Madrid',
  'Asia/Kathmandu', 'Australia/Lord_Howe', 'Pacific/Chatham',
];

const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

const self = fileURLToPath(import.meta.url);

/**
 * 자식 프로세스를 그 시간대로 띄워 한 판 돌리고 결과를 JSON 으로 받는다.
 * TZ 는 프로세스가 뜰 때 한 번만 읽히기 때문에 같은 프로세스 안에서는 못 바꾼다.
 * tsx 로 들어왔으므로 그 로더 인자를 그대로 물려준다(.ts / .tsx 를 읽어야 한다).
 */
const loader = process.execArgv.filter((a, i, all) =>
  a === '--require' || a === '--import' || all[i - 1] === '--require' || all[i - 1] === '--import');

function runIn(tz) {
  const out = execFileSync(process.execPath, [...loader, self, '--child'], {
    env: { ...process.env, TZ: tz }, encoding: 'utf8',
  });
  return JSON.parse(out.slice(out.indexOf('{')));
}

/** 시간대와 무관해야 하는 계산들. 자식에서 돈다. */
async function sample() {
  const { addDays, dayDiff, weekdayOf, todayISO } = await import('../src/lib/caldate.ts');
  const { moveStart, moveEnd, tripDays } = await import('../src/steps/Step1Basics.tsx');
  const { defaultState } = await import('../src/lib/store.ts');

  const base = { startDate: '2026-04-30', endDate: '2026-05-06' };
  const d = defaultState();
  return {
    // 서머타임 경계를 넘는 구간도 함께 본다(스페인 3/29, 미국 3/8, 호주 4/5).
    add0: addDays('2026-04-30', 0),
    add1: addDays('2026-04-30', 1),
    addBack: addDays('2026-05-01', -1),
    addYear: addDays('2026-12-31', 1),
    addLeap: addDays('2028-02-28', 1),
    addDstEu: addDays('2026-03-28', 2),
    addDstUs: addDays('2026-03-07', 2),
    addDstAu: addDays('2026-04-04', 2),
    add60: addDays('2026-04-30', 60),
    diff: dayDiff('2026-04-30', '2026-05-06'),
    diffDst: dayDiff('2026-03-01', '2026-11-01'),
    weekday: weekdayOf('2026-04-30'),
    tripDays: tripDays(base),
    // 마지막 날보다 뒤로 밀면 기간을 유지한 채 따라와야 한다.
    pushStart: moveStart(base, '2026-05-10'),
    pullEnd: moveEnd(base, '2026-04-20'),
    keepStart: moveStart(base, '2026-05-02'),
    // 기본값은 오늘 기준이라 값 자체는 다르지만, 간격과 형식은 같아야 한다.
    defSpan: dayDiff(d.basics.startDate, d.basics.endDate),
    defShape: /^\d{4}-\d{2}-\d{2}$/.test(d.basics.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.basics.endDate),
    defFromToday: dayDiff(todayISO(), d.basics.startDate),
  };
}

if (process.argv.includes('--child')) {
  process.stdout.write(JSON.stringify(await sample()));
} else {
  console.log('■ 시간대를 바꿔도 같은 달력인가');
  const got = Object.fromEntries(ZONES.map((tz) => [tz, runIn(tz)]));
  const ref = got.UTC;

  check('UTC 에서 4월 30일은 4월 30일', ref.add0 === '2026-04-30', ref.add0);
  check('하루 뒤는 5월 1일', ref.add1 === '2026-05-01', ref.add1);
  check('하루 앞은 4월 30일', ref.addBack === '2026-04-30', ref.addBack);
  check('해를 넘긴다', ref.addYear === '2027-01-01', ref.addYear);
  check('윤일을 센다', ref.addLeap === '2028-02-29', ref.addLeap);
  check('4/30 ~ 5/6 은 7일 여행', ref.tripDays === 7, `${ref.tripDays}일`);
  check('4/30 은 목요일', ref.weekday === 4, String(ref.weekday));
  check('기본값은 30일 뒤 7일 여행',
    ref.defSpan === 6 && ref.defFromToday === 30 && ref.defShape,
    `+${ref.defFromToday}일 · ${ref.defSpan + 1}일`);

  for (const tz of ZONES) {
    if (tz === 'UTC') continue;
    const g = got[tz];
    const diff = Object.keys(ref).filter((k) => JSON.stringify(g[k]) !== JSON.stringify(ref[k]));
    check(`${tz} 도 UTC 와 같은 답`, diff.length === 0,
      diff.length ? diff.map((k) => `${k}: ${JSON.stringify(g[k])} ≠ ${JSON.stringify(ref[k])}`).join(', ') : `${Object.keys(ref).length}개 일치`);
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length}개 검사 · ${bad.length ? `${bad.length}개 실패` : '모두 통과'}`);
  process.exit(bad.length ? 1 : 0);
}
