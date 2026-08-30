import type { Item, PlanDay, PlanEntry, Preferences, Slot } from '../types';
import { scoreItem } from './scoring';
import { distanceKm, hasCoords } from './geo';

/**
 * 계획에 들어간 일정의 대안.
 *
 * 계획을 보여 주고 "이대로 하세요" 로 끝내면, 마음에 안 드는 한 곳 때문에
 * 뒤로 돌아가 처음부터 다시 고르게 된다. 그 자리에 들어갈 수 있는 다른
 * 후보를 옆에 놓으면 그 자리에서 바꾼다.
 *
 * 대안은 한 곳일 수도 있고 두세 곳 묶음일 수도 있다. 두 시간짜리 미술관
 * 하나를 뺀 자리에는 40분짜리 세 곳이 들어갈 수도 있기 때문이다.
 */
export interface Alternative {
  items: Item[];
  /** 왜 이것이 대안인지. 화면에 그대로 보여 준다. */
  reason: string;
  /** 원래 일정과의 소요 시간 차이(분). 음수면 더 짧다. */
  deltaMin: number;
}

const MAX = 3;
/** 이 거리를 넘으면 같은 시간대에 끼워 넣을 수 없다. 도시 안 기준. */
const NEAR_KM = 2.5;
/** 원래 일정보다 이만큼 넘게 길어지면 하루가 밀린다. */
const OVER_MIN = 45;

function near(a: Item, b: Item): number | null {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  return distanceKm(a, b);
}

/** 같은 시간대에 들어갈 수 있는가. */
function fits(item: Item, slot: Slot): boolean {
  return item.bestSlots.includes(slot);
}

/**
 * 한 일정 자리의 대안 최대 3개.
 *
 * pool 은 계획에 들어가지 않은, 같은 도시의 아이템이다.
 * anchor 는 앞뒤 일정 — 대안이 거기서 너무 멀면 그날 동선이 무너진다.
 */
export function alternativesFor(
  entry: PlanEntry, day: PlanDay, pool: Item[], prefs: Preferences,
): Alternative[] {
  const target = entry.item;
  const anchors = day.entries.filter((e) => e !== entry).map((e) => e.item);

  const usable = pool
    .filter((i) => i.city === target.city && i.id !== target.id)
    .filter((i) => fits(i, entry.slot))
    .filter((i) => {
      // 앞뒤 일정에서 너무 먼 곳은 그날 동선을 무너뜨린다.
      const d = anchors.map((a) => near(i, a)).filter((v): v is number => v !== null);
      return d.length === 0 || Math.min(...d) <= NEAR_KM;
    })
    .sort((a, b) => scoreItem(b, prefs, {}) - scoreItem(a, prefs, {}));

  const out: Alternative[] = [];
  const used = new Set<string>();

  // 1) 한 곳으로 갈아 끼우기 — 소요 시간이 비슷한 것부터.
  for (const i of usable) {
    if (out.length >= MAX - 1) break;
    const delta = i.durationMin - target.durationMin;
    if (delta > OVER_MIN) continue;
    out.push({
      items: [i],
      reason: reasonFor(i, target),
      deltaMin: delta,
    });
    used.add(i.id);
  }

  // 2) 짧은 곳 두세 개 묶음 — 긴 일정 하나를 쪼갤 때만 의미가 있다.
  if (target.durationMin >= 75) {
    const shorts = usable.filter((i) => !used.has(i.id) && i.durationMin <= target.durationMin / 2);
    for (let n = 3; n >= 2 && out.length < MAX; n--) {
      const bundle = shorts.slice(0, n);
      if (bundle.length < n) continue;
      const sum = bundle.reduce((a, i) => a + i.durationMin, 0);
      if (sum - target.durationMin > OVER_MIN) continue;
      out.push({
        items: bundle,
        reason: `${target.name} 한 곳 대신 가까운 ${n}곳을 이어서 봅니다.`,
        deltaMin: sum - target.durationMin,
      });
      break;
    }
  }

  // 묶음을 못 만들었으면 단일 대안으로 한 자리를 더 채운다.
  for (const i of usable) {
    if (out.length >= MAX) break;
    if (used.has(i.id)) continue;
    if (i.durationMin - target.durationMin > OVER_MIN) continue;
    out.push({ items: [i], reason: reasonFor(i, target), deltaMin: i.durationMin - target.durationMin });
    used.add(i.id);
  }

  return out.slice(0, MAX);
}

/** 근거는 실제 데이터에서만 만든다. 없으면 담백하게 둔다. */
function reasonFor(alt: Item, target: Item): string {
  if (alt.popularity > target.popularity) return '더 널리 알려진 곳입니다.';
  if (alt.popularity < target.popularity) return '덜 알려진 곳입니다.';
  if (alt.priceEur === 0 && (target.priceEur ?? 0) > 0) return '무료입니다.';
  if (alt.durationMin < target.durationMin) return '더 짧게 봅니다.';
  if (alt.theme !== target.theme) return '다른 성격의 장소입니다.';
  return '같은 시간대에 들어갑니다.';
}

/**
 * 하루치 대안을 한 번에 만든다.
 *
 * 일정마다 따로 뽑으면 점수가 높은 몇 곳이 그날 모든 자리에 똑같이 나온다.
 * 세 자리에 같은 세 곳이 걸려 있으면 고를 것이 없는 것과 같고, 하나를
 * 바꿔 넣는 순간 나머지 자리의 그 대안은 이미 계획에 들어간 곳이 된다.
 * 그래서 앞 자리에서 쓴 것은 뒤 자리에서 빼고 뽑는다.
 */
export function alternativesForDay(
  day: PlanDay, pool: Item[], prefs: Preferences,
): Map<string, Alternative[]> {
  const out = new Map<string, Alternative[]>();
  const spent = new Set<string>();
  for (const entry of day.entries) {
    const avail = pool.filter((i) => !spent.has(i.id));
    const alts = alternativesFor(entry, day, avail, prefs);
    for (const a of alts) for (const i of a.items) spent.add(i.id);
    out.set(entry.item.id, alts);
  }
  return out;
}
