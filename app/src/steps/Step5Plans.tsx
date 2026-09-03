import { useMemo } from 'react';
import type { City, Item, Plan, PlanDay, PlanStyle, PlanTravel, Preferences } from '../types';
import type { Itinerary } from '../lib/itinerary';
import { carNotes, carPlanOf } from '../lib/car';
import { lodgingLinks, lodgingPlan } from '../lib/lodging';
import { cityMove, transitTip } from '../lib/citymove';
import type { AirportInfo } from '../lib/airporttime';
import { fmtDur, fmtHm } from '../lib/routing';
import { mapsPlaceUrl } from '../lib/deeplinks';
import { ItemDetail } from '../components/ItemDetail';
import { ItemPhoto } from '../components/ItemPhoto';
import { formatTime, SLOT_LABEL } from '../lib/planner';
import { alternativesForDay } from '../lib/alternatives';
import type { Alternative } from '../lib/alternatives';
import { THEME_ICON, THEME_LABEL } from '../lib/themes';
import { josa } from '../lib/korean';
import { MOVE_LABEL, MOVE_TIMINGS, timingBlocked, whyTiming, type MoveTiming } from '../lib/daypack';

/** 4단계 — 담은 곳을 바탕으로 밀도가 다른 3가지 안을 만든다. */
export default function Step5Plans({
  items, cities, itinerary, days, prefs, plans, overflow, unseen, needDays, chosen, onTiming,
  onChoose, onSwap, onMode, onLodging, onDropCity, onMoveCity, onMoveEntry, onDropItem,
  manualOrder, airport,
}: {
  items: Item[];
  cities: City[];
  itinerary: Itinerary;
  days: number;
  prefs: Preferences;
  /** 계획은 App 이 만든다. 어느 단계를 보고 있든 존재해야 하기 때문이다. */
  plans: Plan[];
  overflow: { city: string; name: string; days: number }[];
  /** 당일치기로는 다 못 보고 남은 시간(분). 도시 slug → 분. */
  unseen?: Map<string, number>;
  /** 담은 것으로 차는 날. 3단계와 같은 엔진이 센 값이다. */
  needDays: number;
  chosen: PlanStyle;
  onChoose: (style: PlanStyle) => void;
  /** 일정 하나를 빼고 다른 곳(들)을 넣는다. 계획은 우선순위에서 다시 만들어진다. */
  onSwap: (out: Item, inItems: Item[]) => void;
  /** 도시 간 이동 수단을 바꾼다. 바꾸면 도착 시각이 달라져 그날 일정이 다시 짜인다. */
  onMode: (from: string, to: string, mode: string) => void;
  onTiming: (from: string, to: string, t: MoveTiming) => void;
  /** 이 도시에서 잘지 당일치기로 다녀올지 바꾼다. */
  onLodging: (city: string, how: 'sleep' | 'daytrip') => void;
  /** 날이 모자랄 때 이 도시를 뺀다. */
  onDropCity: (city: string) => void;
  /** 도시 순서를 한 칸 옮긴다. 옮기면 교통편을 다시 찾는다. */
  onMoveCity: (city: string, dir: -1 | 1) => void;
  /** 하루 안에서 일정을 한 칸 옮긴다. */
  onMoveEntry: (date: string, itemId: string, dir: -1 | 1) => void;
  /** 일정 하나를 계획에서 뺀다. */
  onDropItem: (item: Item) => void;
  /** 사용자가 순서를 손댄 날짜들. 되돌리기 버튼을 띄우는 데 쓴다. */
  manualOrder: Record<string, string[]>;
  /** 공항이 정하는 여행의 앞뒤. 시각을 안 넣었으면 null. */
  airport?: AirportInfo | null;
}) {
  const active = plans.find((p) => p.style === chosen) ?? plans[0];
  /*
   * 담은 것으로 실제로 차는 날.
   *
   * '일정이 들어간 날' 로 세면 안 된다 — 남는 날에도 담지 않은 후보가
   * 자동으로 채워지므로 언제나 여행 일수와 같아진다. 실제로 3단계는 6일,
   * 4단계는 11일이라고 말하는 일이 있었다. 3단계와 같은 엔진이 센 값을 쓴다.
   */
  const usedDays = needDays;
  /*
   * 여유는 실제로 쓴 날에서 센다.
   *
   * 엔진이 돌려주는 spare 는 '자르기 전 일정 길이' 로 잰 값이라, 뒤에 빈
   * 날을 채워 넣은 뒤의 화면과 어긋났다 — '11일 계획 · 11일 사용 · 5일 여유'
   * 처럼 합이 맞지 않는 줄이 나왔다.
   */
  const shortfall = overflow.reduce((a, o) => a + o.days, 0);
  /* 당일치기로 못 본 몫. 한 시간이 안 되는 자투리는 말할 값어치가 없다. */
  const unseenList = [...(unseen ?? new Map())]
    .filter(([, min]) => min >= 60)
    .map(([city, min]) => ({
      city, min,
      name: cities.find((c) => c.slug === city)?.name ?? city,
      hours: `${Math.round(min / 6) / 10}시간`,
    }))
    .sort((a, b) => b.min - a.min);
  const freeDays = Math.max(0, days - usedDays);
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

      {/*
        이 계획이 며칠짜리인지 언제나 보인다.

        예전에는 모자라거나 남을 때만 말하고, 딱 맞으면 아무 말도 없었다.
        그래서 '며칠짜리 계획인가' 를 알 방법이 없었다. 3단계와 같은 엔진이
        센 값이라 두 화면이 어긋나지 않는다.
      */}
      <p className="day-tally">
        <b>{days}일 계획</b> · 담은 것으로 {usedDays}일
        {shortfall > 0
          ? ` · ${shortfall}일 모자람`
          : freeDays > 0
            ? ` · ${freeDays}일 여유 — 남는 날은 담지 않은 곳으로 채워 두었습니다`
            : ' · 딱 맞습니다'}
      </p>

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

      {/*
        당일치기로 다 못 본 것은 말을 해 준다.

        예전에는 조용히 버렸다. 톨레도를 담았는데 상세 일정에 한 곳도 없고,
        왜 없는지도 화면 어디에도 없었다. 담은 것이 안 들어갔으면 그 사실이
        화면에 남아야 한다 — 거점으로 바꾸면 다 볼 수 있다는 것까지.
      */}
      {unseenList.length > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px' }}>
            <b>당일치기로는 여기까지입니다.</b>{' '}
            아래는 담았지만 하루 안에 다 넣지 못한 몫입니다. 왕복 시간이 하루를
            먹기 때문입니다. 더 보고 싶으면 그 도시에서 자는 편이 낫습니다.
          </p>
          <div className="chips">
            {unseenList.map((u) => (
              <button
                key={u.city} type="button" className="chip"
                onClick={() => onLodging(u.city, 'sleep')}
              >
                {u.name} {u.hours} 남음 — 여기서 자기
              </button>
            ))}
          </div>
        </div>
      )}

      {freeDays > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <b>{freeDays}일이 빕니다.</b> 고르신 곳을 다 봐도 날이 남습니다.
          3단계에서 아이템을 더 담거나, 1단계에서 도시를 더 고르세요.
          그대로 두면 그 날들은 자유 시간이 됩니다.
        </div>
      )}

      <ItineraryBar
        itinerary={itinerary} cities={cities} plan={active}
        onLodging={onLodging} onMoveCity={onMoveCity} onDropCity={onDropCity}
      />

      <LodgingPanel plan={active} cities={cities} />

      <CarPanel itinerary={itinerary} plan={active} onMode={onMode} />

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

      {active.days.map((day, i) => (
        <Day
          key={day.dayIndex} day={day} pool={pool} prefs={prefs} cities={cities}
          airport={airport}
          isFirst={i === 0} isLast={i === active.days.length - 1}
          cityName={cityName} onSwap={onSwap} onMode={onMode} onTiming={onTiming}
          onMoveEntry={onMoveEntry} onDropItem={onDropItem}
          touched={Boolean(manualOrder[day.date])}
        />
      ))}
    </>
  );
}

