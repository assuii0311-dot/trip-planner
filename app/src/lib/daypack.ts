import type { Itinerary, Stop } from './itinerary';
import { josa } from './korean';

/**
 * 날 채우기 — 하루를 칸이 아니라 시간 축으로 본다.
 *
 * ## 예전에 무엇이 잘못됐나
 *
 * 하루가 한 도시였다. `nights = max(1, round(볼거리일수) + 근교수)` 로 도시마다
 * 정수 날을 주고, 당일치기는 무조건 한 칸을 먹었다. 그래서
 *
 *   - 볼거리가 0.4일치인 네르하도 하루를 통째로 먹고
 *   - 반나절짜리 도시 둘이 한 날에 들어가지 못하고
 *   - 도시 간 이동은 예산 밖에 있어, 두 시간 이동한 날도 8.4시간짜리로 셌다
 *
 * 3단계(볼거리 시간 합)와 4단계(달력 칸)가 같은 여행을 8.7일 대 15칸으로
 * 부른 것이 이 때문이다.
 *
 * ## 지금
 *
 * 하루는 예산이다.
 *
 *     하루 볼거리 예산 = dailyMinutes(prefs) − 그날의 도시 간 이동 시간
 *
 * 예산이 찰 때까지 넣고, 남으면 그날 다음 도시로 옮겨 이어 붙인다. 그래서
 * 한 날에 도시가 둘 이상 들어갈 수 있다. 옮겨 가서 {@link MIN_STAY_MIN} 도
 * 못 쓸 것 같으면 오늘은 옮기지 않는다 — 가서 한 곳도 못 보는 이동은
 * 이동이 아니다.
 *
 * 이 계산 하나를 3단계와 4단계가 함께 쓴다. 그래야 두 화면이 어긋날 수 없다.
 */

/** 이동 시점. 하루의 어디에서 도시를 옮기는가. */
export type MoveTiming = 'morning' | 'midday' | 'evening';

export const MOVE_TIMINGS: MoveTiming[] = ['morning', 'midday', 'evening'];

export const MOVE_LABEL: Record<MoveTiming, string> = {
  morning: '아침',
  midday: '오후',
  evening: '저녁',
};

/**
 * 이동 시점 문턱값. 사용자와 합의해 정했다.
 *
 * 가장 강한 제약은 **저녁식사는 그날 자는 도시에서** 다. 어떤 시점을 고르든
 * 저녁식사 자리(20:30) 전에 목적지에 닿아야 하고, 그것이 아래 값을 정한다.
 *
 *   저녁 90분  — 18:30 마지막 일정 → 19:00 출발 → 20:30 도착 → 21:00 저녁.
 *                90분을 넘으면 저녁이 밀린다.
 *   오후 180분 — 13:00 점심 → 15:30 출발 → 18:30 도착 → 한 곳 보고 20:30 저녁.
 *                그 이상이면 도착해서 밥만 먹는다.
 */
export const MOVE_RULE = {
  eveningMaxMin: 90,
  middayMaxMin: 180,
  /** 저녁 이동은 오늘 앞 도시에서 이만큼(반나절)은 쓴 뒤라야 뜻이 있다. */
  eveningMinSpent: 250,
  /** 오후 이동은 오전을 채운 뒤라야 뜻이 있다. */
  middayMinSpent: 150,
};

/** 옮겨 가서 이만큼도 못 쓰면 오늘은 옮기지 않는다. 대표 명소 하나가 보통 60~90분이다. */
export const MIN_STAY_MIN = 90;

/** 이보다 짧은 구간은 만들지 않는다. 6분짜리 구간은 계획이 아니라 찌꺼기다. */
export const MIN_SEG_MIN = 60;

/** 이미 시작한 일정이 마감을 넘겨도 이만큼은 봐 준다. 공항 마감에는 쓰지 않는다. */
export const GRACE_MIN = 60;

/**
 * 이 구간을 언제 옮길 것인가.
 *
 * @param moveMin   도시 간 이동 시간(door-to-door, 분)
 * @param spentMin  오늘 앞 도시에서 이미 쓴 볼거리 시간(분). 이것이 곧 시각이다 —
 *                  많이 썼다는 것은 늦은 시각이라는 뜻이다.
 */
