import { useMemo, useState } from 'react';
import type { City, Item, Preferences, Priorities, ThemeId } from '../types';
import { THEMES } from '../lib/themes';
import { rankItems } from '../lib/scoring';
import { ItemRow } from '../components/ItemRow';

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

  return (
    <>
      <h2>이렇게 나왔습니다</h2>
      <p className="lede">
        {totalCities}개 도시에서 아이템 {items.length}개를 찾아 8개 활동 테마로 나눴습니다.
        관심도가 높은 테마부터 보여드립니다.
      </p>

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
