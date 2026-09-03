/**
 * 달력 날짜(YYYY-MM-DD) 계산.
 *
 * 예전에는 곳곳에서 `new Date('2026-04-30T00:00:00')` 로 파싱하고
 * `.toISOString().slice(0,10)` 으로 되돌렸다. 앞은 "로컬 자정", 뒤는 "UTC 기준"
 * 이라 시간대가 UTC 보다 앞선 곳(한국 +9)에서는 하루가 뒤로 밀렸다.
 * 4월 30일을 넣으면 4월 29일이 나오던 버그가 이것이다.
 *
 * 그래서 달력 계산은 전부 여기로 모은다. 안에서는 UTC 자정만 쓰고
 * (UTC 에는 서머타임이 없어 하루가 항상 24시간이다) 밖으로는 문자열만 오간다.
 * 브라우저 시간대가 무엇이든 결과가 같다.
 */

const DAY_MS = 86400000;

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → 그 날 UTC 자정의 epoch. 형식이 아니면 NaN. */
export function dayMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** epoch(UTC 자정) → 'YYYY-MM-DD'. */
export function msDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** n 일 뒤(음수면 앞). */
export function addDays(iso: string, n: number): string {
  const base = dayMs(iso);
  return Number.isNaN(base) ? iso : msDay(base + n * DAY_MS);
}

/** a 에서 b 까지 며칠. 같은 날이면 0, b 가 앞이면 음수. */
export function dayDiff(a: string, b: string): number {
  const x = dayMs(a);
  const y = dayMs(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  return Math.round((y - x) / DAY_MS);
}

/** 요일. 0 = 일요일. */
export function weekdayOf(iso: string): number {
  const ms = dayMs(iso);
  return Number.isNaN(ms) ? 0 : new Date(ms).getUTCDay();
}

/** 오늘. 브라우저가 보고 있는 달력 그대로. */
export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
