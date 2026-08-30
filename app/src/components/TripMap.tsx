import type { City, Item, Plan } from '../types';
import { SPAIN_OUTLINE } from '../lib/spain-outline';

/**
 * 여행 전체를 스페인 지도 한 장에 그린다.
 *
 * 일자별 목록만으로는 "이 여행이 나라 안에서 어떻게 생겼는지" 가 보이지
 * 않는다. 어디를 얼마나 머물고 무엇을 타고 옮기는지를 한눈에 보려면
 * 지도가 있어야 한다.
 *
 * SVG 로 직접 그린다. 지도 타일을 쓰면 오프라인에서 비고, 타일 제공자의
 * 약관과 저작자 표시가 따라붙는다. 국경선은 Natural Earth 퍼블릭 도메인
 * 데이터라 그런 제약이 없다.
 *
 * 카나리아 제도는 본토에서 1,000km 넘게 떨어져 있어 같은 축척으로 그리면
 * 본토가 손톱만해진다. 지도에서 흔히 하듯 따로 떼어 왼쪽 아래에 넣는다.
 */

/** 화면 좌표계. 메르카토르는 위도 36~44 구간에서 과하므로 등장방형으로 충분하다. */
const PAD = 16;

interface Placed { city: City; x: number; y: number }

export interface MapStop {
  city: City;
  /** 이 도시에서 보내는 일수. */
  days: number;
  /** 여기서 자는가. */
  sleep: boolean;
  /** 이 도시에서 볼 아이템. */
  items: Item[];
  /** 여정에서 몇 번째인가. */
  order: number;
}

export interface MapHop {
  from: string;
  to: string;
  icon: string;
  label: string;
  minutes: number;
}

export function TripMap({
  stops, hops, width = 340,
}: { stops: MapStop[]; hops: MapHop[]; width?: number }) {
  // 본토만으로 축척을 잡는다. 섬은 따로 그린다.
  const mainland = stops.filter((s) => s.city.lon > -12);
  const islands = stops.filter((s) => s.city.lon <= -12);

  // 스페인 본토 경계에 맞춘 고정 범위. 도시 위치에 따라 축척이 흔들리면
  // 여행마다 지도 모양이 달라져 비교가 안 된다.
  const LON = [-9.6, 4.5];
  const LAT = [35.6, 44.2];
  const w = width - PAD * 2;
  const h = Math.round(w * ((LAT[1] - LAT[0]) / (LON[1] - LON[0])) * 0.78);
  const px = (lon: number) => PAD + ((lon - LON[0]) / (LON[1] - LON[0])) * w;
  const py = (lat: number) => PAD + ((LAT[1] - lat) / (LAT[1] - LAT[0])) * h;

  const placed: Placed[] = mainland.map((s) => ({ city: s.city, x: px(s.city.lon), y: py(s.city.lat) }));
  const at = new Map(placed.map((p) => [p.city.slug, p]));

  const height = h + PAD * 2;
  const path = (poly: [number, number][]) =>
    `${poly.map(([lo, la], i) => `${i ? 'L' : 'M'}${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join('')}Z`;

  return (
    <svg
      className="trip-map" viewBox={`0 0 ${width} ${height}`}
      width="100%" role="img"
      aria-label={`여행 경로 지도: ${stops.map((s) => s.city.name).join(' → ')}`}
    >
      {/* 국경선 — 본토와 발레아레스만. 카나리아는 범위 밖이라 자동으로 빠진다. */}
      <g className="map-land">
        {SPAIN_OUTLINE.map((poly, i) => <path key={i} d={path(poly)} />)}
      </g>

      {/* 이동 경로 */}
      <g className="map-route">
        {hops.map((hp) => {
          const a = at.get(hp.from);
          const b = at.get(hp.to);
          if (!a || !b) return null;
          return (
            <line key={`${hp.from}-${hp.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          );
        })}
      </g>

      {/* 이동 수단 아이콘 — 경로 가운데에 */}
      <g className="map-mode">
        {hops.map((hp) => {
          const a = at.get(hp.from);
          const b = at.get(hp.to);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={`m-${hp.from}-${hp.to}`}>
              <circle cx={mx} cy={my} r="9" />
              <text x={mx} y={my + 3.5} textAnchor="middle">{hp.icon}</text>
            </g>
          );
        })}
      </g>

      {/* 도시 */}
      <g className="map-city">
        {mainland.map((s) => {
          const p = at.get(s.city.slug)!;
          return (
            <g key={s.city.slug}>
              <circle
                cx={p.x} cy={p.y} r={s.sleep ? 6.5 : 4.5}
                className={s.sleep ? 'is-sleep' : 'is-trip'}
              />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="map-name">
                {s.city.name}
              </text>
              <text x={p.x} y={p.y + 17} textAnchor="middle" className="map-days">
                {s.sleep ? `${s.days}일` : '당일'}
              </text>
            </g>
          );
        })}
      </g>

      {islands.length > 0 && (
        <g className="map-islands">
          <text x={PAD} y={height - 8}>
            ✈ 카나리아 제도: {islands.map((s) => `${s.city.name}(${s.sleep ? `${s.days}일` : '당일'})`).join(' · ')}
          </text>
        </g>
      )}
    </svg>
  );
}

