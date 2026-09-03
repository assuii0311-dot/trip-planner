import { useMemo, useState } from 'react';
import type { Basics, City, MacroRegion } from '../types';
import { Block, Field, Segmented } from '../components/Controls';
import CityCard from '../components/CityCard';
import BasePlan from '../components/BasePlan';
import type { Itinerary } from '../lib/itinerary';
import type { Island } from '../lib/data';
import { islandAsCity } from '../lib/island';
import { AIRPORT_GROUPS, airportOf } from '../lib/airports';
import { withJosa } from '../lib/korean';
import { mark } from '../lib/diag';
import { addDays, dayDiff } from '../lib/caldate';
import { isOff } from '../lib/rendermode';
import { arrivalLeg, departureLeg, fmtHm, parseHm, tripWindow } from '../lib/airporttime';

/**
 * 첫날을 옮긴다.
 *
 * 마지막 날보다 뒤로 가면 기간을 유지한 채 마지막 날도 같이 민다.
 * 예전에는 input 의 max 로 막았는데, 안드로이드 달력이 그 뒤 날짜를 전부
 * 회색 처리해 아예 고를 수 없었다. 막는 대신 따라오게 한다.
 */
export function moveStart(basics: Basics, v: string): Partial<Basics> {
  if (!v) return {};
  const span = Math.max(0, dayDiff(basics.startDate, basics.endDate));
  return dayDiff(basics.endDate, v) > 0
    ? { startDate: v, endDate: addDays(v, span) }
    : { startDate: v };
}

/** 마지막 날을 옮긴다. 첫날보다 앞이면 첫날을 같이 당긴다. */
export function moveEnd(basics: Basics, v: string): Partial<Basics> {
  if (!v) return {};
  const span = Math.max(0, dayDiff(basics.startDate, basics.endDate));
  return dayDiff(basics.startDate, v) < 0
    ? { endDate: v, startDate: addDays(v, -span) }
    : { endDate: v };
}

export function tripDays(basics: Basics): number {
  const days = dayDiff(basics.startDate, basics.endDate) + 1;
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
    // 눌림 기록과 맞대어 본다 — 닿지 않은 것인지, 닿았는데 안 도는 것인지.
    mark(`도시 ${basics.cities.includes(slug) ? '해제' : '선택'} ${slug} → ${next.length}곳`);
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

    /*
     * 섬은 카드 한 장이다.
     *
     * 마요르카 칸을 열면 팔마·소예르·포옌사가 따로 떠 있었다. 그런데 섬
     * 여행은 도시를 옮겨 다니는 것이 아니다 — 렌터카로 한 시간이면 섬을
     * 가로지르고, 볼 것의 절반은 어느 자치시에도 속하지 않는 해변과 산이다.
     * 세 곳을 따로 고르라는 것은 육지의 셈법을 섬에 들이민 것이다.
     *
     * 고르면 그 섬의 거점 도시가 선택되고, 나머지 마을의 아이템은 거점으로
     * 옮겨 붙는다(lib/island.ts). 사용자에게는 섬 하나로 보인다.
     */
    const islandCards = islands
      .map((i) => islandAsCity(i, cities))
      .filter((c): c is City => !!c);
    const shown = onlyFirst ? islandCards.filter((c) => c.firstTimer) : islandCards;
    if (shown.length) {
      out.push({
        id: 'islands',
        name: '섬 (발레아레스·카나리아)',
        note: '섬은 하나로 묶어 보여 드립니다. 고르시면 그 섬 전체가 후보가 됩니다.',
        list: shown,
      });
    }

    // 섬 목록에 없는 섬 도시가 남으면 흘리지 않고 따로 담는다.
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
        {/*
          두 칸에 서로를 가리키는 max/min 을 걸었더니 안드로이드에서
          '날짜 선택 불가' 가 됐다.

            첫날     max = 마지막 날
            마지막날 min = 첫날

          여행을 다음 달로 옮기려고 첫날을 먼저 누르면 그 이후 날짜가 전부
          회색이라 탭이 안 먹는다. '마지막 날 → 첫날' 순서로만 되는데,
          그 순서를 알 길이 없다. 데스크톱은 타이핑으로 넘어가서 안 보였다.

          제약을 없애고, 순서가 뒤집히면 기간을 유지한 채 반대쪽을 같이
          옮긴다. 항공권 사이트들이 하는 방식이고 놀랄 일이 없다.
        */}
        <div className="date-pair">
          <Field label="스페인 첫날" hint="현지에 도착하는 날">
            <input
              type="date" value={basics.startDate}
              onChange={(e) => onChange(moveStart(basics, e.target.value))}
            />
          </Field>
          <Field label="스페인 마지막 날" hint="현지에서 떠나는 날">
            <input
              type="date" value={basics.endDate}
              onChange={(e) => onChange(moveEnd(basics, e.target.value))}
            />
          </Field>
        </div>
        <p className="help">
          현지에서 {days}일 {nights}박입니다.
          {' '}<b>한국 도착일이 아니라 스페인을 떠나는 날</b>을 넣으세요 —
          귀국편은 다음 날 한국에 내립니다.
        </p>

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
        {/*
          공항을 고른 뒤에만 보여 줬더니, 새로고침하고 들어온 사람에게는
          시간 칸이 아예 없었다. 안내는 "출발 시각을 넣으면 자동으로
          정해집니다" 라고 하는데 그 칸이 화면에 없는 상태였다 —
          있지도 않은 칸을 가리킨 것이다.

          언제나 보여 주고, 공항이 없으면 왜 아직 계산에 못 쓰는지 적는다.
          숨기는 대신 이유를 말한다.
        */}
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
        {!inAirport && !outAirport && (basics.arrivalTime || basics.departureTime) && (
          <p className="help" style={{ marginTop: -6 }}>
            <b>아래에서 공항을 고르면</b> 입국심사와 공항 이동 시간까지 넣어
            실제로 쓸 수 있는 날을 계산합니다.
          </p>
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
                onClick={() => { mark(`지역 ${isOpen ? '접기' : '펴기'} ${region.id}`); setOpenRegion(isOpen ? null : region.id); }}
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

      {selected.length > 0 && itinerary && !isOff('preview') && (
        <BasePlan itinerary={itinerary} cities={cities} />
      )}
    </>
  );
}