/** 하루치. 대안은 여기서 한 번에 뽑아 자리마다 나눠 준다. */
function Day({
  day, pool, prefs, cities, airport, isFirst, isLast, cityName,
  onSwap, onMode, onTiming, onMoveEntry, onDropItem, touched,
}: {
  day: PlanDay;
  pool: Item[];
  prefs: Preferences;
  cities: City[];
  airport?: AirportInfo | null;
  isFirst: boolean;
  isLast: boolean;
  cityName: (slug: string) => string;
  onSwap: (out: Item, inItems: Item[]) => void;
  onMode: (from: string, to: string, mode: string) => void;
  onTiming: (from: string, to: string, t: MoveTiming) => void;
  onMoveEntry: (date: string, itemId: string, dir: -1 | 1) => void;
  /** 이 일정을 계획에서 뺀다. */
  onDropItem: (item: Item) => void;
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
                  ? ` (오전) → ${cityName(day.returnTo)} (오후·저녁)`
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
            {day.sleepAt && (
              <span className="day-sleep">
                🛏 {cityName(day.sleepAt)}
                {day.sleepAt !== day.city && ' (짐은 그대로)'}
              </span>
            )}
          </div>
          {/*
            공항은 착륙과 이륙 사이에만 있는 것이 아니다. 입국심사와 수하물,
            시내로 들어가는 이동, 돌아갈 때의 체크인과 보안이 여행의 앞뒤를
            반나절씩 먹는다. 그것을 그날 자리에 적어 둔다.
          */}
          {isFirst && airport?.arrival && airport.firstDayStart !== null && (
            <div className="airport-block">
              <div className="airport-line">
                🛬 <b>{airport.arrivalTime}</b> 착륙 · {airport.arrivalAirport} →
                {' '}<b>{fmtHm(airport.firstDayStart)}</b>부터 일정
              </div>
              <div className="airport-why">{airport.arrival.note}</div>
            </div>
          )}
          {/*
            그날 타는 것을 모두, 같은 형태로 적는다.

            예전에는 짐을 옮기는 이동만 제대로 안내하고 근교 왕복은 머리줄에
            한 줄이 전부였다. 실제로 타는 시간은 근교 쪽이 더 긴 날도 있는데
            몇 시 편인지도, 얼마인지도, 다른 수단이 있는지도 없었다.
            그리고 이동은 하루에 둘일 수 있다 — 아침에 들어와 저녁에 나가는 날.
          */}
          {day.travels.map((t) => (
            <TravelBlock
              key={`${t.kind}:${t.from}>${t.to}`}
              travel={t} cityName={cityName} onMode={onMode} onTiming={onTiming}
            />
          ))}
          <div className="card">
            {day.entries.length === 0 ? (
              <div className="empty">
                {/* 빈 날의 이유가 두 가지다. 담은 것이 모자란 경우와, 비행기
                    시각 때문에 아침에 바로 공항으로 가는 경우는 다른 일이다. */}
                {isLast && airport?.lastDayEnd !== null && airport?.lastDayEnd !== undefined
                  ? `공항으로 가는 날입니다. ${fmtHm(airport.lastDayEnd)}에는 나서야 해서 일정을 넣지 않았습니다.`
                  : '이 날에 넣을 항목이 부족합니다. 3단계에서 더 담아주세요.'}
              </div>
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
                    {!e.returnLeg && e.travelMin > 0 && (() => {
                      /*
                        무엇을 타고 가는지 없이 "약 18분 이동" 만 있으면 그 자리에서
                        할 수 있는 판단이 없다. 걷는 18분과 지하철 18분은 다른 일이다.
                      */
                      const prev = day.entries[i - 1]?.item;
                      if (!prev) return null;
                      const mv = cityMove(prev, e.item, e.travelMin, cities.find((c) => c.slug === e.item.city));
                      const tip = transitTip(cities.find((c) => c.slug === e.item.city), mv.mode);
                      return (
                        <div className="travel">
                          {mv.icon} {mv.label} 약 {mv.minutes}분
                          {mv.km !== null && ` · ${mv.km}km`}
                          {mv.url && (
                            <>
                              {' · '}
                              <a href={mv.url} target="_blank" rel="noreferrer">길찾기</a>
                            </>
                          )}
                          {tip && <span className="travel-tip">{tip}</span>}
                        </div>
                      );
                    })()}
                    <div className="entry-actions">
                      {/*
                        계획을 보다가 '이건 빼자' 가 되는 것이 자연스러운데,
                        그러려면 3단계로 돌아가 그 도시를 찾아 체크를 풀어야
                        했다. 여기서 바로 뺀다. 순서 바꾸기와는 하는 일이
                        다르니 같은 묶음에 넣지 않는다.
                      */}
                      <button
                        type="button" className="entry-drop"
                        aria-label={`${e.item.name} 일정에서 빼기`}
                        title={`${e.item.name} 빼기`}
                        onClick={() => onDropItem(e.item)}
                      >✕</button>
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
                  </div>
                  <Alternatives alts={altsByItem.get(e.item.id) ?? []} target={e.item} onSwap={onSwap} />
                </div>
              ))
            )}
          </div>
          {isLast && airport?.departure && airport.lastDayEnd !== null && (
            <div className="airport-block">
              <div className="airport-line">
                🛫 <b>{fmtHm(airport.lastDayEnd)}</b>에 나섬 · {airport.departureAirport} →
                {' '}<b>{airport.departureTime}</b> 이륙
              </div>
              <div className="airport-why">{airport.departure.note}</div>
            </div>
          )}
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
          <div className="alt" key={a.items.map((i) => i.id).join('+')}>
            <div className="alt-name">{a.items.map((i) => i.name).join(' + ')}</div>
            {/* 이름만 보고는 바꿀지 못 정한다. 무엇인지 한 줄로 먼저 알려 준다. */}
            {a.items.map((i) => i.summary).filter(Boolean).length > 0 && (
              <div className="alt-sum">
                {a.items.map((i) => i.summary).filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="alt-why">{a.reason}</div>
            <div className="alt-delta">
              {a.deltaMin === 0 ? '소요 같음'
                : a.deltaMin > 0 ? `${a.deltaMin}분 더 걸림` : `${-a.deltaMin}분 짧음`}
            </div>
            <div className="alt-acts">
              <button type="button" className="alt-take" onClick={() => onSwap(target, a.items)}>
                이걸로 바꾸기
              </button>
              <details className="alt-more">
                <summary>자세히</summary>
                <div className="alt-detail">
                  {a.items.map((i) => (
                    <div key={i.id} className="alt-item">
                      <div className="alt-item-head">
                        <ItemPhoto item={i} />
                        <div>
                          <div className="alt-item-name">{i.name}</div>
                          <div className="alt-item-sub">{i.nameLocal ?? i.nameEn}</div>
                        </div>
                      </div>
                      <ItemDetail item={i} />
                      <a
                        className="tag" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 6 }}
                        href={mapsPlaceUrl(i)} target="_blank" rel="noreferrer"
                      >
                        지도에서 보기 ↗
                      </a>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * 어디에 숙소를 잡을 것인가.
 *
 * 앱은 어느 도시에서 잘지는 정해 주면서 어느 동네에 잡을지는 말하지 않았다.
 * 이동 시간을 "숙소 09:00 출발" 로 계산하면서 정작 숙소 위치를 모르는
 * 상태였고, 사용자는 4단계에서 이것을 찾다가 없어서 물었다.
 *
 * 동네 이름을 지어내지는 않는다 - 데이터에 없다. 대신 확실히 아는 것을
 * 말한다: 이번 여행에서 실제로 가기로 한 곳들의 한가운데가 어디인지,
 * 거기서 걸어 다닐 수 있는 일정이 몇 곳인지, 그리고 그 좌표로 바로
 * 검색되는 예약 링크.
 */
function LodgingPanel({ plan, cities }: { plan: Plan; cities: City[] }) {
  const picks = useMemo(() => lodgingPlan(plan.days, cities), [plan, cities]);
  if (!picks.length) return null;

  return (
    <details className="lodge" open>
      <summary>
        <b>🛏 숙소 {picks.length}곳</b>{' '}
        {picks.map((p) => `${p.city.name} ${p.nights}박`).join(' · ')}
      </summary>
      <div className="lodge-body">
        <p className="help" style={{ margin: '0 0 10px' }}>
          <b>고르신 일정의 한가운데</b>를 기준점으로 잡았습니다. 동네 이름을 지어내는 대신
          좌표를 드리니, 링크의 지도 보기로 그 근처만 걸러 보세요.
        </p>
        {picks.map((p) => {
          const wide = p.total > 0 && p.within / p.total < 0.5;
          return (
            <div className="lodge-row" key={p.city.slug + p.checkIn}>
              <div className="lodge-head">
                <b>{p.city.name}</b>
                <span className="lodge-when">
                  {p.checkIn} → {p.checkOut} · {p.nights}박
                </span>
              </div>
              {p.total > 0 && (
                <div className="lodge-where">
                  기준점: <b>{p.anchor.name}</b> 근처
                  {' · '}
                  걸어서 닿는 일정 {p.within}/{p.total}곳
                  {p.spreadKm > 0 && ` · 가장 먼 일정 ${p.spreadKm}km`}
                </div>
              )}
              {wide && (
                <div className="lodge-warn">
                  일정이 넓게 퍼져 있습니다. 어디에 잡아도 절반은 대중교통을 타야 하니,
                  숙소보다 <b>역·정류장이 가까운지</b>를 먼저 보세요.
                </div>
              )}
              <div className="lodge-links">
                {lodgingLinks(p).map((l) => (
                  <a key={l.label} href={l.url} target="_blank" rel="noreferrer" title={l.note}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * 렌터카를 따로 보는 자리.
 *
 * 교통 엔진은 문앞~문앞 시간으로 고르므로, 기다리지 않는 렌터카가 거의
 * 항상 이긴다. 그런데 그 차이는 대개 몇십 분이고 값은 서너 배다. 게다가
 * 편도 반납료와 세워 두는 날의 대여료는 구간별 비교에 아예 안 잡힌다.
 *
 * 그래서 '차를 빌리면 여행 전체가 어떻게 되는가' 를 한 번에 보여 주고,
 * 구간마다 대안과 그 대안을 골랐을 때 일정이 어떻게 달라지는지를 붙인다.
 * 고르는 것은 사람이 한다 — 차가 필요한 이유는 앱이 모른다.
 */
function CarPanel({
  itinerary, plan, onMode,
}: {
  itinerary: Itinerary;
  plan: Plan;
  onMode: (from: string, to: string, mode: string) => void;
}) {
  const car = useMemo(
    () => carPlanOf(itinerary.hops, itinerary.stops),
    [itinerary],
  );
  if (!car) return null;

  const notes = carNotes(car);
  /** 이 구간이 도착하는 날 — 대안으로 바꾸면 이 날 일정이 밀린다. */
  const legOf = (from: string, to: string) => {
    for (const d of plan.days) {
      const t = d.travels.find((x) => x.kind === 'move' && x.from === from && x.to === to);
      if (t) return { day: d, travel: t };
    }
    return null;
  };

  return (
    <details className="carbox" open>
      <summary>
        <b>🚗 렌터카 {car.legs.length}구간</b>
        {car.oneWay
          ? ` · ${car.pickUp.name}에서 빌려 ${car.dropOff.name}에서 반납`
          : ` · ${car.pickUp.name}에서 빌려 그대로 반납`}
        {car.heldDays > car.legs.length && ` · ${car.heldDays}일 대여`}
      </summary>
      <div className="carbox-body">
        <p className="help" style={{ margin: '0 0 10px' }}>
          이동 시간만 보면 렌터카가 가장 빠릅니다. 다만 아래 비용은 구간별 비교에
          잡히지 않으니 함께 보고 정하세요.
        </p>

        <div className="car-sums">
          <div className="car-sum">
            <div className="v">€{car.legCostEur}</div>
            <div className="k">구간 연료·통행료</div>
          </div>
          {car.idleDays > 0 && (
            <div className="car-sum">
              <div className="v">€{car.parkingEur}</div>
              <div className="k">세워 두는 {car.idleDays}일 주차</div>
            </div>
          )}
          {car.oneWay && car.fee && (
            <div className="car-sum is-warn">
              <div className="v">€{car.fee.lo}~{car.fee.hi}</div>
              <div className="k">편도 반납료</div>
            </div>
          )}
        </div>

        <ul className="car-notes">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>

        <h4 className="car-h">구간마다 대안</h4>
        {car.legs.map((leg) => {
          const hit = legOf(leg.from.slug, leg.to.slug);
          return (
            <div className="car-leg" key={`${leg.from.slug}>${leg.to.slug}`}>
              <div className="car-leg-head">
                <b>{leg.from.name} → {leg.to.name}</b>
                <span>🚗 {fmtDur(leg.car.totalMin)} · €{leg.car.costEur}</span>
              </div>
              {leg.alt ? (
                <>
                  <div className="car-alt">
                    <span className="car-alt-label">
                      {leg.alt.label} {fmtDur(leg.alt.totalMin)} · €{leg.alt.costEur}
                    </span>
                    <span className={leg.slowerMin > 0 ? 'car-delta is-slow' : 'car-delta'}>
                      {leg.slowerMin > 0
                        ? `${fmtDur(leg.slowerMin)} 더 걸리고`
                        : `${fmtDur(-leg.slowerMin)} 빠르고`}
                      {' '}
                      {leg.savesEur > 0 ? `€${leg.savesEur} 아낍니다` : `€${-leg.savesEur} 더 듭니다`}
                    </span>
                    <button
                      type="button" className="car-take"
                      onClick={() => onMode(leg.from.slug, leg.to.slug, leg.alt!.mode)}
                    >
                      이걸로 바꾸기
                    </button>
                  </div>
                  <ScheduleImpact leg={hit} slowerMin={leg.slowerMin} />
                </>
              ) : (
                <p className="help" style={{ margin: '6px 0 0' }}>
                  이 구간은 렌터카 말고 쓸 수 있는 수단이 없습니다.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * 대안으로 바꾸면 그날 일정이 어떻게 되는가.
 *
 * "40분 더 걸립니다" 만으로는 감이 안 온다. 실제로 알고 싶은 것은
 * '그래서 그날 뭘 못 보게 되느냐' 다. 도착이 늦어지면 그 시각 이전에
 * 잡혀 있던 일정부터 밀리므로, 그것을 이름으로 짚어 준다.
 */
function ScheduleImpact({ leg, slowerMin }: {
  leg: { day: PlanDay; travel: PlanTravel } | null; slowerMin: number;
}) {
  if (!leg) return null;
  const { day, travel } = leg;
  if (slowerMin <= 0) {
    return <p className="car-impact">그날 도착이 더 빨라지므로 일정은 그대로거나 늘어납니다.</p>;
  }
  const newArrive = travel.arriveAt + slowerMin;
  // 늦어진 도착 시각(+짐 푸는 30분) 이전에 시작하기로 돼 있던 일정이 밀린다.
  const pushed = day.entries.filter((e) => e.startMin < newArrive + 30);
  return (
    <p className="car-impact">
      {day.date} 도착이 {fmtHm(travel.arriveAt)} → <b>{fmtHm(newArrive)}</b>.
      {pushed.length === 0
        ? ' 그날 일정은 그대로 들어갑니다.'
        : ` 그날 앞쪽 ${pushed.length}곳(${pushed.map((e) => e.item.name).join(', ')})이 밀립니다.`}
    </p>
  );
}

/**
 * 그날 실제로 타는 구간 — 짐을 옮기는 이동이든, 근교 왕복이든.
 *
 * 무엇을 타고, 몇 시에 나서서, 몇 시에 닿는지를 적는다. 예전에는 이 구간이
 * 아예 없어서 오후 1시에 도착하는 도시에 오전 일정이 들어가 있었다.
 *
 * 근교 왕복도 여기로 들어온다. 예전에는 '🚄 고속열차 편도 1시간 28분 · 왕복'
 * 한 줄이 전부였다 — 몇 시 편인지도, 얼마인지도, 다른 수단이 있는지도 없었다.
 * 실제로 타는 시간은 근교 쪽이 더 긴 날도 있는데 안내는 반의 반이었다.
 * 짐을 옮기느냐 아니냐가 다를 뿐, 사람이 알아야 할 것은 같다.
 *
 * 대안 수단을 함께 놓고 그 자리에서 바꾸게 한다. 바꾸면 도착 시각이 달라져
 * 그날 일정이 다시 짜인다 — 비행기로 바꾸면 오후가 통째로 사라지는 것이
 * 눈에 보여야 한다.
 */
function TravelBlock({
  travel, cityName, onMode, onTiming,
}: {
  travel: PlanTravel;
  cityName: (slug: string) => string;
  onMode: (from: string, to: string, mode: string) => void;
  onTiming: (from: string, to: string, t: MoveTiming) => void;
}) {
  const c = travel.chosen;
  const isTrip = travel.kind === 'daytrip';
  const now = travel.timing ?? 'morning';
  /*
   * 머리에 크게 쓰는 숫자는 **타는 시간**이다.
   *
   * 한때 근교에는 '나선 시각 ~ 돌아온 시각' 을 썼는데, 그건 톨레도에서 논
   * 시간까지 더한 11시간 24분이었다. 바로 옆 이동 블록의 3시간 25분은 순수
   * 이동 시간이라, 같은 자리의 같은 크기 숫자가 다른 뜻이었다. 근교는
   * 왕복이므로 편도의 두 배를 쓴다.
   */
  const total = isTrip ? c.totalMin * 2 : travel.arriveAt - travel.leaveAt;
  /** 근교에 나가 있는 전체 시간. 타는 시간과는 다른 뜻이라 작게 따로 적는다. */
  const away = isTrip && travel.back ? travel.back.arriveAt - travel.leaveAt : null;
  return (
    <div className={`travel-block${isTrip ? ' is-daytrip' : ''}`}>
      <div className="travel-head">
        <span className="travel-icon">{c.icon}</span>
        <div>
          <div className="travel-route">
            {cityName(travel.from)} → {cityName(travel.to)}
            {isTrip && <> → {cityName(travel.from)} <span className="travel-tag">왕복</span></>}
          </div>
          <div className="travel-when">
            {isTrip ? (
              <>
                가는 편 {fmtHm(travel.leaveAt)} 출발 · {fmtHm(travel.arriveAt)} 도착
                {travel.back
                  ? ` · 오는 편 ${fmtHm(travel.back.leaveAt)} 출발 · ${fmtHm(travel.back.arriveAt)} 도착`
                  : ` · 오는 편은 저녁 일정에 맞춰 ${fmtDur(c.totalMin)}`}
              </>
            ) : (
              <>
                {fmtHm(travel.leaveAt)} 숙소 출발 · {fmtHm(travel.departAt)} 탑승 · {fmtHm(travel.arriveAt)} 도착
              </>
            )}
          </div>
        </div>
        <div className="travel-total">
          {fmtDur(total)}
          {isTrip && <span className="travel-total-sub">타는 시간</span>}
          {away !== null && <span className="travel-total-sub">나가 있는 시간 {fmtDur(away)}</span>}
        </div>
      </div>
      <div className="travel-meta">
        {c.label}
        {c.transfers > 0 && ` · 환승 ${c.transfers}회`}
        {travel.waitMin > 0 && ` · ${c.mode === 'flight' ? '공항' : c.mode === 'bus' ? '터미널' : '역'}에서 대기 ${travel.waitMin}분`}
        {c.costEur > 0 && (isTrip ? ` · 왕복 약 €${c.costEur * 2}` : ` · 약 €${c.costEur}`)}
        {c.estimated ? ' · 시간은 추정치입니다' : ' · Renfe 실제 시간표'}
      </div>
      {c.note && <div className="travel-note">{c.note}</div>}
      {isTrip && (
        <p className="travel-note">
          짐은 {cityName(travel.from)}에 두고 다녀옵니다. 저녁·밤 일정과 잠자리는 {cityName(travel.from)}입니다.
        </p>
      )}

      {/*
        하루의 어디에서 옮기는가.

        예전에는 언제나 아침 첫 편이었다. 선택지가 아예 없어서, 오전에 이
        도시를 더 보고 오후에 옮기는 것이 불가능했다. 기본은 규칙이 고르고
        (저녁식사는 그날 자는 도시에서 — 그 제약이 문턱값을 정한다),
        여기서 바꿀 수 있다.
      */}
      {!isTrip && (
      <div className="timing-row" role="group" aria-label="이동 시점">
        <span className="timing-label">언제 옮길까요</span>
        <div className="timing-btns">
          {MOVE_TIMINGS.map((t) => {
            const why = timingBlocked(t, c.totalMin);
            return (
              <button
                key={t} type="button"
                className={`timing-btn${t === now ? ' is-on' : ''}`}
                aria-pressed={t === now}
                disabled={!!why}
                title={why ?? undefined}
                onClick={() => onTiming(travel.from, travel.to, t)}
              >
                {MOVE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>
      )}
      {!isTrip && <p className="timing-why">{whyTiming(now, c.totalMin, cityName(travel.to))}</p>}

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
                    {!o.estimated && ' · 실제 시간표'}
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
/*
 * 기본으로 펼쳐 둔다.
 * 접어 두었더니 "숙박은 어디서 정하느냐" 는 질문이 나왔다. 숙박과 도시 순서는
 * 계획 전체를 좌우하는데, 찾을 수 없으면 없는 기능이나 마찬가지다.
 */
function ItineraryBar({
  itinerary, cities, plan, onLodging, onMoveCity, onDropCity,
}: {
  itinerary: Itinerary;
  cities: City[];
  /** 실제로 짜인 계획. 박수는 여기서 센다. */
  plan: Plan;
  onLodging: (city: string, how: 'sleep' | 'daytrip') => void;
  onMoveCity: (city: string, dir: -1 | 1) => void;
  onDropCity: (city: string) => void;
}) {
  const name = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;

  /*
   * 박수는 완성된 계획에서 센다.
   *
   * 여정 엔진의 stop.nights 는 '담은 아이템으로 잡아 둔 날' 이고, 플래너가
   * 남는 날을 도시마다 나눠 주면서 그 값이 달라진다. 두 값을 서로 다른
   * 자리에 띄우면 같은 화면에서 '빌바오 1박' 과 '빌바오 3박' 이 함께
   * 보인다 - 실제로 그렇게 나왔다. 사람이 실제로 자는 날을 쓴다.
   */
  /** 근교 왕복 합계. 짐은 안 옮기지만 실제로 타는 시간이다. */
  const dayTripMin = itinerary.stops.reduce((a, s) => a + (s.sleep ? 0 : s.dayTripMin), 0);

  const nightsOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of plan.days) {
      if (!d.sleepAt) continue;
      m.set(d.sleepAt, (m.get(d.sleepAt) ?? 0) + 1);
    }
    return m;
  }, [plan]);
  return (
    <details className="itin" open>
      <summary>
        <b>동선 · 숙박 바꾸기</b>{' '}
        {itinerary.stops.map((s) => s.city.name).join(' → ')}
        {/*
          예전에는 거점 사이 이동만 더해 '이동 합계 0분' 이라고 적었다.
          마드리드에 계속 묵으며 톨레도와 세고비아를 다녀오는 계획인데,
          실제로는 왕복 다섯 시간을 탄다. 짐을 옮기는 이동과 근교 왕복은
          성격이 다르니 나눠서 적되, 없는 셈 치지는 않는다.
        */}
        {itinerary.transitMin > 0 && ` · 짐 옮기는 이동 ${fmtDur(itinerary.transitMin)}`}
        {dayTripMin > 0 && ` · 근교 왕복 ${fmtDur(dayTripMin)}`}
        {itinerary.transitMin === 0 && dayTripMin === 0 && ' · 도시 간 이동 없음'}
      </summary>
      <div className="itin-body">
        {/*
          '여기서 자기' 와 '당일치기' 가 무슨 뜻인지 물어보는 일이 반복됐다.
          이것은 '이 도시가 좋은가' 가 아니라 '짐을 옮길 것인가' 의 선택이다.
          그 한 문장이 없으면 무엇을 고르는지 알 수가 없다.
        */}
        <div className="itin-legend">
          <p><b>여기서 자기</b> — 짐을 이 도시로 옮기고 밤을 보냅니다. 옮기는 데 반나절이 듭니다.</p>
          <p><b>당일치기</b> — 짐은 거점에 둔 채 아침에 나갔다 <b>저녁 전에 돌아옵니다</b>. 저녁·밤은 거점에서 보냅니다.</p>
        </div>
        <p className="help" style={{ margin: '0 0 10px' }}>
          거점을 먼저 고르고 편도 2시간 안의 도시를 당일치기로 붙였습니다.
          거점은 <b>근교를 여럿 품는가 · 저녁에 할 것이 있는가 · 며칠 묵을 만한가 ·
          다음 목적지로 나가기 쉬운가 · 볼 것이 얼마나 있는가</b>를 가중해 고릅니다.
          <b>화살표로 순서를 바꾸면 교통편을 다시 찾습니다.</b>
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
              {s.sleep
                ? `🛏 ${nightsOf.get(s.city.slug) ?? s.nights}박`
                : `${name(s.base ?? '')}에서 당일치기 · 왕복 ${fmtDur(s.dayTripMin)}`}
            </span>
            {/*
              여기서도 도시를 뺄 수 있어야 한다. 계획을 다 보고 나서야
              '이 도시는 빼자' 가 되는 것이 보통인데, 그러려면 3단계까지
              되돌아가야 했다. 날이 모자랄 때만 빼기 버튼이 나왔다.
            */}
            <button
              type="button" className="itin-drop"
              aria-label={`${s.city.name} 여행에서 빼기`}
              title={`${s.city.name} 빼기`}
              disabled={itinerary.stops.length <= 1}
              onClick={() => {
                if (confirm(`${s.city.name}${josa(s.city.name, '을를')} 이번 여행에서 뺄까요? 그 도시의 일정도 함께 사라집니다.`)) {
                  onDropCity(s.city.slug);
                }
              }}
            >빼기</button>
            <button
              type="button" className="itin-swap"
              disabled={s.sleep && itinerary.stops.filter((x) => x.sleep).length <= 1}
              title={s.sleep
                ? `짐을 옮기지 않고 가까운 거점에서 다녀옵니다`
                : `짐을 ${s.city.name}으로 옮기고 여기서 잡니다`}
              onClick={() => onLodging(s.city.slug, s.sleep ? 'daytrip' : 'sleep')}
            >
              {s.sleep ? '짐 안 옮기기' : '짐 옮기기'}
            </button>
            {s.why && <div className="itin-why">{s.why}</div>}
            {!s.sleep && s.dayTripMin > 300 && (
              <div className="itin-warn">
                왕복 {fmtDur(s.dayTripMin)}입니다. 하루의 절반 이상이 이동에 들어갑니다.
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
