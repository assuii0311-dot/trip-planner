import type { City, CourseId, Item, Preferences, ThemeId } from '../types';
import { THEMES, THEME_LABEL } from './themes';
import { scoreItem } from './scoring';
import { estimateDays, fitToDays, itemsPerDay } from './capacity';

/**
 * 도시별 추천 코스.
 *
 * 스페인을 모르는 사람에게 2천 개 목록에서 고르라고 하면 고를 수가 없다.
 * "이 도시에서는 보통 이렇게 돕니다" 를 세 가지로 먼저 보여 주고, 거기서
 * 빼거나 더하게 하는 것이 순서다.
 *
 * 세 가지 기준은 2단계에서 받은 테마 관심도에서 나온다.
 *   균형   — 관심 있다고 한 테마를 고루 섞는다
 *   강조 A — 가장 관심 높은 테마를 두 배로 담는다
 *   강조 B — 그다음 테마를 두 배로 담는다
 *
 * 관심 테마가 하나뿐이면 강조 B 는 만들지 않는다. 억지로 세 개를 채우면
 * 서로 구별되지 않는 코스가 나와 고르는 의미가 없어진다.
 */
export interface Course {
  id: CourseId;
  title: string;
  /** 왜 이렇게 묶였는지. 화면에 그대로 보여 준다. */
  basis: string;
  items: Item[];
  /** 예상 소요 일수. */
  days: number;
  /** 테마별 개수 — 코스끼리 어떻게 다른지 한눈에 보이게. */
  mix: { theme: ThemeId; label: string; count: number }[];
}

/**
 * 코스 후보를 몇 개나 뽑아 놓을지.
 *
 * 여기서 나온 개수는 상한일 뿐이고, 실제 분량은 fitToDays 가 시간으로
 * 다시 자른다. 평균보다 긴 아이템이 뽑혀도 목표 일수를 넘지 않도록
 * 넉넉히 뽑아 두고 잘라내는 순서다.
 */
function targetCount(items: Item[], prefs: Preferences, nights: number): number {
  const perDay = itemsPerDay(items, prefs);
  const days = Math.max(1, nights);
  return Math.min(items.length, Math.max(perDay, Math.round(perDay * days)) + 2);
}

/**
 * 일수를 정해 주면 그 일수에 맞는 아이템을 골라 준다.
 *
 * 반대 방향이다. 지금까지는 아이템을 담으면 일수가 나왔는데, 실제로는
 * "이 도시는 이틀만 볼 거야" 가 먼저 정해지는 경우가 많다. 그때 이틀치를
 * 직접 세어 가며 담는 것은 사람이 할 일이 아니다.
 *
 * 고른 코스의 성격(균형/강조)은 유지한 채 분량만 바꾼다.
 */
export function itemsForDays(
  city: City, cityItems: Item[], prefs: Preferences, days: number, keep: CourseId | undefined,
): Item[] {
  const list = coursesFor(city, cityItems, prefs, days);
  const course = list.find((c) => c.id === keep) ?? list[0];
  return course ? course.items : [];
}

/**
 * 테마별 몫을 정해 두고 점수순으로 채운다.
 *
 * 그냥 점수순으로 자르면 관심도가 가장 높은 테마가 목록을 독식해서,
 * 세 코스가 거의 같아진다. 몫을 먼저 나눠야 코스가 서로 달라진다.
 */
function pick(
  items: Item[], prefs: Preferences, count: number, boost: ThemeId | null,
): Item[] {
  const byTheme = new Map<ThemeId, Item[]>();
  for (const it of [...items].sort((a, b) => scoreItem(b, prefs, {}) - scoreItem(a, prefs, {}))) {
    const list = byTheme.get(it.theme) ?? [];
    list.push(it);
    byTheme.set(it.theme, list);
  }

  // 관심도 0인 테마는 몫을 주지 않는다. 관심 없다고 답한 것을 넣을 이유가 없다.
  const weights = new Map<ThemeId, number>();
  for (const t of THEMES) {
    const interest = prefs.themes[t.id] ?? 0;
    if (interest <= 0 || !byTheme.get(t.id)?.length) continue;
    weights.set(t.id, interest * (t.id === boost ? 2.2 : 1));
  }
  // 관심 테마가 하나도 없으면(전부 0) 있는 것에서 고르게 나눈다.
  if (weights.size === 0) {
    for (const [t, list] of byTheme) if (list.length) weights.set(t, 1);
  }

  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  const quota = new Map<ThemeId, number>();
  for (const [t, w] of weights) quota.set(t, Math.max(1, Math.round((w / totalWeight) * count)));

  // 몫만큼 뽑고, 몫이 남거나 모자라면 점수순으로 메운다.
  const taken = new Set<string>();
  const out: Item[] = [];
  for (const [t, n] of quota) {
    for (const it of (byTheme.get(t) ?? []).slice(0, n)) {
      if (out.length >= count) break;
      out.push(it); taken.add(it.id);
    }
  }
  if (out.length < count) {
    for (const it of items) {
      if (out.length >= count) break;
      if (!taken.has(it.id)) { out.push(it); taken.add(it.id); }
    }
  }
  return out.slice(0, count).sort((a, b) => scoreItem(b, prefs, {}) - scoreItem(a, prefs, {}));
}

