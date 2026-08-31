import { useMemo } from 'react';
import type { City, CourseId, Item, Preferences, Priorities, ThemeId } from '../types';
import type { Itinerary } from '../lib/itinerary';
import { THEMES, THEME_ICON } from '../lib/themes';
import { rankItems } from '../lib/scoring';
import { cityWorthDays, coursesFor, defaultCityDays, foodPicksFor, itemsForDays, mustSeeFor } from '../lib/course';
import { estimateDays, isMeal } from '../lib/capacity';
import { recommend } from '../lib/recommend';
import { mapsPlaceUrl } from '../lib/deeplinks';
import { ItemRow } from '../components/ItemRow';
import { ItemPhoto } from '../components/ItemPhoto';
import { josa } from '../lib/korean';

/**
 * 3단계 — 도시별 추천 코스를 고르고 손본다.
 *
 * 예전에는 아이템을 보여 주는 단계(3)와 고르는 단계(4)가 따로 있었다.
 * 스페인을 모르는 사람에게 2천 개 목록에서 고르라는 것이었고, 실제로
 * 고를 수가 없었다. 그래서 두 단계를 합치고 순서를 뒤집었다 —
 * "이 도시는 보통 이렇게 돕니다" 를 먼저 주고, 거기서 빼고 더한다.
 */
