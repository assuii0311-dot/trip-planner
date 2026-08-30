import type { City } from '../types';
import type { Itinerary } from '../lib/itinerary';
import { fmtDur } from '../lib/routing';

/**
 * 1단계 미리보기 — 이 도시들을 고르면 여행이 어떤 모양이 되는지.
 *
 * 4단계의 계획과 같은 엔진(동선·숙박)을 쓴다. 예전에는 이 화면이 따로
 * 거점을 계산해서, 여기서 본 것과 실제 계획이 달랐다. 미리보기가 실제와
 * 다르면 미리보기가 아니라 오해를 만드는 화면이다.
 *
 * 여기서 보여 주는 일수는 도시 성격에 적힌 권장값을 쓴 가이드다. 실제
 * 일수는 3단계에서 담은 아이템에 맞춰 다시 정해진다.
 */
export default function BasePlan({
  itinerary, cities,
}: { itinerary: Itinerary; cities: City[] }) {
  const name = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  const sleeps = itinerary.stops.filter((s) => s.sleep);

  return (
    <section className="block">
      <h3>이렇게 돌게 됩니다</h3>
      <p className="help">
        도시 간 이동 시간이 가장 짧은 순서입니다. 숙박은 {sleeps.length}곳,
        도시 간 이동은 모두 {fmtDur(itinerary.transitMin)}입니다.
        아래 일수는 가이드이고, 실제 일수는 3단계에서 고른 곳에 맞춰 정해집니다.
      </p>

      <div className="card base-group">
        <ol className="route">
          {itinerary.stops.map((s, i) => (
            <li key={s.city.slug}>
              <span className="route-no">{i + 1}</span>
              <span className="route-city">{s.city.name}</span>
              <span className={`route-stay${s.sleep ? '' : ' is-trip'}`}>
                {s.sleep ? `${s.nights}박` : `당일치기 ← ${name(s.base ?? '')}`}
              </span>
            </li>
          ))}
        </ol>

        {itinerary.hops.length > 0 && (
          <ul className="route-hops">
            {itinerary.hops.map((h) => (
              <li key={`${h.from.slug}-${h.to.slug}`}>
                {h.from.name} → {h.to.name} · {h.chosen.label} {fmtDur(h.chosen.totalMin)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
