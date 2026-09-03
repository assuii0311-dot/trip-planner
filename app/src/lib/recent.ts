/**
 * 나라마다 짜다 만 계획이 있는가.
 *
 * 나라 고르는 화면에서 '이어서 하기' 를 보여 주려고 본다. 계획을 통째로
 * 읽지 않고 필요한 것만 꺼낸다 — 나라 고르는 자리에서 남의 나라 계획을
 * 통째로 파싱할 이유가 없다.
 *
 * 저장 형식이 바뀌거나 저장이 막혀 있어도 여기서 터지면 안 된다.
 * 이어서 하기가 안 보이는 것은 불편이고, 화면이 안 뜨는 것은 고장이다.
 */
const keyOf = (country: string) => `trip-planner.v1.${country}`;

/** 언제 어디까지 했는지 한 줄. 저장분이 없으면 null. */
export function lastVisited(country: string): string | null {
  try {
    const raw = localStorage.getItem(keyOf(country));
    if (!raw) return null;
    const s = JSON.parse(raw) as {
      step?: number; savedAt?: number;
      basics?: { cities?: string[]; startDate?: string };
    };
    const cities = s.basics?.cities?.length ?? 0;
    if (!cities && !s.step) return null;
    const when = s.savedAt ? ago(s.savedAt) : null;
    const what = cities ? `${cities}곳 고름` : '시작만 함';
    return when ? `${what} · ${when}` : what;
  } catch {
    return null;
  }
}

function ago(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
