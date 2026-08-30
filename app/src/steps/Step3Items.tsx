import { useMemo, useState } from 'react';
import type { City, Item, Preferences, Priorities, ThemeId } from '../types';
import { THEMES } from '../lib/themes';
import { rankItems } from '../lib/scoring';
import { ItemRow } from '../components/ItemRow';
import { ItemPhoto } from '../components/ItemPhoto';
import { recommend } from '../lib/recommend';
import { mapsPlaceUrl } from '../lib/deeplinks';

/**
 * 3단계 — 아이템을 활동 테마로 묶어 보여준다.
 * 취향 점수 순으로 정렬하되 선택은 받지 않는다. 고르는 일은 4단계에서 한다.
 */
export default function Step3Items({
  items, cities, prefs,
}: { items: Item[]; cities: City[]; prefs: Preferences }) {
  const [open, setOpen] = useState<ThemeId | null>(THEMES[0].id);
  const noop = () => {};
  const empty: Priorities = {};

  const byTheme = useMemo(() => {
    const ranked = rankItems(items, prefs, empty);
    const map = new Map<ThemeId, Item[]>();
    for (const { item } of ranked) {
      const list = map.get(item.theme) ?? [];
      list.push(item);
      map.set(item.theme, list);
    }
    return map;
  }, [items, prefs]);

  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);
  const totalCities = new Set(items.map((i) => i.city)).size;
  const picks = useMemo(() => recommend(items, cities, prefs), [items, cities, prefs]);

  return (
    <>
      <h2>이렇게 나왔습니다</h2>
      <p className="lede">
        {totalCities}개 도시에서 아이템 {items.length}개를 찾아 8개 활동 테마로 나눴습니다.
        관심도가 높은 테마부터 보여드립니다.
      </p>

      {picks.length > 0 && (
        <section className="recommend">
          <h3>추천 장소</h3>
          {/* 근거를 밝히지 않는 추천은 이 앱에서 금지다. 무엇으로 골랐는지 먼저 적는다. */}
          <p className="basis">
            여행자에게 가장 널리 알려진 곳을 <strong>위키백과 언어판 수</strong>로 재고,
            2단계에서 답하신 취향으로 다시 걸렀습니다. 한 도시에 몰리지 않게 도시당 2곳까지만 뽑습니다.
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

      {THEMES.map((t) => {
        const list = byTheme.get(t.id) ?? [];
        if (!list.length) return null;
        const isOpen = open === t.id;
        return (
          <div className="theme-group" key={t.id}>
            <button
              type="button" className="theme-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : t.id)}
            >
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span>
                <div style={{ fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>관심도 {prefs.themes[t.id]}</div>
              </span>
              <span className="count">{list.length}개 {isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              <div className="card" style={{ marginTop: 8 }}>
                {list.slice(0, 40).map((item) => (
                  <ItemRow
                    key={item.id} item={item} city={cityOf(item.city)}
                    priorities={empty} onSet={noop} selectable={false}
                  />
                ))}
                {list.length > 40 && (
                  <div className="empty">나머지 {list.length - 40}개는 다음 단계에서 볼 수 있습니다.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
