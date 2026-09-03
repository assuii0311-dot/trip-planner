import type { City, Item, Plan } from '../types';
import { ItemDetail } from '../components/ItemDetail';
import { bookingLinks, directionsUrl, intercityLinks, mapsPlaceUrl } from '../lib/deeplinks';
import { formatTime, SLOT_LABEL } from '../lib/planner';
import { MapExport } from '../components/MapExport';
import { TripMap, TripMapLegend, mapDataOf } from '../components/TripMap';

function LinkRow({ label, note, url }: { label: string; note: string; url: string }) {
  return (
    <a className="link-row" href={url} target="_blank" rel="noreferrer">
      <span>
        <div className="l">{label}</div>
        <div className="n">{note}</div>
      </span>
      <span className="go" aria-hidden>›</span>
    </a>
  );
}

/** 5단계 — 선택한 계획의 이동과 예약 방법을 안내한다. */
export default function Step6Guide({
  plan, cities, allItems, attribution, tripName, fileBase, country,
}: {
  plan: Plan | null;
  cities: City[];
  /** 고른 도시의 전체 아이템 — 지도 내보내기 ①번에 쓴다. */
  allItems: Item[];
  attribution: string[];
  tripName: string;
  fileBase: string;
  /** 지도에 그릴 나라. 국경선과 범위가 나라마다 다르다. */
  country: string;
}) {
  if (!plan) {
    return <div className="empty">먼저 4단계에서 계획을 하나 선택해 주세요.</div>;
  }
  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);
  const usedCities = [...new Set(plan.days.map((d) => d.city))].map(cityOf).filter(Boolean) as City[];
  const mapData = mapDataOf(plan, cities);
  const home = usedCities[0];

  return (
    <>
      <h2>{plan.title} 일정 안내</h2>
      <p className="lede">
        각 일정의 길찾기와 예약 경로를 정리했습니다.
        실시간 영업시간과 평점은 링크를 눌러 지도에서 확인하세요.
      </p>

      <p className="footnote" style={{ margin: '0 0 20px' }}>
        열차 시간표: Renfe 공개 데이터 (CC BY 4.0) ·
        실제 운행은 <a href="https://www.renfe.com" target="_blank" rel="noreferrer">renfe.com</a> 에서 확인하세요.
      </p>

      <section className="block" style={{ marginBottom: 26 }}>
        <h3>한눈에 보기</h3>
        <p className="help" style={{ margin: '0 0 10px' }}>
          큰 점은 자는 곳, 작은 점은 당일치기입니다. 선 위의 아이콘이 그 구간에서 타는 것입니다.
        </p>
        <div className="card" style={{ padding: 12 }}>
          <TripMap stops={mapData.stops} hops={mapData.hops} country={country} />
          <TripMapLegend stops={mapData.stops} hops={mapData.hops} />
        </div>
      </section>

      <section className="block" style={{ marginBottom: 26 }}>
        <h3>내 구글 지도에 담아 가기</h3>
        <MapExport
          allItems={allItems} plan={plan} cities={cities}
          attribution={attribution} tripName={tripName} fileBase={fileBase}
        />
      </section>

      {plan.days.map((day) => (
        <div className="day" key={day.dayIndex}>
          <div className="day-head">
            <span className="n">{day.dayIndex}일차</span>
            <span className="d">
              {day.date} · {cityOf(day.city)?.name ?? day.city}
              {day.returnTo && ` (오전) → ${cityOf(day.returnTo)?.name ?? day.returnTo} (오후)`}
            </span>
            {day.isDayTrip && (
              <span className="badge">{day.returnTo ? '반나절 근교' : '근교 당일치기'}</span>
            )}
          </div>

          {day.isDayTrip && home && cityOf(day.city) && (
            <details className="guide">
              <summary>🚄 {home.name} → {cityOf(day.city)!.name} 가는 법</summary>
              <div className="inner">
                {(home.dayTrips.find((t) => t.city === day.city)) && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>
                    {home.dayTrips.find((t) => t.city === day.city)!.mode} 약{' '}
                    {home.dayTrips.find((t) => t.city === day.city)!.transitMin}분 ·{' '}
                    {home.dayTrips.find((t) => t.city === day.city)!.note}
                  </div>
                )}
                {intercityLinks(home, cityOf(day.city)!).map((l) => (
                  <LinkRow key={l.label} label={l.label} note={l.note} url={l.url} />
                ))}
              </div>
            </details>
          )}

          {day.entries.map((e, i) => {
            const prev = i > 0 ? day.entries[i - 1].item : null;
            const city = cityOf(e.item.city);
            return (
              <details className="guide" key={`${e.item.id}-${i}`}>
                <summary>
                  {formatTime(e.startMin)} · {e.item.name}
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                    {SLOT_LABEL[e.slot]} · {e.item.durationMin}분{e.travelMin > 0 ? ` · 이동 ${e.travelMin}분` : ''}
                  </div>
                </summary>
                <div className="inner">
                  <ItemDetail item={e.item} />
                  <LinkRow
                    label={prev ? `${prev.name}에서 길찾기` : '이 장소까지 길찾기'}
                    note="대중교통 기준 경로가 열립니다. 스페인 도시는 지하철·버스가 촘촘합니다."
                    url={directionsUrl(prev, e.item, city)}
                  />
                  <LinkRow
                    label="지도에서 열기"
                    note="영업시간·휴관일·평점·최근 사진을 실시간으로 확인하세요."
                    url={mapsPlaceUrl(e.item, city)}
                  />
                  {bookingLinks(e.item, city).map((l) => (
                    <LinkRow key={l.label} label={l.label} note={l.note} url={l.url} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>도시별 교통 가이드</h3>
      {usedCities.map((c) => (
        <details className="guide" key={c.slug}>
          <summary>🚇 {c.name} 교통 요약</summary>
          <div className="inner" style={{ padding: '12px 14px' }}>
            {c.transitGuide.passes.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>교통권</div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
                  {c.transitGuide.passes.map((p) => (
                    <li key={p.name}><b style={{ color: 'var(--text)' }}>{p.name}</b> {p.price} — {p.note}</li>
                  ))}
                </ul>
              </>
            )}
            {c.transitGuide.apps.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>현지 앱</div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
                  {c.transitGuide.apps.map((a) => (
                    <li key={a.name}><b style={{ color: 'var(--text)' }}>{a.name}</b> — {a.note}</li>
                  ))}
                </ul>
              </>
            )}
            {c.transitGuide.tips.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>알아두면 좋은 것</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
                  {c.transitGuide.tips.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </>
            )}
          </div>
        </details>
      ))}

      <details className="guide">
        <summary>💡 스페인 여행 공통 안내</summary>
        <div className="inner" style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>점심은 14시, 저녁은 21시가 현지 기준입니다. 20시 이전에 문 여는 식당은 관광객용인 경우가 많습니다.</li>
            <li>인기 명소(사그라다 파밀리아, 알함브라, 프라도)는 <b>날짜 지정 온라인 예매가 사실상 필수</b>입니다. 알함브라는 몇 주 전에 매진됩니다.</li>
            <li>많은 미술관이 주 1회 무료 개방 시간대를 둡니다. 대신 줄이 깁니다.</li>
            <li>일요일과 월요일에 문을 닫는 곳이 많습니다. 출발 전 지도 링크로 확인하세요.</li>
            <li>소매치기는 바르셀로나 람블라스와 마드리드 솔 광장 지하철에서 특히 잦습니다.</li>
            <li>Renfe 고속열차(AVE)는 예매가 빠를수록 저렴하고, 당일 요금은 3배까지 오릅니다.</li>
          </ul>
        </div>
      </details>
    </>
  );
}