/** 지도 아래에 붙는 도시별 상세 — 무엇을 보는지까지 한 장에 담는다. */
export function TripMapLegend({ stops, hops }: { stops: MapStop[]; hops: MapHop[] }) {
  const hopFrom = new Map(hops.map((h) => [h.from, h]));
  return (
    <ol className="map-legend">
      {stops.map((s) => {
        const next = hopFrom.get(s.city.slug);
        return (
          <li key={s.city.slug}>
            <div className="leg-head">
              <span className="leg-no">{s.order}</span>
              <span className="leg-city">{s.city.name}</span>
              <span className={`leg-stay${s.sleep ? '' : ' is-trip'}`}>
                {s.sleep ? `${s.days}일 머묾 · 숙박` : '당일치기'}
              </span>
            </div>
            {s.items.length > 0 && (
              <div className="leg-items">
                {s.items.map((i) => <span key={i.id} className="tag">{i.name}</span>)}
              </div>
            )}
            {next && (
              <div className="leg-hop">
                {next.icon} {next.label} · {Math.floor(next.minutes / 60)}시간
                {next.minutes % 60 ? ` ${next.minutes % 60}분` : ''}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 계획에서 지도에 필요한 것만 뽑는다. */
export function mapDataOf(plan: Plan, cities: City[]): { stops: MapStop[]; hops: MapHop[] } {
  const cityOf = (slug: string) => cities.find((c) => c.slug === slug);
  const order: string[] = [];
  const days = new Map<string, number>();
  const sleep = new Map<string, boolean>();
  const items = new Map<string, Item[]>();
  const hops: MapHop[] = [];

  for (const d of plan.days) {
    if (!order.includes(d.city)) order.push(d.city);
    days.set(d.city, (days.get(d.city) ?? 0) + 1);
    if (!sleep.has(d.city)) sleep.set(d.city, false);
    if (d.sleepAt === d.city) sleep.set(d.city, true);
    const list = items.get(d.city) ?? [];
    list.push(...d.entries.filter((e) => e.item.city === d.city).map((e) => e.item));
    items.set(d.city, list);
    if (d.travel) {
      hops.push({
        from: d.travel.from,
        to: d.travel.to,
        icon: d.travel.chosen.icon,
        label: d.travel.chosen.label,
        minutes: d.travel.arriveAt - d.travel.leaveAt,
      });
    }
  }

  const stops: MapStop[] = order
    .map((slug, i) => {
      const c = cityOf(slug);
      if (!c) return null;
      return {
        city: c,
        days: days.get(slug) ?? 1,
        sleep: sleep.get(slug) ?? false,
        items: items.get(slug) ?? [],
        order: i + 1,
      };
    })
    .filter((s): s is MapStop => s !== null);

  return { stops, hops };
}
