import type { Basics, City } from '../types';
import { Block, Field, Segmented } from '../components/Controls';

/** 1단계 — 여행지와 일정 등 기초 정보. */
export default function Step1Basics({
  basics, cities, onChange,
}: { basics: Basics; cities: City[]; onChange: (patch: Partial<Basics>) => void }) {
  const hubs = cities.filter((c) => c.isHub);
  const toggleCity = (slug: string) => {
    const next = basics.baseCities.includes(slug)
      ? basics.baseCities.filter((s) => s !== slug)
      : [...basics.baseCities, slug];
    onChange({ baseCities: next });
  };

  const selected = hubs.filter((c) => basics.baseCities.includes(c.slug));
  const nights = Math.max(0, basics.days - 1);

  return (
    <>
      <h2>어디로, 언제 떠나시나요</h2>
      <p className="lede">머물 거점 도시를 고르면 그 주변 근교 도시까지 함께 후보에 들어갑니다.</p>

      <Block title="거점 도시" help="숙소를 잡고 머물 도시입니다. 여러 곳을 고르면 일정을 나눠 배분합니다.">
        <div className="chips">
          {hubs.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="chip"
              aria-pressed={basics.baseCities.includes(c.slug)}
              onClick={() => toggleCity(c.slug)}
            >
              {c.name}
              <span style={{ opacity: 0.6, fontSize: 12 }}> {c.itemCount}</span>
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <p className="help" style={{ marginTop: 12 }}>
            {selected.map((c) => `${c.name}(근교 ${c.dayTrips.length}곳)`).join(' · ')}
          </p>
        )}
      </Block>

      <Block title="일정">
        <Field label="출발일">
          <input type="date" value={basics.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        </Field>
        <Field label="여행 일수" hint={`${basics.days}일 ${nights}박`}>
          <input
            type="range" min={1} max={21} step={1} value={basics.days}
            onChange={(e) => onChange({ days: Number(e.target.value) })}
          />
          <div className="scale-labels"><span>당일치기</span><span>3주</span></div>
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
    </>
  );
}