export default function Step3Course({
  items, cities, itinerary, prefs, priorities, courses, cityDays, days, ui,
  onSet, onBulk, onCourse, onDays, onDropCity, onUi,
}: {
  items: Item[];
  cities: City[];
  /** 동선 엔진이 정한 방문 순서와 숙박. 도시별 코스 분량을 여기에 맞춘다. */
  itinerary: Itinerary | null;
  prefs: Preferences;
  priorities: Priorities;
  courses: Record<string, CourseId>;
  /** 도시 slug → 사용자가 정한 일수. 없으면 도시 권장 일수를 쓴다. */
  cityDays: Record<string, number>;
  days: number;
  ui: { openCity?: string | null; openTheme?: ThemeId | null; onlyPicked?: boolean };
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  onBulk: (next: Priorities) => void;
  onCourse: (city: string, course: CourseId, items: Item[]) => void;
  /** 이 도시에 며칠을 쓸지 정하면 그 일수에 맞는 아이템으로 갈아 끼운다. */
  onDays: (city: string, days: number, items: Item[]) => void;
  /** 이 도시를 여행에서 뺀다. */
  onDropCity: (city: string) => void;
  onUi: (next: { openCity?: string | null; openTheme?: ThemeId | null; onlyPicked?: boolean }) => void;
}) {
  /**
   * 방문 순서대로. 도시마다 '며칠 쓸 것인가' 가 코스 분량을 정한다.
   *
   * 그 일수는 사용자가 정한 값, 없으면 도시 데이터의 권장 일수다.
   * 지금 담은 아이템에서 되짚지 않는 것이 중요하다 - 되짚으면 코스를
   * 고를 때마다 일수가 늘고, 늘어난 일수로 코스가 다시 커지는 고리가
   * 생긴다. 실제로 그라나다가 2일 → 3일 → 4일 → 5일 로 불어났다.
   */
  const stops = useMemo(() => (itinerary?.stops ?? []).map((s) => {
    const mine = items.filter((i) => i.city === s.city.slug && (priorities[i.id] ?? 0) > 0);
    /*
     * 조절기에 보일 일수.
     *
     * 담은 것에서 되짚는다. 예전에는 이렇게 하면 '코스를 고르면 일수가 늘고,
     * 늘어난 일수로 코스가 다시 커지는' 고리가 생겨 그라나다가 2→3→4→5일로
     * 불어났다. 지금은 코스 분량을 순위 등급이 정하고 일수는 그 결과를
     * 읽기만 하므로 고리가 없다. 그래서 다시 담은 것 기준으로 되돌린다 —
     * 위에 '4일치 코스' 를 담아 놓고 아래 조절기가 '2일' 이라고 하면
     * 그것대로 두 값이 어긋난다.
     */
    const picked = mine.length ? Math.max(0.5, Math.round(estimateDays(mine, prefs) * 2) / 2) : null;
    return {
      city: s.city,
      wantDays: cityDays[s.city.slug] ?? picked ?? defaultCityDays(s.city),
      isDayTrip: !s.sleep,
    };
  }), [itinerary, cityDays, items, priorities, prefs]);

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
  const meals = chosen.filter(isMeal).length;
  const picks = useMemo(() => recommend(items, cities, prefs), [items, cities, prefs]);

  return (
    <>
      <h2>도시마다 코스를 골라주세요</h2>
      <p className="lede">
        코스를 하나 고른 뒤 빼고 더하시면 됩니다.
      </p>

      <div className={needDays > days ? 'notice' : 'card'} style={{ padding: 12, marginBottom: 18 }}>
        <b>
          {chosen.length - meals}곳 선택 · 예상 {needDays}일
          {meals > 0 && <span className="sum-meal"> + 미식 {meals}곳</span>}
        </b>
        {' '}
        {needDays === 0
          ? '— 아직 아무것도 담기지 않았습니다.'
          : needDays > days
            ? `— 여행은 ${days}일입니다. 이대로면 ${Math.round((needDays - days) * 10) / 10}일치가 일정에서 빠집니다.`
            : `— 여행 ${days}일 안에 들어갑니다.`}
        {meals > 0 && (
          <div className="help" style={{ marginTop: 6 }}>
            식사는 일수에 세지 않습니다. 점심·저녁 자리에 배정될 뿐이라 일정을 늘리지 않습니다.
          </div>
        )}
      </div>

      {stops.map(({ city, wantDays, isDayTrip }) => {
        const cityItems = itemsOf.get(city.slug) ?? [];
        if (!cityItems.length) return null;
        const isOpen = openCity === city.slug;
        const picked = cityItems.filter((i) => (priorities[i.id] ?? 0) > 0);
        return (
          <div className="theme-group" key={city.slug}>
            <div className="city-head">
              <button
                type="button" className="theme-head"
                aria-expanded={isOpen}
                onClick={() => onUi({ openCity: isOpen ? null : city.slug })}
              >
                <span style={{ fontWeight: 700 }}>{city.name}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {isDayTrip ? `당일치기 ${fmtDays(wantDays)}` : fmtDays(wantDays)}
                </span>
                <span className="count">
                  {picked.length > 0 && <span className="picked">{picked.length}곳 </span>}
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {/*
                일수를 맞추는 화면에서 도시를 뺄 수 없으면, 날이 모자랄 때
                할 수 있는 일이 '아이템을 줄이기' 뿐이다. 그런데 실제로는
                도시 하나를 빼는 것이 가장 정직한 해법인 경우가 많다.
                예전에는 4단계까지 가야 뺄 수 있었다.
              */}
              <button
                type="button" className="city-drop"
                aria-label={`${city.name} 여행에서 빼기`}
                title={`${city.name} 빼기`}
                onClick={() => {
                  if (confirm(`${city.name}${josa(city.name, '을를')} 이번 여행에서 뺄까요?`
                    + (picked.length ? ` 담아 두신 ${picked.length}곳도 함께 사라집니다.` : ''))) {
                    onDropCity(city.slug);
                  }
                }}
              >빼기</button>
            </div>
            {isOpen && (
              <CityPanel
                city={city} cityItems={cityItems} wantDays={wantDays} prefs={prefs}
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

/** 0.5 는 '반나절' 로 읽는다. '0.5일' 은 사람이 쓰는 말이 아니다. */
function fmtDays(d: number): string {
  if (d === 0.5) return '반나절';
  const whole = Math.floor(d);
  return d % 1 === 0 ? `${whole}일` : `${whole}일 반`;
}

/** 한 도시의 코스 카드 세 장과, 그 아래 전체 아이템 목록. */
function CityPanel({
  city, cityItems, wantDays, prefs, priorities, course, onlyPicked, openTheme,
  cities, onSet, onBulk, onCourse, onDays, onUi,
}: {
  city: City;
  cityItems: Item[];
  /** 이 도시에 쓰기로 한 일수. 코스 분량의 기준. */
  wantDays: number;
  prefs: Preferences;
  priorities: Priorities;
  course: CourseId | undefined;
  onlyPicked: boolean;
  openTheme: ThemeId | null;
  cities: City[];
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  onBulk: (next: Priorities) => void;
  onCourse: (city: string, course: CourseId, items: Item[]) => void;
  onDays: (city: string, days: number, items: Item[]) => void;
  onUi: (next: { openTheme?: ThemeId | null; onlyPicked?: boolean }) => void;
}) {
  const courses = useMemo(
    () => coursesFor(city, cityItems, prefs, cities),
    [city, cityItems, prefs, cities],
  );
  const mustSee = useMemo(
    () => mustSeeFor(city, cityItems, prefs, cities),
    [city, cityItems, prefs, cities],
  );
  const foodPicks = useMemo(() => foodPicksFor(cityItems, prefs), [cityItems, prefs]);
  /** 이 도시에 볼 만한 것이 몇 일치인가. 여기가 ＋ 의 천장이다. */
  const worth = useMemo(
    () => cityWorthDays(city, cityItems, prefs, cities),
    [city, cityItems, prefs, cities],
  );
  /*
   * 조절기는 0.5 단위인데 값어치는 2.7일처럼 떨어진다. 그대로 비교하면
   * 2.5 < 2.7 이라 ＋ 가 열려 있는데 눌러도 담을 것이 없다. 0.5 단위로
   * 내림한 값을 천장으로 삼아, 열려 있는 버튼은 반드시 무언가를 바꾼다.
   */
  const capDays = Math.max(0.5, Math.floor(worth * 2) / 2);
  const atCeiling = wantDays >= capDays;
  const pickedIds = new Set(cityItems.filter((i) => (priorities[i.id] ?? 0) > 0).map((i) => i.id));
  const pickedDays = estimateDays(cityItems.filter((i) => pickedIds.has(i.id)), prefs);

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

  /**
   * 일수를 바꾸면 그 일수에 맞는 아이템으로 갈아 끼운다. 양방향이다.
   *
   * 0.5일 단위인 이유: 하루가 한 도시라는 법이 없다. 근교를 다녀오는 날은
   * 낮이 한 도시, 저녁이 거점이라 실제로는 반나절씩 쪼개진다. 1일 단위로만
   * 잡으면 '톨레도 반나절 + 마드리드 저녁' 같은, 실제로 가장 흔한 하루를
   * 표현할 수가 없다.
   */
  const setDays = (n: number) => {
    const next = Math.min(7, Math.max(0.5, Math.round(n * 2) / 2));
    onDays(city.slug, next, itemsForDays(city, cityItems, prefs, next, course, cities));
  };

  return (
    <div className="city-panel">
      {/*
        도시마다 성격이 다르므로 목록도 도시에서 나와야 한다. 대표 지정
        (사람이 도시별로 꼽아 둔 곳)과 전체 순위 상위권을 함께 본다 —
        재료가 다른 두 기준이 겹치는 곳이 진짜 필수다.
      */}
      {mustSee.length > 0 && (
        <div className="must-box">
          <div className="must-head">{city.name}에서 꼭</div>
          <div className="must-list">
            {mustSee.map((i) => (
              <span key={i.id} className={pickedIds.has(i.id) ? 'must is-in' : 'must'}>
                {THEME_ICON[i.theme]} {i.name}
                {pickedIds.has(i.id) ? ' ✓' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

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
                {c.mustNames.length > 0 && (
                  <div className="course-must">필수 {c.mustNames.join(' · ')}</div>
                )}
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
        <span className="days-label">{city.name} 며칠</span>
        <div className="days-step" role="group" aria-label={`${city.name} 일수`}>
          <button
            type="button" aria-label="반나절 줄이기" disabled={wantDays <= 0.5}
            onClick={() => setDays(wantDays - 0.5)}
          >−</button>
          <span className="days-value">{fmtDays(wantDays)}</span>
          <button
            type="button" aria-label="반나절 늘리기" disabled={wantDays >= 7 || atCeiling}
            title={atCeiling ? `${city.name}에 볼 만한 곳은 ${worth}일치입니다` : undefined}
            onClick={() => setDays(wantDays + 0.5)}
          >＋</button>
        </div>
        <span className="days-hint">
          {pickedIds.size === 0
            ? '아직 담긴 것이 없습니다'
            : `${pickedIds.size}곳 담김`}
          {atCeiling && <span className="days-cap"> · {city.name}는 {worth}일치가 전부입니다</span>}
        </span>
      </div>
      {/*
        정한 일수와 담은 분량이 어긋나면 그것만 말한다. 예전에는 위에 '2일',
        아래에 '1.1일' 이 아무 설명 없이 같이 떠 있었다. 둘은 다른 값인데
        (하나는 잡아 둔 날, 하나는 담은 분량) 이름이 같아 보였다.
      */}
      {pickedIds.size > 0 && Math.abs(pickedDays - wantDays) >= 0.5 && (
        <p className={pickedDays > wantDays ? 'days-off is-over' : 'days-off'}>
          {pickedDays > wantDays
            ? `${fmtDays(wantDays)}로 잡으셨는데 담은 것은 ${pickedDays}일치입니다. `
              + `${Math.round((pickedDays - wantDays) * 10) / 10}일치가 계획에서 밀려납니다.`
            : `${fmtDays(wantDays)}로 잡으셨는데 담은 것은 ${pickedDays}일치뿐입니다. `
              + '＋ 를 누르면 그 일수에 맞게 더 담아 드립니다.'}
        </p>
      )}

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

      {/*
        미식은 코스에 넣지 않는다.

        점심과 저녁은 어차피 먹으므로 식당을 담았다고 여행이 길어지지 않는다.
        예전에는 미식이 소요 일수의 11~28%(세비야 28%)를 차지해 숙박일과
        거점 판정까지 밀고 올라갔다. 식당 때문에 하룻밤이 더 잡히는 것은
        계획이 아니라 계산 실수다.
      */}
      {foodPicks.length > 0 && (
        <details className="foodbox">
          <summary>
            <b>🍽 {city.name} 미식 후보 {foodPicks.length}곳</b>
            {' — '}일정에는 더해지지 않습니다
          </summary>
          <p className="help" style={{ margin: '8px 0 10px' }}>
            담아 두시면 계획의 <b>점심·저녁 자리</b>에 순서대로 배정됩니다.
            자리보다 많이 담으신 것은 후보로 남고, <b>그 때문에 다른 일정이
            밀리지는 않습니다.</b> 소요 일수에도 세지 않습니다.
          </p>
          {foodPicks.map((item) => (
            <ItemRow
              key={item.id} item={item} city={cityOf(item.city)}
              priorities={priorities} onSet={onSet} selectable
            />
          ))}
        </details>
      )}

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
