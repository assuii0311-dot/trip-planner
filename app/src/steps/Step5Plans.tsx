import { useMemo } from 'react';
import type { City, Item, LastDayPlan, Plan, PlanDay, PlanStyle, PlanTravel, Preferences, Priorities } from '../types';
import type { Itinerary } from '../lib/itinerary';
import { fmtDur, fmtHm } from '../lib/routing';
import { buildPlans, formatTime, SLOT_LABEL } from '../lib/planner';
import { alternativesForDay } from '../lib/alternatives';
import type { Alternative } from '../lib/alternatives';
import { THEME_ICON, THEME_LABEL } from '../lib/themes';

/** 4단계 — 담은 곳을 바탕으로 밀도가 다른 3가지 안을 만든다. */
export default function Step5Plans({
  items, cities, itinerary, startDate, days, lastDayPlan, prefs, priorities, chosen,
  onChoose, onPlans, onSwap, onMode, onLodging, onDropCity, onMoveCity, onMoveEntry, manualOrder,
}: {
  items: Item[];
  cities: City[];
  itinerary: Itinerary;
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
  /** 도시 간 이동 수단을 바꾼다. 바꾸면 도착 시각이 달라져 그날 일정이 다시 짜인다. */
  onMode: (from: string, to: string, mode: string) => void;
  /** 이 도시에서 잘지 당일치기로 다녀올지 바꾼다. */
  onLodging: (city: string, how: 'sleep' | 'daytrip') => void;
  /** 날이 모자랄 때 이 도시를 뺀다. */
  onDropCity: (city: string) => void;
  /** 도시 순서를 한 칸 옮긴다. 옮기면 교통편을 다시 찾는다. */
  onMoveCity: (city: string, dir: -1 | 1) => void;
  /** 하루 안에서 일정을 한 칸 옮긴다. */
  onMoveEntry: (date: string, itemId: string, dir: -1 | 1) => void;
  /** 사용자가 순서를 손댄 날짜들. 되돌리기 버튼을 띄우는 데 쓴다. */
  manualOrder: Record<string, string[]>;
}) {
  const { plans, overflow, spare } = useMemo(() => {
    const built = buildPlans({
      items, itinerary, startDate, days, lastDayPlan, prefs, priorities, dayOrder: manualOrder,
    });
    onPlans(built.plans);
    return built;
    // onPlans 는 저장만 하므로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, itinerary, startDate, days, lastDayPlan, prefs, priorities, manualOrder]);

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

      {overflow.length > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px' }}>
            <b>{days}일로는 {overflow.reduce((a, o) => a + o.days, 0)}일이 모자랍니다.</b>{' '}
            아래 도시가 일정 끝에서 밀려났습니다. <b>무엇을 뺄지 직접 고르세요</b> —
            앱이 조용히 정하지 않습니다.
          </p>
          <div className="chips">
            {overflow.map((o) => (
              <button
                key={o.city} type="button" className="chip"
                onClick={() => onDropCity(o.city)}
              >
                {o.name} 빼기 ({o.days}일)
              </button>
            ))}
          </div>
          <p className="help" style={{ margin: '8px 0 0' }}>
            도시를 빼는 대신 3단계에서 아이템을 줄이거나, 1단계에서 날짜를 늘려도 됩니다.
          </p>
        </div>
      )}

      {spare > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <b>{spare}일이 빕니다.</b> 고르신 곳을 다 봐도 날이 남습니다.
          3단계에서 아이템을 더 담거나, 1단계에서 도시를 더 고르세요.
          그대로 두면 그 날들은 자유 시간이 됩니다.
        </div>
      )}

      <ItineraryBar
        itinerary={itinerary} cities={cities}
        onLodging={onLodging} onMoveCity={onMoveCity}
      />

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
          cityName={cityName} onSwap={onSwap} onMode={onMode}
          onMoveEntry={onMoveEntry} touched={Boolean(manualOrder[day.date])}
        />
      ))}
    </>
  );
}

