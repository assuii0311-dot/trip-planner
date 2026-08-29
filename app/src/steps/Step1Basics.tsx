import { useMemo, useState } from 'react';
import type { Basics, City, LastDayPlan, MacroRegion } from '../types';
import { Block, Field, Segmented } from '../components/Controls';
import CityCard from '../components/CityCard';
import BasePlan from '../components/BasePlan';
import { assignBases } from '../lib/basing';

export function tripDays(basics: Basics): number {
  const a = new Date(`${basics.startDate}T00:00:00`);
  const b = new Date(`${basics.endDate}T00:00:00`);
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Number.isFinite(days) ? Math.max(1, Math.min(30, days)) : 1;
}

/**
 * 1단계 — 기간을 정하고, 전체 도시를 특징과 함께 보며 가고 싶은 곳을 고른다.
 *
 * 거점을 먼저 고르라고 하지 않는다. 처음 가는 사람에게는 어디에 묵어야
 * 효율적인지 판단할 근거가 없기 때문이다. 도시를 고르면 앱이 묶어 준다.
 */
export default function Step1Basics({
  basics, cities, macroRegions, overrides, onChange, onOverride,
}: {
  basics: Basics;
  cities: City[];
  macroRegions: MacroRegion[];
  overrides: Record<number, string>;
  onChange: (patch: Partial<Basics>) => void;
  onOverride: (index: number, slug: string) => void;
}) {
  const [openRegion, setOpenRegion] = useState<string | null>(macroRegions[0]?.id ?? null);
  const [onlyFirst, setOnlyFirst] = useState(false);

  const days = tripDays(basics);
  const nights = Math.max(0, days - 1);
  const selected = cities.filter((c) => basics.cities.includes(c.slug));
  const groups = useMemo(
    () => assignBases(selected, cities, days),
    [selected.map((c) => c.slug).join(','), cities, days],
  );

  const toggle = (slug: string) => {
    const next = basics.cities.includes(slug)
      ? basics.cities.filter((s) => s !== slug)
      : [...basics.cities, slug];
    onChange({ cities: next });
  };

  const byRegion = (id: string) => {
    const list = cities.filter((c) => c.macroRegion === id);
    return onlyFirst ? list.filter((c) => c.firstTimer) : list;
  };

  return (
    <>
      <h2>언제, 어디로 가시나요</h2>
      <p className="lede">
        가고 싶은 도시를 고르면 어디에 묵고 어디를 당일치기로 다녀올지 정해 드립니다.
        고르신 도시에서 취향도 함께 읽습니다.
      </p>

      <Block title="일정">
        <div className="date-pair">
          <Field label="출발일">
            <input
              type="date" value={basics.startDate}
              max={basics.endDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
            />
          </Field>
          <Field label="도착일">
            <input
              type="date" value={basics.endDate}
              min={basics.startDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
          </Field>
        </div>
        <p className="help">현지에서 {days}일 {nights}박입니다.</p>

        <Field label="도착일 일정" hint="오후 비행기가 가장 흔해 기본은 오전만입니다">
          <Segmented
            value={basics.lastDayPlan}
            options={[
              { value: 'none' as LastDayPlan, label: '없음' },
              { value: 'morning' as LastDayPlan, label: '오전만' },
              { value: 'full' as LastDayPlan, label: '종일' },
            ]}
            onChange={(v) => onChange({ lastDayPlan: v })}
          />
        </Field>
      </Block>

      <Block title="인원">
        <Segmented
          value={String(basics.partySize)}
          options={[
            { value: '1', label: '1명' }, { value: '2', label: '2명' },
            { value: '3', label: '3명' }, { value: '4', label: '4명+' },
          ]}
          onChange={(v) => onChange({ partySize: Number(v) })}
        />
      </Block>

      <Block title="가고 싶은 도시" help={`${cities.length}곳 전부를 권역별로 묶었습니다. 여러 곳을 골라도 됩니다.`}>
        <div className="toolbar" style={{ marginTop: 0, marginBottom: 12 }}>
          <button type="button" onClick={() => setOnlyFirst((v) => !v)}>
            {onlyFirst ? '전체 보기' : '처음이라면 이곳부터'}
          </button>
          {basics.cities.length > 0 && (
            <button type="button" onClick={() => onChange({ cities: [] })}>
              선택 해제 ({basics.cities.length})
            </button>
          )}
        </div>

        {macroRegions.map((region) => {
          const list = byRegion(region.id);
          if (list.length === 0) return null;
          const picked = list.filter((c) => basics.cities.includes(c.slug)).length;
          const isOpen = openRegion === region.id;
          return (
            <div className="theme-group" key={region.id}>
              <button
                type="button" className="theme-head"
                aria-expanded={isOpen}
                onClick={() => setOpenRegion(isOpen ? null : region.id)}
              >
                <span style={{ fontWeight: 700 }}>{region.name}</span>
                <span className="count">
                  {picked > 0 && <span className="picked">{picked} / </span>}
                  {list.length}곳 {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && (
                <div className="city-list">
                  {list.map((c) => (
                    <CityCard
                      key={c.slug} city={c}
                      selected={basics.cities.includes(c.slug)}
                      onToggle={() => toggle(c.slug)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Block>

      {selected.length > 0 && (
        <BasePlan groups={groups} candidates={cities} overrides={overrides} onOverride={onOverride} />
      )}
    </>
  );
}
