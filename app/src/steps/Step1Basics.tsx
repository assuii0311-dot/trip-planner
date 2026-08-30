import { useState } from 'react';
import type { Basics, City, LastDayPlan, MacroRegion } from '../types';
import { Block, Field, Segmented } from '../components/Controls';
import CityCard from '../components/CityCard';
import BasePlan from '../components/BasePlan';
import type { BaseGroup } from '../lib/basing';

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
  basics, cities, macroRegions, groups, overrides, onChange, onOverride,
}: {
  basics: Basics;
  cities: City[];
  macroRegions: MacroRegion[];
  /**
   * 거점 묶음. App 이 한 곳에서 계산해 내려 준다.
   * 예전에는 이 화면이 따로 계산했는데, 그러면 입국·출국 도시로 돌린 순서가
   * 여기에 반영되지 않아 화면과 실제 계획이 어긋난다.
   */
  groups: BaseGroup[];
  overrides: Record<number, string>;
  onChange: (patch: Partial<Basics>) => void;
  onOverride: (index: number, slug: string) => void;
}) {
  const [openRegion, setOpenRegion] = useState<string | null>(macroRegions[0]?.id ?? null);
  const [onlyFirst, setOnlyFirst] = useState(false);

  const days = tripDays(basics);
  const nights = Math.max(0, days - 1);
  const selected = cities.filter((c) => basics.cities.includes(c.slug));
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

      {/*
        날짜·인원과 같은 '기본 정보' 로 인식되는 항목이라 위쪽에 둔다.
        예전에는 도시 목록 뒤에 있었는데, 60개 도시 아코디언 때문에 화면
        상단에서 3,000px 아래로 밀려 사실상 보이지 않았다.
        고른 도시가 2곳이 안 되면 고를 것이 없지만, 그때도 자리는 보여 준다 —
        비어 있으면 이런 항목이 있다는 사실 자체를 알 수 없다.
      */}
      <Block
        title="들어가고 나오는 도시"
        help="마드리드로 들어와 바르셀로나에서 나오는 일정이라면 도시 순서가 달라집니다. 왕복 항공권이면 둘을 같은 도시로 두세요."
      >
        {selected.length > 1 ? (
          <>
            <div className="date-pair">
              <Field label="첫 도시" hint="도착 공항">
                <select
                  value={basics.startCity ?? ''}
                  onChange={(e) => onChange({ startCity: e.target.value || null })}
                >
                  <option value="">앱이 정하도록</option>
                  {selected.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="마지막 도시" hint="출국 공항">
                <select
                  value={basics.endCity ?? ''}
                  onChange={(e) => onChange({ endCity: e.target.value || null })}
                >
                  <option value="">앱이 정하도록</option>
                  {selected.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            {basics.startCity && basics.endCity && basics.startCity !== basics.endCity && (
              <p className="help">
                편도 두 장(오픈조) 일정입니다. 같은 도시로 돌아오지 않으므로 마지막 날 짐을 옮길 일이 없습니다.
              </p>
            )}
          </>
        ) : (
          <p className="help" style={{ margin: 0 }}>
            아래에서 <b>도시를 2곳 이상</b> 고르시면 여기서 정할 수 있습니다.
            {selected.length === 1 && ' 지금은 한 곳이라 들어가고 나오는 도시가 같습니다.'}
          </p>
        )}
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