/** 하루치. 대안은 여기서 한 번에 뽑아 자리마다 나눠 준다. */
function Day({
  day, pool, prefs, cityName, onSwap, onMode, onMoveEntry, touched,
}: {
  day: PlanDay;
  pool: Item[];
  prefs: Preferences;
  cityName: (slug: string) => string;
  onSwap: (out: Item, inItems: Item[]) => void;
  onMode: (from: string, to: string, mode: string) => void;
  onMoveEntry: (date: string, itemId: string, dir: -1 | 1) => void;
  touched: boolean;
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
            {touched && <span className="badge">순서 바꿈</span>}
            {day.isDayTrip && (
              <span className="badge">
                {day.entries.some((e) => e.returnLeg && (e.slot === 'afternoon' || e.slot === 'evening'))
                  ? '반나절 근교' : '근교 당일치기'}
              </span>
            )}
          </div>
          {day.travel && (
            <TravelBlock travel={day.travel} cityName={cityName} onMode={onMode} />
          )}
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
                    <div className="entry-move" role="group" aria-label="순서 바꾸기">
                      <button
                        type="button" disabled={i === 0}
                        aria-label={`${e.item.name} 앞으로`}
                        onClick={() => onMoveEntry(day.date, e.item.id, -1)}
                      >↑</button>
                      <button
                        type="button" disabled={i === day.entries.length - 1}
                        aria-label={`${e.item.name} 뒤로`}
                        onClick={() => onMoveEntry(day.date, e.item.id, 1)}
                      >↓</button>
                    </div>
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

/**
 * 도시를 옮기는 구간.
 *
 * 무엇을 타고, 몇 시에 나서서, 몇 시에 닿는지를 적는다. 예전에는 이 구간이
 * 아예 없어서 오후 1시에 도착하는 도시에 오전 일정이 들어가 있었다.
 *
 * 대안 수단을 함께 놓고 그 자리에서 바꾸게 한다. 바꾸면 도착 시각이 달라져
 * 그날 일정이 다시 짜인다 — 비행기로 바꾸면 오후가 통째로 사라지는 것이
 * 눈에 보여야 한다.
 */
function TravelBlock({
  travel, cityName, onMode,
}: {
  travel: PlanTravel;
  cityName: (slug: string) => string;
  onMode: (from: string, to: string, mode: string) => void;
}) {
  const c = travel.chosen;
  return (
    <div className="travel-block">
      <div className="travel-head">
        <span className="travel-icon">{c.icon}</span>
        <div>
          <div className="travel-route">
            {cityName(travel.from)} → {cityName(travel.to)}
          </div>
          <div className="travel-when">
            {fmtHm(travel.leaveAt)} 숙소 출발 · {fmtHm(travel.departAt)} 탑승 · {fmtHm(travel.arriveAt)} 도착
          </div>
        </div>
        <div className="travel-total">{fmtDur(travel.arriveAt - travel.leaveAt)}</div>
      </div>
      <div className="travel-meta">
        {c.label}
        {c.transfers > 0 && ` · 환승 ${c.transfers}회`}
        {travel.waitMin > 0 && ` · ${c.mode === 'flight' ? '공항' : c.mode === 'bus' ? '터미널' : '역'}에서 대기 ${travel.waitMin}분`}
        {c.costEur > 0 && ` · 약 €${c.costEur}`}
        {c.estimated && ' · 시간은 추정치입니다'}
      </div>
      {c.note && <div className="travel-note">{c.note}</div>}

      {travel.options.length > 1 && (
        <details className="travel-alts">
          <summary>다른 수단 {travel.options.length - 1}가지</summary>
          <div className="mode-list">
            {travel.options.map((o) => (
              <button
                key={o.mode} type="button"
                className={`mode${o.mode === c.mode ? ' is-on' : ''}`}
                aria-pressed={o.mode === c.mode}
                onClick={() => onMode(travel.from, travel.to, o.mode)}
              >
                <span className="mode-icon">{o.icon}</span>
                <span className="mode-body">
                  <span className="mode-label">{o.label}</span>
                  <span className="mode-sub">
                    문앞~문앞 {fmtDur(o.totalMin)}
                    {o.costEur > 0 && ` · €${o.costEur}`}
                  </span>
                </span>
                {o.mode === c.mode && <span className="mode-on">선택됨</span>}
              </button>
            ))}
          </div>
          {travel.unavailable.length > 0 && (
            <p className="help" style={{ margin: '8px 0 0' }}>
              그날 막차가 끊겨 못 쓰는 수단: {travel.unavailable.join(' · ')}
            </p>
          )}
        </details>
      )}
    </div>
  );
}

/**
 * 여정 요약 — 도시 순서와 숙박.
 *
 * 어디서 자고 어디를 당일치기로 다녀오는지가 계획 전체를 좌우하므로
 * 맨 위에 놓고, 그 자리에서 바꿀 수 있게 한다.
 */
function ItineraryBar({
  itinerary, cities, onLodging, onMoveCity,
}: {
  itinerary: Itinerary;
  cities: City[];
  onLodging: (city: string, how: 'sleep' | 'daytrip') => void;
  onMoveCity: (city: string, dir: -1 | 1) => void;
}) {
  const name = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  return (
    <details className="itin">
      <summary>
        <b>동선</b>{' '}
        {itinerary.stops.map((s) => s.city.name).join(' → ')}
        {' · '}이동 합계 {fmtDur(itinerary.transitMin)}
      </summary>
      <div className="itin-body">
        <p className="help" style={{ margin: '0 0 10px' }}>
          도시 간 이동 시간이 가장 짧은 순서로 짰습니다. 숙박은 하루치를 채우는 도시에서만 하고,
          짧게 볼 곳은 가까운 숙박지에서 다녀옵니다. <b>화살표로 순서를 바꾸면 교통편을 다시 찾습니다.</b>
        </p>
        {itinerary.stops.map((s, i) => (
          <div className="itin-row" key={s.city.slug}>
            <div className="itin-move" role="group" aria-label={`${s.city.name} 순서 바꾸기`}>
              <button
                type="button" disabled={i === 0}
                aria-label={`${s.city.name} 앞으로`}
                onClick={() => onMoveCity(s.city.slug, -1)}
              >↑</button>
              <button
                type="button" disabled={i === itinerary.stops.length - 1}
                aria-label={`${s.city.name} 뒤로`}
                onClick={() => onMoveCity(s.city.slug, 1)}
              >↓</button>
            </div>
            <span className="itin-city">{s.city.name}</span>
            <span className="itin-state">
              {s.sleep ? `${s.nights}박` : `당일치기 ← ${name(s.base ?? '')}`}
            </span>
            <button
              type="button" className="itin-swap"
              onClick={() => onLodging(s.city.slug, s.sleep ? 'daytrip' : 'sleep')}
            >
              {s.sleep ? '당일치기로' : '여기서 자기'}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
