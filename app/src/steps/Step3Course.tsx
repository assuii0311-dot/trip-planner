import { useMemo } from 'react';
import type { City, CourseId, Item, Preferences, Priorities, ThemeId } from '../types';
import type { Itinerary } from '../lib/itinerary';
import { THEMES } from '../lib/themes';
import { rankItems } from '../lib/scoring';
import { coursesFor, itemsForDays } from '../lib/course';
import { estimateDays } from '../lib/capacity';
import { recommend } from '../lib/recommend';
import { mapsPlaceUrl } from '../lib/deeplinks';
import { ItemRow } from '../components/ItemRow';
import { ItemPhoto } from '../components/ItemPhoto';
import { withJosa } from '../lib/korean';

/**
 * 3단계 — 도시별 추천 코스를 고르고 손본다.
 *
 * 예전에는 아이템을 보여 주는 단계(3)와 고르는 단계(4)가 따로 있었다.
 * 스페인을 모르는 사람에게 2천 개 목록에서 고르라는 것이었고, 실제로
 * 고를 수가 없었다. 그래서 두 단계를 합치고 순서를 뒤집었다 —
 * "이 도시는 보통 이렇게 돕니다" 를 먼저 주고, 거기서 빼고 더한다.
 */
export default function Step3Course({
  items, cities, itinerary, prefs, priorities, courses, days, ui,
  onSet, onBulk, onCourse, onDays, onDropCity, onUi,
}: {
  items: Item[];
  cities: City[];
  /** 동선 엔진이 정한 방문 순서와 숙박. 도시별 코스 분량을 여기에 맞춘다. */
  itinerary: Itinerary | null;
  prefs: Preferences;
  priorities: Priorities;
  courses: Record<string, CourseId>;
  days: number;
  ui: { openCity?: string | null; openTheme?: ThemeId | null; onlyPicked?: boolean };
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  onBulk: (next: Priorities) => void;
  onCourse: (city: string, course: CourseId, items: Item[]) => void;
  /** 이 도시에 며칠을 쓸지 정하면 그 일수에 맞는 아이템으로 갈아 끼운다. */
  onDays: (city: string, items: Item[]) => void;
  /** 도시를 여행에서 뺀다. 일수가 넘칠 때 가장 크게 듣는 손잡이다. */
  onDropCity: (city: string) => void;
  onUi: (next: { openCity?: string | null; openTheme?: ThemeId | null; onlyPicked?: boolean }) => void;
}) {
  /** 방문 순서대로. 여기에 배정된 밤 수가 코스 분량을 정한다. */
  const stops = useMemo(() => (itinerary?.stops ?? []).map((s) => ({
    city: s.city,
    nights: s.sleep ? s.nights : 1,
    isDayTrip: !s.sleep,
  })), [itinerary]);

  const openCity = ui.openCity === undefined ? (stops[0]?.city.slug ?? null) : ui.openCity;
  const onlyPicked = ui.onlyPicked ?? false;

  const itemsOf = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) {
      const list = m.get(i.city) ?? [];
      list.push(i);
      m.set(i.city, list);
    }
    return m;
  }, [items]);

  const chosen = useMemo(
    () => items.filter((i) => (priorities[i.id] ?? 0) > 0),
    [items, priorities],
  );
  const needDays = estimateDays(chosen, prefs);
  const picks = useMemo(() => recommend(items, cities, prefs), [items, cities, prefs]);

  return (
    <>
      <h2>도시마다 코스를 골라주세요</h2>
      <p className="lede">
        코스를 하나 고른 뒤 빼고 더하시면 됩니다.
      </p>

      <div className={needDays > days ? 'notice' : 'card'} style={{ padding: 12, marginBottom: 18 }}>
        <b>{chosen.length}곳 선택 · 예상 {needDays}일</b>
        {' '}
        {needDays === 0
          ? '— 아직 아무것도 담기지 않았습니다.'
          : needDays > days
            ? `— 여행은 ${days}일입니다. 이대로면 ${Math.round((needDays - days) * 10) / 10}일치가 일정에서 빠집니다.`
            : `— 여행 ${days}일 안에 들어갑니다.`}
      </div>

      {stops.map(({ city, nights, isDayTrip }) => {
        const cityItems = itemsOf.get(city.slug) ?? [];
        if (!cityItems.length) return null;
        const isOpen = openCity === city.slug;
        const picked = cityItems.filter((i) => (priorities[i.id] ?? 0) > 0);
        return (
          <div className="theme-group" key={city.slug}>
            {/*
              헤더의 '2박'은 숙박 배정이고 패널 안의 '1.1일'은 담은 일정의 분량이다.
              예전에는 둘 다 '일'로 적혀 나란히 다른 숫자를 보여 줬다.
            */}
            <div className="city-head-row">
              <button
                type="button" className="theme-head"
                aria-expanded={isOpen}
                onClick={() => onUi({ openCity: isOpen ? null : city.slug })}
              >
                <span style={{ fontWeight: 700 }}>{city.name}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {isDayTrip ? '당일치기' : `${nights}박`}
                </span>
                <span className="count">
                  {picked.length > 0 && <span className="picked">{picked.length}곳 </span>}
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {/*
                도시를 빼는 것은 일수를 조율하는 가장 큰 손잡이인데, 예전에는
                4단계에서 날이 모자랄 때만 할 수 있었다. 일수를 실제로 맞추는
                자리는 여기다.
              */}
              <button
                type="button" className="city-drop"
                aria-label={`${city.name} 여행에서 빼기`}
                onClick={() => {
                  if (confirm(`${withJosa(city.name, '을를')} 여행에서 뺄까요? 이 도시에서 담은 것도 함께 사라집니다.`)) {
                    onDropCity(city.slug);
                  }
                }}
              >빼기</button>
            </div>
            {isOpen && (
              <CityPanel
                city={city} cityItems={cityItems} nights={nights} prefs={prefs}
                priorities={priorities} course={courses[city.slug]} onlyPicked={onlyPicked}
                openTheme={ui.openTheme === undefined ? THEMES[0].id : ui.openTheme}
                onSet={onSet} onBulk={onBulk} onCourse={onCourse} onUi={onUi}
                onDays={onDays} cities={cities}
              />
            )}
          </div>
        );
      })}

      {picks.length > 0 && (
        <section className="recommend">
          <h3>참고 — 이 여행의 대표 장소</h3>
          <p className="basis">
            <strong>위키백과 언어판 수</strong>로 잰 인지도에 2단계 취향을 더해 뽑았습니다.
            코스에 빠진 곳이 있는지 확인하는 데 쓰세요.
          </p>
          <div className="pick-grid">
            {picks.map(({ item, city, reason }) => (
              <a
                key={item.id} className="pick"
                href={mapsPlaceUrl(item, city)} target="_blank" rel="noreferrer"
              >
                <ItemPhoto item={item} size="wide" />
                <div className="pick-body">
                  <div className="pick-city">{city?.name}</div>
                  <div className="pick-name">{item.name}</div>
                  <div className="pick-why">{reason}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** 한 도시의 코스 카드 세 장과, 그 아래 전체 아이템 목록. */
function CityPanel({
  city, cityItems, nights, prefs, priorities, course, onlyPicked, openTheme,
  cities, onSet, onBulk, onCourse, onDays, onUi,
}: {
  city: City;
  cityItems: Item[];
  nights: number;
  prefs: Preferences;
  priorities: Priorities;
  course: CourseId | undefined;
  onlyPicked: boolean;
  openTheme: ThemeId | null;
  cities: City[];
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  onBulk: (next: Priorities) => void;
  onCourse: (city: string, course: CourseId, items: Item[]) => void;
  onDays: (city: string, items: Item[]) => void;
  onUi: (next: { openTheme?: ThemeId | null; onlyPicked?: boolean }) => void;
}) {
  const courses = useMemo(
    () => coursesFor(city, cityItems, prefs, nights),
    [city, cityItems, prefs, nights],
  );
  const pickedIds = new Set(cityItems.filter((i) => (priorities[i.id] ?? 0) > 0).map((i) => i.id));
  const pickedDays = estimateDays(cityItems.filter((i) => pickedIds.has(i.id)), prefs);
  /*
   * 스테퍼는 정수 일수를 다룬다.
   *
   * 예전에는 pickedDays(1.1 같은 소수)에 Math.round 를 걸어 ±1 을 했는데,
   * 1.1 에서 '−' 를 누르면 round(1.1)-1 = 0 → 하한 1 → 같은 1일치가 다시
   * 담겨 화면이 그대로였다. 눌러도 아무 일이 없는 버튼이었다.
   */
  // 담은 것이 없으면 0 이다. 그래야 '＋' 가 2일이 아니라 1일부터 시작한다.
  const targetDays = pickedIds.size === 0 ? 0 : Math.max(1, Math.round(pickedDays));
  /** 이 도시에 있는 것을 다 담아도 이만큼이다. 그 이상은 늘릴 수 없다. */
  const maxDays = Math.max(1, Math.ceil(estimateDays(cityItems, prefs)));

  const byTheme = useMemo(() => {
    const map = new Map<ThemeId, Item[]>();
    for (const { item } of rankItems(cityItems, prefs, priorities)) {
      const list = map.get(item.theme) ?? [];
      list.push(item);
      map.set(item.theme, list);
    }
    return map;
  }, [cityItems, prefs, priorities]);

  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);

  return (
    <div className="city-panel">
      {courses.length > 0 && (
        <div className="course-grid">
          {courses.map((c) => {
            const active = course === c.id;
            return (
              <button
                key={c.id} type="button"
                className={`course${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onCourse(city.slug, c.id, c.items)}
              >
                <div className="course-head">
                  <span className="course-title">{c.title}</span>
                  {active && <span className="course-on">선택됨</span>}
                </div>
                <div className="course-meta">{c.items.length}곳 · 약 {c.days}일</div>
                <div className="course-mix">
                  {c.mix.slice(0, 3).map((m) => (
                    <span key={m.theme} className="tag">{m.label} {m.count}</span>
                  ))}
                </div>
                <div className="course-basis">{c.basis}</div>
                <div className="course-thumbs">
                  {c.items.filter((i) => i.photo).slice(0, 4).map((i) => (
                    <ItemPhoto key={i.id} item={i} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/*
        일수 ↔ 아이템은 양방향이다.
        아이템을 담으면 일수가 나오고, 일수를 정하면 그 일수에 맞는 아이템이 담긴다.
        "이 도시는 이틀만" 이 먼저 정해지는 경우가 많은데, 이틀치를 직접 세어 가며
        담는 것은 사람이 할 일이 아니다.
      */}
      <div className="days-row">
        <span className="days-label">{city.name}에 며칠</span>
        <div className="days-step" role="group" aria-label={`${city.name} 일수`}>
          <button
            type="button" aria-label="하루 줄이기" disabled={targetDays <= 1}
            onClick={() => onDays(city.slug, itemsForDays(city, cityItems, prefs, targetDays - 1, course))}
          >−</button>
          <span className="days-value">{pickedIds.size === 0 ? '—' : `${targetDays}일`}</span>
          <button
            type="button" aria-label="하루 늘리기" disabled={targetDays >= maxDays}
            onClick={() => onDays(city.slug, itemsForDays(city, cityItems, prefs, targetDays + 1, course))}
          >＋</button>
        </div>
        <span className="days-hint">
          {pickedIds.size}곳 담김{pickedIds.size > 0 && ` · 실제 ${pickedDays}일치`}
        </span>
      </div>

      <div className="toolbar" style={{ marginTop: 12, marginBottom: 12 }}>
        <button type="button" onClick={() => onUi({ onlyPicked: !onlyPicked })}>
          {onlyPicked ? '전체 보기' : '담은 것만 보기'}
        </button>
        {pickedIds.size > 0 && (
          <button
            type="button"
            onClick={() => {
              const next = { ...priorities };
              for (const id of pickedIds) delete next[id];
              onBulk(next);
            }}
          >
            {city.name} 비우기
          </button>
        )}
      </div>

      <p className="help" style={{ margin: '0 0 10px' }}>
        {course
          ? '코스에 담긴 곳은 체크되어 있습니다. 빼려면 체크를 풀고, 더하려면 아래에서 체크하세요.'
          : '코스를 고르지 않고 아래에서 직접 담으셔도 됩니다.'}
      </p>

      {THEMES.map((t) => {
        const all = byTheme.get(t.id) ?? [];
        const list = onlyPicked ? all.filter((i) => pickedIds.has(i.id)) : all;
        if (!list.length) return null;
        const isOpen = openTheme === t.id;
        const chosen = all.filter((i) => pickedIds.has(i.id)).length;
        return (
          <div className="theme-group" key={t.id}>
            <button
              type="button" className="theme-head"
              aria-expanded={isOpen}
              onClick={() => onUi({ openTheme: isOpen ? null : t.id })}
            >
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontWeight: 700 }}>{t.label}</span>
              <span className="count">
                {chosen > 0 && <span className="picked">{chosen} / </span>}
                {all.length}개 {isOpen ? '▴' : '▾'}
              </span>
            </button>
            {isOpen && (
              <div className="card" style={{ marginTop: 8 }}>
                {list.map((item) => (
                  <ItemRow
                    key={item.id} item={item} city={cityOf(item.city)}
                    priorities={priorities} onSet={onSet} selectable
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