function mixOf(items: Item[]): Course['mix'] {
  const n = new Map<ThemeId, number>();
  for (const i of items) n.set(i.theme, (n.get(i.theme) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({ theme, label: THEME_LABEL[theme], count }));
}

/**
 * 한 도시의 추천 코스 세 가지.
 * nights 는 이 도시에 배정된 밤 수 — 코스 분량을 여기에 맞춘다.
 */
export function coursesFor(
  city: City, cityItems: Item[], prefs: Preferences, nights: number,
): Course[] {
  if (cityItems.length < 3) return [];
  const days = Math.max(1, nights);
  const count = targetCount(cityItems, prefs, nights);

  // 관심도가 높은 순으로 강조 후보를 고른다. 이 도시에 실제로 아이템이
  // 있는 테마만 후보다 — 없는 테마를 강조하면 균형 코스와 똑같아진다.
  const present = new Set(cityItems.map((i) => i.theme));
  // 관심도 높은 순으로 전부 후보에 넣는다. 위에서 두 개만 잘라 두면,
  // 그 둘이 강조에 실패했을 때 코스가 하나만 남는다. 아래에서 '이름이
  // 참인 것' 만 통과시키므로 후보가 많아도 엉뚱한 코스는 나오지 않는다.
  const focuses = THEMES
    .filter((t) => present.has(t.id) && (prefs.themes[t.id] ?? 0) > 0)
    .filter((t) => cityItems.filter((i) => i.theme === t.id).length >= 2)
    .sort((a, b) => (prefs.themes[b.id] ?? 0) - (prefs.themes[a.id] ?? 0));

  const build = (id: CourseId, title: string, basis: string, boost: ThemeId | null): Course => {
    // 개수로 뽑고 시간으로 자른다. 카드에 적히는 일수가 실제 분량과 같아야
    // '2일짜리 코스'를 골랐을 때 2박이 잡힌다.
    const items = fitToDays(pick(cityItems, prefs, count, boost), prefs, days);
    return { id, title, basis, items, days: estimateDays(items, prefs), mix: mixOf(items) };
  };

  const balanced = build('balanced', '고루 보기',
    `${city.name}에서 관심 있다고 하신 테마를 고르게 섞었습니다.`, null);
  const out: Course[] = [balanced];

  const countIn = (c: Course, t: ThemeId) => c.mix.find((m) => m.theme === t)?.count ?? 0;

  /**
   * 강조 코스는 '실제로 강조가 된 경우에만' 내놓는다.
   *
   * 그 도시에 그 테마 아이템이 몇 개 없으면 두 배로 담으라고 해도 담기지
   * 않는다. 그런데도 이름만 '역사·유적 중심' 으로 붙으면, 미식이 더 많은
   * 코스에 역사 이름이 달린다. 이름이 거짓이 되느니 코스를 하나 덜 내놓는
   * 편이 낫다 - 고르는 사람은 이름을 보고 고르기 때문이다.
   */
  const ids: CourseId[] = ['focusA', 'focusB'];
  for (const t of focuses) {
    if (out.length > 2) break;
    const c = build(ids[out.length - 1], `${THEME_LABEL[t.id]} 중심`,
      `${THEME_LABEL[t.id]}을(를) 늘리고 나머지를 줄였습니다.`, t.id);
    const mine = countIn(c, t.id);
    const topsOwnMix = c.mix[0]?.theme === t.id;
    const beatsBalanced = mine > countIn(balanced, t.id);
    if (topsOwnMix && beatsBalanced) out.push(c);
  }
  return out;
}

/** 계획을 세우려면 최소한 이 정도는 담아야 한다 (하루 2곳 기준). */
export const minimumPicks = (days: number) => Math.max(4, days * 2);
