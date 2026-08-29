import type { BaseGroup } from '../lib/basing';
import type { City } from '../types';

/**
 * 거점 판정 결과를 보여 준다.
 * 자동으로 확정하지 않고 이유를 붙여 제안한 뒤 사용자가 바꿀 수 있게 한다.
 * 특히 고르지 않은 도시를 거점으로 끌어온 경우에는 반드시 설명이 필요하다.
 */
export default function BasePlan({
  groups, candidates, overrides, onOverride,
}: {
  groups: BaseGroup[];
  candidates: City[];
  overrides: Record<number, string>;
  onOverride: (index: number, slug: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <section className="block">
      <h3>이렇게 묵으시면 됩니다</h3>
      <p className="help">고른 도시를 이동 시간 기준으로 묶었습니다. 거점은 바꿀 수 있습니다.</p>

      {groups.map((g, i) => {
        const options = [g.base, ...g.dayTrips.map((t) => t.city)]
          .filter((c) => c.nights[1] > 0);
        return (
          <div className="card base-group" key={g.base.slug}>
            <div className="base-head">
              <span className="base-name">{g.base.name}</span>
              <span className="base-nights">{g.nights}박</span>
              {g.baseSuggested && <span className="badge-suggest">제안</span>}
            </div>
            <p className="base-reason">{g.reason}</p>

            {g.dayTrips.length > 0 && (
              <ul className="base-trips">
                {g.dayTrips.map((t) => (
                  <li key={t.city.slug}>
                    <span className="trip-city">{t.city.name}</span>
                    <span className="trip-leg">
                      {t.leg.measured ? '' : '약 '}{t.leg.minutes}분 · {t.leg.mode}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {options.length > 1 && (
              <label className="base-switch">
                <span>여기 대신 묵을 곳</span>
                <select
                  value={overrides[i] ?? g.base.slug}
                  onChange={(e) => onOverride(i, e.target.value)}
                >
                  {options.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}

      {candidates.some((c) => groups.some((g) => g.baseSuggested && g.base.slug === c.slug)) && (
        <p className="help" style={{ marginTop: 10 }}>
          제안된 거점은 고르지 않으신 도시입니다. 그 도시의 볼거리도 후보에 함께 들어갑니다.
        </p>
      )}
    </section>
  );
}
