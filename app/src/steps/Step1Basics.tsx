import { useMemo, useState } from 'react';
import type { Basics, City, LastDayPlan, MacroRegion } from '../types';
import { Block, Field, Segmented } from '../components/Controls';
import CityCard from '../components/CityCard';
import BasePlan from '../components/BasePlan';
import type { Itinerary } from '../lib/itinerary';
import type { Island } from '../lib/data';
import { AIRPORT_GROUPS, airportOf } from '../lib/airports';
import { withJosa } from '../lib/korean';
import { arrivalLeg, departureLeg, fmtHm, parseHm, tripWindow } from '../lib/airporttime';

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
  basics, cities, macroRegions, islands = [], itinerary, arrival, departure, onChange,
}: {
  basics: Basics;
  cities: City[];
  macroRegions: MacroRegion[];
  /** 섬 목록. 섬은 자치주가 아니라 섬 하나가 여행 단위다. */
  islands?: Island[];
  /**
   * 동선 엔진이 만든 여정. 4단계 계획과 같은 것을 쓴다 -
   * 미리보기가 실제 계획과 다르면 오해만 만든다.
   */
  itinerary: Itinerary | null;
  /** 입·출국 공항이 실제로 이어지는 도시. App 이 계산해 내려 준다. */
  arrival: { slug: string; transferKm: number } | null;
  departure: { slug: string; transferKm: number } | null;
  onChange: (patch: Partial<Basics>) => void;
}) {
  const [openRegion, setOpenRegion] = useState<string | null>(macroRegions[0]?.id ?? null);
  const [onlyFirst, setOnlyFirst] = useState(false);

  const days = tripDays(basics);
  const nights = Math.max(0, days - 1);
  const selected = cities.filter((c) => basics.cities.includes(c.slug));
  const inAirport = airportOf(basics.startAirport);
  const outAirport = airportOf(basics.endAirport);
  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;
  const toggle = (slug: string) => {
    const next = basics.cities.includes(slug)
      ? basics.cities.filter((s) => s !== slug)
      : [...basics.cities, slug];
    onChange({ cities: next });
  };

  /**
   * 공항에 먹히는 시간까지 넣어 실제로 쓸 수 있는 날을 센다.
   * 시각을 안 넣었으면 null 이고, 그때는 예전처럼 달력 일수로 짠다.
   */
  const window = useMemo(() => {
    const inAt = parseHm(basics.arrivalTime);
    const outAt = parseHm(basics.departureTime);
    if (inAt === null && outAt === null) return null;
    const inCity = inAirport ? cities.find((c) => c.slug === (arrival?.slug ?? inAirport.city)) : undefined;
    const outCity = outAirport ? cities.find((c) => c.slug === (departure?.slug ?? outAirport.city)) : undefined;
    return tripWindow(
      days,
      inAt, outAt,
      inAirport ? arrivalLeg(inAirport, inCity) : null,
      outAirport ? departureLeg(outAirport, outCity) : null,
      9.5 * 60, 22 * 60,
    );
  }, [basics.arrivalTime, basics.departureTime, inAirport, outAirport, arrival, departure, cities, days]);

  const byRegion = (id: string) => {
    const list = cities.filter((c) => c.macroRegion === id);
    return onlyFirst ? list.filter((c) => c.firstTimer) : list;
  };

  /*
   * 섬은 자치주가 아니라 섬 하나가 여행 단위다.
   *
   * 예전에는 '섬 (발레아레스·카나리아)' 한 칸에 아홉 도시가 섞여 있었다.
   * 테네리페와 그란카나리아는 대서양 60km 를 사이에 둔 다른 섬인데 같은
   * 칸에 나란히 있으니, 둘을 함께 고르면 하루가 배와 비행기로 사라진다는
   * 것이 보이지 않았다. 섬마다 한 칸으로 나눈다.
   */
  const groups = useMemo(() => {
    const out: { id: string; name: string; note?: string; list: City[] }[] = [];
    for (const r of macroRegions) {
      if (r.id === 'island') continue;
      out.push({ id: r.id, name: r.name, list: byRegion(r.id) });
    }
    for (const i of islands) {
      const list = cities.filter((c) => c.island === i.id);
      out.push({
        id: `island:${i.id}`,
        name: `${i.name} (섬)`,
        note: i.note,
        list: onlyFirst ? list.filter((c) => c.firstTimer) : list,
      });
    }
    // 섬 목록에 없는 섬 도시가 남으면 흘리지 않고 예전 칸에 담는다.
    const covered = new Set(islands.flatMap((i) => i.cities));
    const rest = byRegion('island').filter((c) => !covered.has(c.slug));
    if (rest.length) out.push({ id: 'island', name: '그 밖의 섬', list: rest });
    return out;
  }, [cities, macroRegions, islands, onlyFirst]);

  return (
    <>
      <h2>언제, 어디로 가시나요</h2>
      <p className="lede">
        가고 싶은 도시를 고르면 어디에 묵고 어디를 당일치기로 다녀올지 정해 드립니다.
        고르신 도시에서 취향도 함께 읽습니다.
      </p>

      <Block title="일정">
        {/*
          '출발일 / 도착일' 이었다. 그런데 아래에서 묻는 '도착 시각' 은
          스페인에 내리는 시각(첫날)이고 '출발 시각' 은 스페인에서 뜨는
          시각(마지막 날)이라, 같은 화면에서 같은 말이 정반대 날을
          가리켰다. 무엇을 넣으라는 것인지 알 수가 없다.

          전부 '스페인 기준' 으로 통일한다. 귀국편은 다음 날 한국에
          내리므로, 한국 도착일을 넣지 않도록 따로 적어 둔다.
        */}
        <div className="date-pair">
          <Field label="스페인 첫날" hint="현지에 도착하는 날">
            <input
              type="date" value={basics.startDate}
              max={basics.endDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
            />
          </Field>
          <Field label="스페인 마지막 날" hint="현지에서 떠나는 날">
            <input
              type="date" value={basics.endDate}
              min={basics.startDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
          </Field>
        </div>
        <p className="help">
          현지에서 {days}일 {nights}박입니다.
          {' '}<b>한국 도착일이 아니라 스페인을 떠나는 날</b>을 넣으세요 —
          귀국편은 다음 날 한국에 내립니다.
        </p>

        <Field label="마지막 날 일정" hint="출발 시각을 넣으면 자동으로 정해집니다">
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

      {/*
        출도착은 공항 기준이다. 비행기표를 먼저 끊고 일정을 짜기 때문에
        날짜 바로 다음에 온다. 도시 선택과는 무관하므로 언제나 고를 수 있다.
      */}
      <Block
        title="입국 · 출국 공항"
        help="항공권에 찍힌 공항을 고르세요. 왕복이면 둘을 같은 공항으로 두시면 됩니다."
      >
        <div className="date-pair">
          <Field label="도착" hint="스페인에 내리는 공항">
            <select
              value={basics.startAirport ?? ''}
              onChange={(e) => onChange({ startAirport: e.target.value || null })}
            >
              <option value="">아직 안 정함</option>
              {AIRPORT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.list.map((a) => (
                    <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="출발" hint="돌아갈 때 타는 공항">
            <select
              value={basics.endAirport ?? ''}
              onChange={(e) => onChange({ endAirport: e.target.value || null })}
            >
              <option value="">아직 안 정함</option>
              {AIRPORT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.list.map((a) => (
                    <option key={a.iata} value={a.iata}>{a.name} ({a.iata})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>

        {/*
          시각을 대략만 알아도 계산이 크게 달라진다.

          달력 날짜만 세면 11일 여행에 11일치를 담게 된다. 그런데 첫날 오후
          4시에 내리면 그날은 저녁 한 끼가 전부이고, 마지막 날 낮 12시
          비행기면 아침에 짐을 끌고 공항으로 간다.
        */}
        {(inAirport || outAirport) && (
          <div className="date-pair" style={{ marginTop: 12 }}>
            <Field label="현지 착륙 시각" hint="스페인에 내리는 시각 (대략)">
              <input
                type="time" value={basics.arrivalTime ?? ''}
                onChange={(e) => onChange({ arrivalTime: e.target.value || null })}
              />
            </Field>
            <Field label="현지 이륙 시각" hint="귀국편이 뜨는 시각 (대략)">
              <input
                type="time" value={basics.departureTime ?? ''}
                onChange={(e) => onChange({ departureTime: e.target.value || null })}
              />
            </Field>
          </div>
        )}

        {window && (window.firstDayStart !== null || window.lastDayEnd !== null) && (
          <details className="tripwin">
            <summary>
              실제로 쓸 수 있는 날 <b>{window.usableDays}일</b>
              {window.lostDays > 0 && ` — 달력 ${days}일 중 ${window.lostDays}일이 공항에 들어갑니다`}
            </summary>
            <div className="tripwin-body">
              {window.firstDayStart !== null && window.arrival && (
                <p>
                  <b>첫날</b> {basics.arrivalTime} 착륙 → <b>{fmtHm(window.firstDayStart)}</b>부터 일정
                  <span className="tripwin-why">{window.arrival.note}</span>
                </p>
              )}
              {window.lastDayEnd !== null && window.departure && (
                <p>
                  <b>마지막 날</b> <b>{fmtHm(window.lastDayEnd)}</b>까지 → {basics.departureTime} 이륙
                  <span className="tripwin-why">{window.departure.note}</span>
                </p>
              )}
              <p className="tripwin-why">
                전부 추정치입니다. 항공권과 다르면 시각을 조정하세요.
              </p>
            </div>
          </details>
        )}

        {(inAirport || outAirport) && (
          <div className="airport-note">
            {inAirport && (
              <p>
                <b>도착 {inAirport.name}</b>
                {arrival
                  ? arrival.transferKm === 0
                    ? ` — ${cityName(arrival.slug)}에서 여행을 시작합니다.`
                    : ` — 이번 여행에 ${withJosa(cityName(inAirport.city), '이가')} 없어, 가장 가까운 ${cityName(arrival.slug)}까지 약 ${arrival.transferKm}km 이동한 뒤 시작합니다.`
                  : ' — 도시를 고르시면 어디서 시작할지 알려 드립니다.'}
              </p>
            )}
            {outAirport && (
              <p>
                <b>출발 {outAirport.name}</b>
                {departure
                  ? departure.transferKm === 0
                    ? ` — ${cityName(departure.slug)}에서 마무리합니다.`
                    : ` — 이번 여행에 ${withJosa(cityName(outAirport.city), '이가')} 없어, ${cityName(departure.slug)}에서 마무리하고 약 ${departure.transferKm}km 이동해 공항으로 갑니다.`
                  : ' — 도시를 고르시면 어디서 마무리할지 알려 드립니다.'}
              </p>
            )}
            {(arrival?.transferKm ?? 0) > 150 && (
              <p className="airport-caveat">
                공항과 첫 도시가 {arrival?.transferKm}km 떨어져 있습니다. 기차나 국내선으로 반나절이
                걸릴 수 있으니, 도착 당일 일정은 비워 두시는 편이 안전합니다.
              </p>
            )}
            {(departure?.transferKm ?? 0) > 150 && (
              <p className="airport-caveat">
                마지막 도시에서 공항까지 {departure?.transferKm}km입니다. 출국 전날 공항 근처로
                옮기는 것을 고려하세요.
              </p>
            )}
            {inAirport?.note && <p className="airport-caveat">{inAirport.iata} · {inAirport.note}</p>}
            {outAirport?.note && outAirport.iata !== inAirport?.iata && (
              <p className="airport-caveat">{outAirport.iata} · {outAirport.note}</p>
            )}
            {inAirport && outAirport && inAirport.iata !== outAirport.iata && (
              <p>편도 두 장(오픈조) 일정입니다. 같은 곳으로 돌아오지 않으므로 마지막 날 짐을 옮길 일이 없습니다.</p>
            )}
          </div>
        )}
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

        {groups.map((region) => {
          const list = region.list;
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
              {isOpen && region.note && (
                <p className="help" style={{ margin: '8px 2px 0' }}>{region.note}</p>
              )}
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

      {selected.length > 0 && itinerary && (
        <BasePlan itinerary={itinerary} cities={cities} />
      )}
    </>
  );
}
