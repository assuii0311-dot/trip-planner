import type { City, Preferences, ThemeId } from '../types';
import { THEMES } from './themes';
import { josa } from './korean';

/**
 * 고른 도시에서 테마 관심도를 역산한다.
 *
 * 재료는 도시별 성격 프로필(사람이 판단해 적은 값)이지 수집된 아이템 개수가
 * 아니다. 바르셀로나에 미식 아이템이 14개인 것은 "테마당 최소 개수" 규칙
 * 때문이지 바르셀로나가 미식 도시라서가 아니다.
 *
 * 여러 도시를 골랐다면 그 성격이 겹쳐서 나온다. 하나의 유형으로 뭉개지 않고
 * 8차원을 그대로 유지하는 이유다 — 취향은 대개 복합적이다.
 */
export function inferThemes(selected: City[]): Record<ThemeId, number> {
  const empty = Object.fromEntries(THEMES.map((t) => [t.id, 0])) as Record<ThemeId, number>;
  const withProfile = selected.filter((c) => c.profile);
  if (withProfile.length === 0) return { ...empty, history: 2, art: 2, landmark: 2, nature: 2, food: 2 };

  const sum = { ...empty };
  for (const city of withProfile) {
    for (const t of THEMES) sum[t.id] += city.profile![t.id] ?? 0;
  }

  // 평균을 낸 뒤 0~3 으로 다시 편다. 평균만 쓰면 값이 가운데로 몰려
  // "무엇을 좋아하는지"가 흐려지기 때문이다.
  const avg = Object.fromEntries(
    THEMES.map((t) => [t.id, sum[t.id] / withProfile.length]),
  ) as Record<ThemeId, number>;

  const values = Object.values(avg);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;

  // 0은 "이 도시엔 그런 게 없다"는 뜻이라 코스에서 통째로 빠진다. 그래서
  // 0은 도시 프로필이 실제로 0일 때만 쓰고, 그 밖에는 1~3으로 편다.
  // 최저 테마를 기계적으로 0으로 만들면 바르셀로나(history:2)에서 고딕 지구가
  // 사라지는 식의 왜곡이 생긴다.
  const out = { ...empty };
  for (const t of THEMES) {
    if (avg[t.id] < 0.25) { out[t.id] = 0; continue; }
    // 편차가 거의 없으면(모두 비슷한 도시) 원래 값을 반올림해 쓴다.
    const v = span < 0.6
      ? Math.round(avg[t.id])
      : 1 + Math.round(((avg[t.id] - lo) / span) * 2);
    out[t.id] = Math.min(3, Math.max(1, v));
  }
  return out;
}

/** 역산 결과를 한 문장으로 설명한다. 사용자가 맞는지 판단할 근거가 된다. */
export function describeTaste(themes: Record<ThemeId, number>, selected: City[]): string {
  const top = THEMES
    .map((t) => ({ t, v: themes[t.id] }))
    .sort((a, b) => b.v - a.v)
    .filter((x) => x.v >= 2)
    .slice(0, 3);
  if (top.length === 0) return '고르신 도시들이 고르게 다양합니다.';

  const names = top.map((x) => x.t.label).join(' · ');
  const picked = selected.slice(0, 3).map((c) => c.name);
  const why = picked.join('·');
  const tail = selected.length > 3 ? ' 등을' : josa(picked[picked.length - 1] ?? '', '을를');
  return `${why}${tail} 고르셨으니 ${names} 중심의 여행으로 보입니다.`;
}

/**
 * 도시 선택에서 읽어낼 수 있는 나머지 힌트.
 * 확정값이 아니라 2단계 질문의 기본값으로만 쓴다.
 */
export function inferHints(selected: City[]): Partial<Preferences> {
  const tags = new Set(selected.flatMap((c) => c.tags));
  const hints: Partial<Preferences> = {};

  if (tags.has('나이트라이프')) hints.nightlife = 2;
  if (tags.has('리조트') || tags.has('휴양')) hints.pace = 2;
  if (tags.has('도보많음') || tags.has('트레킹') || tags.has('등산')) hints.walkTolerance = 4;
  if (tags.has('미식') || tags.has('미슐랭')) hints.foodStyles = ['local', 'tapas'];

  // 소도시만 골랐다면 붐비는 곳을 피하려는 성향으로 본다.
  const allSmall = selected.every((c) => !c.isHub);
  if (allSmall && selected.length > 0) hints.discovery = 2;

  return hints;
}