export function pickTiming(moveMin: number, spentMin: number): MoveTiming {
  if (moveMin <= MOVE_RULE.eveningMaxMin && spentMin >= MOVE_RULE.eveningMinSpent) return 'evening';
  if (moveMin <= MOVE_RULE.middayMaxMin && spentMin >= MOVE_RULE.middayMinSpent) return 'midday';
  return 'morning';
}

/** 왜 이 시점인지 한 줄. 화면에 그대로 쓴다. */
export function whyTiming(t: MoveTiming, moveMin: number, toName: string): string {
  const h = Math.round(moveMin / 6) / 10;
  if (t === 'evening') return `${h}시간 거리라 저녁에 옮겨 ${toName}에서 저녁을 먹습니다`;
  if (t === 'midday') return `오전을 마저 보고 점심 뒤에 옮겨 ${toName}에서 저녁을 먹습니다`;
  return `${h}시간 거리라 아침에 옮겨 ${toName}${josa(toName, '을를')} 길게 씁니다`;
}

/** 이 시점을 고를 수 있는가. 못 고르는 이유가 있으면 문자열로 돌려준다. */
export function timingBlocked(t: MoveTiming, moveMin: number): string | null {
  if (t === 'evening' && moveMin > MOVE_RULE.eveningMaxMin) {
    return `${Math.round(moveMin / 6) / 10}시간 거리라 저녁에 옮기면 저녁식사가 늦습니다`;
  }
  if (t === 'midday' && moveMin > MOVE_RULE.middayMaxMin) {
    return `${Math.round(moveMin / 6) / 10}시간 거리라 오후에 옮기면 도착해서 저녁만 먹게 됩니다`;
  }
  return null;
}

/** 하루에 들어가는 한 도시 몫. */
export interface PackedLeg {
  city: string;
  /** 이 도시에서 쓰는 볼거리 시간(분). */
  minutes: number;
  /** 짐을 두지 않고 다녀오는가. */
  isDayTrip: boolean;
  /** 당일치기라면 어디서 다녀오는가. */
  base: string | null;
  /** 당일치기 왕복 시간(분). */
  roundTripMin: number;
}

/** 하루 안에서 도시를 옮기는 한 구간. */
export interface PackedMove {
  from: string; to: string; minutes: number; timing: MoveTiming;
}

export interface PackedDay {
  legs: PackedLeg[];
  /** 그날 밤을 보내는 도시. 저녁식사도 여기서 한다. */
  sleepAt: string;
  /**
   * 그날 도시를 옮긴 구간들.
   *
   * 예전에는 하나만 담았다. 그래서 아침에 팔마→지로나로 들어와 저녁에
   * 지로나→바르셀로나로 다시 옮기는 날에는, 뒤엣것이 앞엣것을 덮어써
   * **팔마→지로나 이동 안내가 화면에서 통째로 사라졌다**. 하루가 한 번만
   * 옮긴다는 법이 없다 — 새 날 모델을 만들면서 생긴 일이다.
   */
  moves: PackedMove[];
}

export interface PackResult {
  days: PackedDay[];
  /** 도시별로 배정된 볼거리 시간(분). */
  given: Map<string, number>;
  /** 도시 간 이동과 근교 왕복에 쓰인 시간(분) 합계. */
  moveMin: number;
  /**
   * 당일치기로는 다 못 보고 남은 시간(분).
   *
   * 자투리 때문에 왕복을 다시 하지 않으므로 남는 것이 생긴다. 조용히 버리지
   * 않고 화면에서 '이 도시는 당일치기로 이만큼까지' 라고 말할 수 있게 넘긴다.
   */
  unseen: Map<string, number>;
}

/**
 * 여정을 날로 채운다.
 *
 * @param needMinOf 도시별로 그 도시에서 보낼 볼거리 시간(분)
 * @param budgetMin 이동이 없는 날의 볼거리 예산(분)
 * @param timingOf  사용자가 정한 이동 시점. 없으면 자동으로 고른다
 */
