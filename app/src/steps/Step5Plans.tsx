import { useMemo } from 'react';
import type { City, Item, LastDayPlan, Plan, PlanDay, PlanStyle, Preferences, Priorities } from '../types';
import type { BaseGroup } from '../lib/basing';
import { buildPlans, formatTime, SLOT_LABEL } from '../lib/planner';
import { alternativesForDay } from '../lib/alternatives';
import type { Alternative } from '../lib/alternatives';
import { THEME_ICON, THEME_LABEL } from '../lib/themes';

/** 4단계 — 담은 곳을 바탕으로 밀도가 다른 3가지 안을 만든다. */
export default function Step5Plans({
  items, cities, groups, startDate, days, lastDayPlan, prefs, priorities, chosen, onChoose, onPlans, onSwap,
}: {
  items: Item[];
  cities: City[];
  groups: BaseGroup[];
  startDate: string;
  days: number;
  lastDayPlan: LastDayPlan;
  prefs: Preferences;
  priorities: Priorities;
  chosen: PlanStyle | null;
  onChoose: (style: PlanStyle) => void;
  onPlans: (plans: Plan[]) => void;
  /** 일정 하나를 빼고 다른 곳(들)을 넣는다. 계획은 우선순위에서 다시 만들어진다. */
  onSwap: (out: Item, inItems: Item[]) => void;
}) {
  const { plans, dropped } = useMemo(() => {
    const built = buildPlans({ items, groups, startDate, days, lastDayPlan, prefs, priorities });
    onPlans(built.plans);
    return built;
    // onPlans 는 저장만 하므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, groups, startDate, days, lastDayPlan, prefs, priorities]);

  const active = plans.find((p) => p.style === chosen) ?? plans[0];
  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;

  /** 이 계획에 안 들어간 아이템 — 대안은 여기서만 나온다. */
  const pool = useMemo(() => {
    const inPlan = new Set(active?.days.flatMap((d) => d.entries.map((e) => e.item.id)) ?? []);
    return items.filter((i) => !inPlan.has(i.id));
  }, [items, active]);

  if (!active || active.stats.items === 0) {
    return (
      <>
        <h2>계획 3가지</h2>
        <div className="empty">
          선택한 항목으로는 일정을 만들 수 없습니다.<br />
          이전 단계에서 가고 싶은 곳을 더 골라주세요.
        </div>
      </>
    );
  }

  return (
    <>
      <h2>계획 3가지</h2>
      <p className="lede">같은 우선순위로 하루 밀도만 다르게 짰습니다. 탭으로 비교해 보세요.</p>

      {dropped.length > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          날짜가 모자라 {dropped.join(' · ')}은 넣지 못했습니다. 일정을 늘리거나 1단계에서 도시를 줄여 보세요.
        </div>
      )}

      <div className="plan-tabs" role="group">
        {plans.map((p) => (
          <button
            key={p.style} type="button" className="plan-tab"
            aria-pressed={active.style === p.style}
            onClick={() => onChoose(p.style)}
          >
            <div className="t">{p.title}</div>
            <div className="s">{p.stats.items}곳 · {(p.stats.items / days).toFixed(1)}곳/일</div>
          </button>
        ))}
      </div>

      <p className="lede">{active.summary}</p>

      <div className="stats">
        <div className="stat"><div className="v">{active.stats.items}</div><div className="k">전체 일정</div></div>
        <div className="stat"><div className="v">{active.stats.walkKm}km</div><div className="k">이동 거리</div></div>
        <div className="stat"><div className="v">€{active.stats.costEur}</div><div className="k">입장·식사 예상</div></div>
      </div>

      <div className="chips" style={{ marginBottom: 20 }}>
        {Object.entries(active.stats.themeMix)
          .sort((a, b) => b[1] - a[1])
          .map(([theme, n]) => (
            <span className="tag" key={theme}>
              {THEME_ICON[theme as keyof typeof THEME_ICON]} {THEME_LABEL[theme as keyof typeof THEME_LABEL]} {n}
            </span>
          ))}
      </div>

      {active.days.map((day) => (
        <Day
          key={day.dayIndex} day={day} pool={pool} prefs={prefs}
          cityName={cityName} onSwap={onSwap}
        />
      ))}
    </>
  );
}

/** 하루치. 대안은 여기서 한 번에 뽑아 자리마다 나눠 준다. */
function Day({
  day, pool, prefs, cityName, onSwap,
}: {
  day: PlanDay;
  pool: Item[];
  prefs: Preferences;
  cityName: (slug: string) => string;
  onSwap: (out: Item, inItems: Item[]) => void;
}) {
  const altsByItem = useMemo(() => alternativesForDay(day, pool, prefs), [day, pool, prefs]);
  return (
        <div className="day" key={day.dayIndex}>
          <div className="day-head">
            <span className="n">{day.dayIndex}일차</span>
            <span className="d">
              {day.date} · {cityName(day.city)}
              {day.returnTo && (
                day.entries.some((e) => e.returnLeg && (e.slot === 'afternoon' || e.slot === 'evening'))
                  ? ` (오전) → ${cityName(day.returnTo)} (오후)`
                  : ` → ${cityName(day.returnTo)} (저녁)`
              )}
            </span>
            {day.isDayTrip && (
              <span className="badge">
                {day.entries.some((e) => e.returnLeg && (e.slot === 'afternoon' || e.slot === 'evening'))
                  ? '반나절 근교' : '근교 당일치기'}
              </span>
            )}
          </div>
          <div className="card">
            {day.entries.length === 0 ? (
              <div className="empty">이 날에 넣을 항목이 부족합니다. 3단계에서 더 담아주세요.</div>
            ) : (
              day.entries.map((e, i) => (
                <div className="entry" key={`${e.item.id}-${i}`}>
                  <div>
                    <div className="time">{formatTime(e.startMin)}</div>
                    <div className="slot">{SLOT_LABEL[e.slot]}</div>
                  </div>
                  <div>
                    {e.returnLeg && (
                      <div className="travel return-leg">
                        ↑ {cityName(e.returnLeg.from)} → {cityName(e.returnLeg.to)} 이동 {e.returnLeg.minutes}분
                      </div>
                    )}
                    <div className="title">{THEME_ICON[e.item.theme]} {e.item.name}</div>
                    <div className="sub">{e.item.nameLocal ?? e.item.nameEn}</div>
                    {e.item.summary && <div className="entry-summary">{e.item.summary}</div>}
                    {(e.item.practical.booking || e.item.caution) && (
                      <div className="entry-flag">
                        {e.item.practical.booking ? `예약 · ${e.item.practical.booking}` : `주의 · ${e.item.caution}`}
                      </div>
                    )}
                    {!e.returnLeg && e.travelMin > 0 && (
                      <div className="travel">↑ 앞 일정에서 약 {e.travelMin}분 이동</div>
                    )}
                  </div>
                  <Alternatives alts={altsByItem.get(e.item.id) ?? []} target={e.item} onSwap={onSwap} />
                </div>
              ))
            )}
          </div>
        </div>
  );
}

/**
 * 한 일정 자리의 대안.
 *
 * 넓은 화면에서는 일정 오른쪽 칸에 붙고, 폰에서는 아래로 내려온다.
 * 390px 에서 오른쪽에 칸을 하나 더 두면 일정 제목이 두 글자씩 끊긴다.
 *
 * 누르면 그 자리에서 바꾼다. 보여 주기만 하면 결국 이전 단계로 돌아가
 * 다시 고르게 되므로, 바꾸는 것까지가 이 기능이다.
 */
function Alternatives({
  alts, target, onSwap,
}: {
  alts: Alternative[];
  target: Item;
  onSwap: (out: Item, inItems: Item[]) => void;
}) {
  if (!alts.length) return <div className="entry-alts" />;
  return (
    <details className="entry-alts">
      <summary>대안 {alts.length}</summary>
      <div className="alt-list">
        {alts.map((a) => (
          <button
            key={a.items.map((i) => i.id).join('+')}
            type="button" className="alt"
            onClick={() => onSwap(target, a.items)}
          >
            <div className="alt-name">{a.items.map((i) => i.name).join(' + ')}</div>
            <div className="alt-why">{a.reason}</div>
            <div className="alt-delta">
              {a.deltaMin === 0 ? '소요 같음'
                : a.deltaMin > 0 ? `${a.deltaMin}분 더 걸림` : `${-a.deltaMin}분 짧음`}
            </div>
          </button>
        ))}
      </div>
    </details>
  );
}
