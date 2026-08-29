import { useMemo, useState } from 'react';
import type { City, Item, Preferences, Priorities, ThemeId } from '../types';
import { THEMES } from '../lib/themes';
import { rankItems } from '../lib/scoring';
import { ItemRow } from '../components/ItemRow';

/** 계획을 세우려면 최소한 이 정도는 골라야 한다 (하루 2곳 기준). */
export const minimumPicks = (days: number) => Math.max(4, days * 2);

/**
 * 4단계 — 여행자가 직접 우선순위를 고른다.
 * 체크박스로 후보를 넣고 빼고, 별 1~3개로 순위를 준다.
 */
export default function Step4Priority({
  items, cities, prefs, priorities, days, onSet, onBulk,
}: {
  items: Item[];
  cities: City[];
  prefs: Preferences;
  priorities: Priorities;
  days: number;
  onSet: (id: string, v: 0 | 1 | 2 | 3) => void;
  onBulk: (next: Priorities) => void;
}) {
  const [open, setOpen] = useState<ThemeId | null>(THEMES[0].id);
  const [onlyPicked, setOnlyPicked] = useState(false);

  const ranked = useMemo(() => rankItems(items, prefs, priorities), [items, prefs, priorities]);
  const byTheme = useMemo(() => {
    const map = new Map<ThemeId, Item[]>();
    for (const { item } of ranked) {
      const list = map.get(item.theme) ?? [];
      list.push(item);
      map.set(item.theme, list);
    }
    return map;
  }, [ranked]);

  const picked = Object.values(priorities).filter((v) => v > 0).length;
  const need = minimumPicks(days);
  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);

  /** 취향 점수 상위 항목을 한 번에 담아 첫 선택의 부담을 줄인다. */
  const autoPick = () => {
    const next: Priorities = { ...priorities };
    for (const { item } of ranked.slice(0, need + 6)) if (!next[item.id]) next[item.id] = 2;
    onBulk(next);
  };

  return (
    <>
      <h2>가고 싶은 곳을 골라주세요</h2>
      <p className="lede">
        체크하면 후보에 들어가고, 별점으로 우선순위를 줍니다.
        별 3개는 일정에서 가장 먼저 자리를 잡습니다.
      </p>

      <div className={picked >= need ? 'card' : 'notice'} style={{ padding: 12, marginBottom: 16 }}>
        {picked >= need
          ? `${picked}개 선택됨 — 계획을 세우기에 충분합니다.`
          : `${picked}개 선택됨 — ${days}일 일정이라면 최소 ${need}개는 필요합니다.`}
      </div>

      <div className="toolbar" style={{ marginTop: 0, marginBottom: 16 }}>
        <button type="button" onClick={autoPick}>취향대로 추천 담기</button>
        <button type="button" onClick={() => setOnlyPicked((v) => !v)}>
          {onlyPicked ? '전체 보기' : '고른 것만 보기'}
        </button>
        {picked > 0 && <button type="button" onClick={() => onBulk({})}>전부 해제</button>}
      </div>

      {THEMES.map((t) => {
        const all = byTheme.get(t.id) ?? [];
        const list = onlyPicked ? all.filter((i) => (priorities[i.id] ?? 0) > 0) : all;
        if (!list.length) return null;
        const chosen = all.filter((i) => (priorities[i.id] ?? 0) > 0).length;
        const isOpen = open === t.id;
        return (
          <div className="theme-group" key={t.id}>
            <button type="button" className="theme-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>
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
    </>
  );
}