export function packDays(
  itin: Itinerary,
  needMinOf: (slug: string) => number,
  budgetMin: number,
  timingOf: (from: string, to: string) => MoveTiming | undefined = () => undefined,
  /**
   * 첫날 실제로 쓸 수 있는 볼거리 시간(분). 비행기로 저녁에 내리면 하루가
   * 아니라 두 시간이다.
   *
   * 이걸 몰랐을 때 무슨 일이 났는가 — 18시 착륙이면 첫날은 20:05 부터라
   * 145분뿐인데, 여기서는 567분짜리 하루로 세고 마드리드 294분 + 톨레도
   * 133분을 배정했다. 그리고 실제 일정을 짜는 쪽(buildDay)은 시각을 알기
   * 때문에 들어가지 못한 것을 그냥 버렸다. 톨레도가 경로에는 있는데
   * 상세 일정에는 한 곳도 안 나오는 일이 이렇게 벌어졌다.
   */
  firstDayMin: number | null = null,
): PackResult {
  const days: PackedDay[] = [];
  const given = new Map<string, number>();
  const unseen = new Map<string, number>();
  let moveTotal = 0;

  const sleeping = itin.stops.filter((s) => s.sleep);
  if (!sleeping.length) return { days, given, moveMin: 0, unseen };

  const hopMin = new Map<string, number>();
  for (const h of itin.hops) hopMin.set(`${h.from.slug}>${h.to.slug}`, h.chosen.totalMin);
  const tripsOf = (slug: string): Stop[] => itin.stops.filter((x) => !x.sleep && x.base === slug);

  /** 지금 채우고 있는 날. */
  interface Open { legs: PackedLeg[]; sleepAt: string; left: number; moves: PackedMove[] }
  let cur: Open | null = null;
  const open = (sleepAt: string, left = budgetMin): Open => ({ legs: [], sleepAt, left, moves: [] });
  const close = () => {
    if (cur && (cur.legs.length || cur.moves.length)) days.push({ legs: cur.legs, sleepAt: cur.sleepAt, moves: cur.moves });
    cur = null;
  };
  const add = (day: Open, leg: PackedLeg) => {
    day.legs.push(leg);
    given.set(leg.city, (given.get(leg.city) ?? 0) + leg.minutes);
  };

  for (let i = 0; i < sleeping.length; i++) {
    const stop = sleeping[i];
    const prev = i > 0 ? sleeping[i - 1] : null;

    if (!prev) {
      cur = open(stop.city.slug, Math.max(0, Math.min(budgetMin, firstDayMin ?? budgetMin)));
    } else {
      const move = hopMin.get(`${prev.city.slug}>${stop.city.slug}`) ?? 0;
      /*
       * 오늘 앞 도시에서 이미 쓴 시간이 곧 시각이다. 많이 썼으면 늦은 시각이고,
       * 그때는 저녁에 옮기는 것이 자연스럽다. 아무것도 안 썼으면 아침이다.
       */
      const spent = cur ? budgetMin - cur.left : 0;
      let timing = timingOf(prev.city.slug, stop.city.slug) ?? pickTiming(move, spent);
      /*
       * 근교를 다녀온 날에는 짐을 옮기지 않는다.
       *
       * 짐을 숙소에 둔 채 근교에 갔다 왔는데 그 길로 다음 도시까지 간다는
       * 것은 — 실제로 그렇게 나왔다 — 짐을 두고 떠나라는 말이다.
       */
      if (timing !== 'morning' && cur?.legs.some((l) => l.isDayTrip)) timing = 'morning';
      moveTotal += move;
      const leg = { from: prev.city.slug, to: stop.city.slug, minutes: move, timing };

      if (timing === 'morning') {
        // 오늘은 여기서 끝. 내일 아침에 옮겨 새 도시를 길게 쓴다.
        close();
        cur = open(stop.city.slug, Math.max(0, budgetMin - move));
        cur.moves.push(leg);
      } else {
        // 오늘 안에 옮긴다. 이동이 남은 예산을 먹고, 오늘 밤은 새 도시에서 잔다.
        if (!cur) cur = open(prev.city.slug);
        cur.left = Math.max(0, cur.left - move);
        cur.sleepAt = stop.city.slug;
        cur.moves.push(leg);
      }
    }

    let need = Math.max(0, needMinOf(stop.city.slug));
    const queue = tripsOf(stop.city.slug).map((t) => ({
      stop: t,
      minutes: Math.max(0, needMinOf(t.city.slug)),
      round: Math.round(t.dayTripMin),
    /*
     * 왕복만으로 하루가 넘는 근교는 당일치기가 될 수 없다.
     *
     * 사용자가 4단계에서 '짐 안 옮기기' 로 바꾸면 마드리드↔세비야(왕복
     * 6시간 50분) 같은 조합도 만들어진다. 그걸 큐에 두면 어느 날에도 들어가지
     * 못해 **큐가 영원히 비지 않는다** — 실제로 화면이 멈췄다. 넣을 수 없는
     * 것은 넣을 수 없다고 하고 넘어간다.
     */
    })).filter((t) => {
      if (t.round + MIN_STAY_MIN <= budgetMin) return true;
      unseen.set(t.stop.city.slug, (unseen.get(t.stop.city.slug) ?? 0) + t.minutes);
      return false;
    });

    // 이 거점의 볼거리와 근교를 날에 채운다.
    for (;;) {
      const day: Open = cur ?? (cur = open(stop.city.slug));

      /*
       * 자투리 구간을 만들지 않는다.
       *
       * '마드리드 6분 + 톨레도 358분' 같은 날이 나왔다. 6분짜리 구간은
       * 계획이 아니라 계산의 찌꺼기다. 한 곳도 못 볼 시간이면 그 도시는
       * 오늘 넣지 않고 다음 날로 넘긴다.
       */
      if (need >= MIN_SEG_MIN && day.left >= MIN_SEG_MIN) {
        const use = Math.min(need, day.left);
        add(day, { city: stop.city.slug, minutes: use, isDayTrip: false, base: null, roundTripMin: 0 });
        need -= use;
        day.left -= use;
      }

      /*
       * 근교를 같은 날에 이어 붙인다.
       *
       * 예전에는 근교가 무조건 하루를 먹었다. 왕복 두 시간 반짜리 세고비아와
       * 왕복 40분짜리 근교가 같은 값이었다. 이제는 왕복 + 볼거리를 예산에서
       * 빼므로, 작은 근교는 거점 일정과 같은 날에 들어간다.
       *
       * 두 가지를 지킨다.
       *
       * 1. **짐을 옮기는 날에는 근교를 붙이지 않는다.** 짐을 들고 근교를
       *    다녀올 수는 없다.
       * 2. **자투리 때문에 왕복을 두 번 하지 않는다.** 톨레도에 20분이
       *    남았다고 왕복 140분을 다시 쓰는 것은 계획이 아니다. 남은 것이
       *    최소체류에 못 미치면 그만 간다 — 당일치기로 볼 수 있는 만큼이
       *    거기까지라는 뜻이고, 더 보고 싶으면 거점으로 잡아야 한다.
       */
      /*
       * 근교에 가면, 가는 데 쓴 시간보다는 오래 머문다.
       *
       * 예전에는 남은 자투리에 근교를 밀어 넣었다. 그래서 '마드리드 294분을
       * 보고 남은 273분으로 톨레도(왕복 140분) 133분' 같은 날이 나왔다.
       * 두 시간 이십 분을 길에 쓰고 담은 것의 3분의 1을 본다는 뜻이고,
       * 나머지 251분은 '같은 근교는 하루만' 규칙에 걸려 조용히 버려졌다.
       *
       * 규칙은 하나다. **자를 거면 자를 이유가 있어야 한다.**
       *
       * 빈 날이면 오늘이 그 근교에 줄 수 있는 최선이다 — 다 못 봐도 가고,
       * 남는 몫은 unseen 으로 알린다. 하지만 이미 다른 도시를 본 날에
       * 얹으려면 담은 것을 오늘 안에 다 볼 수 있어야 한다. 그러지 못하면
       * 빈 날을 하나 쓰는 편이 낫다 — 거기서는 다 볼 수 있기 때문이다.
       *
       * 여기서 '빈 날이면 무조건 간다' 를 빼면 안 된다. 왕복 6시간 50분짜리
       * 세비야를 사용자가 손수 '짐 안 옮기기' 로 바꾼 경우, 하루를 다 써도
       * 왕복을 못 이긴다. 그때 안 간다고 하면 사용자가 가겠다고 한 도시가
       * 통째로 사라진다 — 잘라 가는 것보다 나쁘다.
       */
      const takes = (day: Open, t: { minutes: number; round: number }): boolean => {
        const room = day.left - t.round;
        if (room < MIN_STAY_MIN) return false;
        if (day.legs.length === 0) return true;
        return room >= t.minutes;
      };

      while (!day.moves.length && queue.length && takes(day, queue[0])) {
        const t = queue[0];
        const room = day.left - t.round;
        const use = Math.min(t.minutes, room);
        add(day, {
          city: t.stop.city.slug, minutes: use,
          isDayTrip: true, base: stop.city.slug, roundTripMin: t.round,
        });
        moveTotal += t.round;
        day.left -= t.round + use;
        t.minutes -= use;
        /*
         * 같은 근교는 하루만 간다.
         *
         * 코르도바를 사흘 연속 당일치기로 다녀오면 왕복 164분을 세 번 쓴다.
         * 그렇게 볼 곳이 많은 도시라면 거기서 자는 편이 낫고, 그 판단은
         * 거점 엔진이 이미 한다(옮길 값어치 1.5일). 당일치기로 볼 수 있는
         * 것은 하루치까지다 — 남는 것은 조용히 버리지 않고 unseen 으로 알린다.
         */
        if (t.minutes > 0) unseen.set(t.stop.city.slug, (unseen.get(t.stop.city.slug) ?? 0) + t.minutes);
        queue.shift();
      }

      /*
       * 한 구간도 못 될 만큼 적게 남았으면 이미 그 도시를 보던 날에 얹는다.
       *
       * '마드리드 6분' 짜리 날을 새로 만드는 것은 계획이 아니라 계산의
       * 찌꺼기다. 어제 마저 보면 되는 시간이다.
       */
      if (need > 0 && need < MIN_SEG_MIN) {
        const pools = [...(cur ? [{ legs: cur.legs }] : []), ...[...days].reverse()];
        let put = false;
        for (const d of pools) {
          const leg = d.legs.find((l) => l.city === stop.city.slug && !l.isDayTrip);
          if (leg) {
            leg.minutes += need;
            given.set(stop.city.slug, (given.get(stop.city.slug) ?? 0) + need);
            put = true;
            break;
          }
        }
        if (!put && day.left >= need) {
          add(day, { city: stop.city.slug, minutes: need, isDayTrip: false, base: null, roundTripMin: 0 });
          day.left -= need;
        } else if (!put) {
          unseen.set(stop.city.slug, (unseen.get(stop.city.slug) ?? 0) + need);
        }
        need = 0;
      }
      if (need <= 0 && !queue.length) break;
      /*
       * 아직 남았는데 오늘은 더 못 넣는다(예산이 찼거나 짐을 옮긴 날이다).
       * 날을 닫고 새 날을 연다.
       */
      const before = day.legs.length;
      close();
      /*
       * 마지막 방어선.
       *
       * 빈 날을 열었는데도 아무것도 못 넣었다면 다음 바퀴도 똑같다 —
       * 그대로 두면 영원히 돈다. 넣을 수 없는 것은 넣을 수 없다고 하고
       * 큐에서 뺀다. 끝나지 않는 계산은 사용자에게 멈춘 화면으로 보인다.
       */
      if (before === 0) {
        if (queue.length) {
          const t = queue.shift()!;
          if (t.minutes > 0) unseen.set(t.stop.city.slug, (unseen.get(t.stop.city.slug) ?? 0) + t.minutes);
        } else if (need > 0) {
          unseen.set(stop.city.slug, (unseen.get(stop.city.slug) ?? 0) + need);
          need = 0;
        }
      }
    }

    // 볼거리도 근교도 없는 거점이라도 짐을 옮겼으면 밤은 보낸다.
    if (cur && !cur.legs.length && !cur.moves.length) {
      add(cur, { city: stop.city.slug, minutes: 0, isDayTrip: false, base: null, roundTripMin: 0 });
    }
  }
  close();

  return { days, given, moveMin: moveTotal, unseen };
}

/** 담은 것을 다 보는 데 필요한 날. 3단계와 4단계가 같은 값을 쓴다. */
export function needDaysOf(r: PackResult): number {
  return r.days.length;
}
