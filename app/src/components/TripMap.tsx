import { useCallback, useMemo, useRef, useState } from 'react';
import type { City, Item, Plan, PlanEntry } from '../types';
import { frameOf, outlineOf } from '../lib/outlines';
import { formatTime } from '../lib/planner';
import { ItemPhoto } from './ItemPhoto';

/**
 * 여행 전체를 지도 한 장에 그린다.
 *
 * SVG 로 직접 그린다. 지도 타일을 쓰면 오프라인에서 비고, 타일 제공자의
 * 약관과 저작자 표시가 따라붙는다. 국경선은 Natural Earth 퍼블릭 도메인
 * 데이터라 그런 제약이 없다.
 *
 * 처음에는 고정 크기로 그렸는데, 안달루시아처럼 도시가 몰린 여행에서는
 * 점과 이름이 겹쳐 무엇이 어디인지 읽을 수 없었다. 그래서
 *   - 점과 글자를 줄이고
 *   - 확대·축소와 끌기를 넣고
 *   - 도시를 누르면 그 도시 일정을 사진과 함께 아래에 펼치도록
 * 바꿨다. 겹치는 것은 확대해서 풀고, 자세한 것은 눌러서 본다.
 */

const PAD = 16;

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export interface MapStop {
  city: City;
  days: number;
  sleep: boolean;
  items: Item[];
  order: number;
  /** 이 도시에서 보내는 날들. 눌렀을 때 펼칠 일정. */
  schedule: { date: string; dayIndex: number; entries: PlanEntry[] }[];
}

export interface MapHop {
  from: string;
  to: string;
  icon: string;
  label: string;
  minutes: number;
  /** 거점에서 왕복하는 근교 구간인가. 짐을 옮기는 구간과 구분해 그린다. */
  dayTrip?: boolean;
}

export function TripMap({
  stops, hops, width = 340, country = 'spain',
}: { stops: MapStop[]; hops: MapHop[]; width?: number; country?: string }) {
  /*
   * 지도는 나라마다 다른 범위와 국경선을 쓴다. 예전에는 스페인 좌표가
   * 파일 맨 위에 상수로 박혀 있었다 — 나라가 둘이 되면 그 자리부터 막힌다.
   */
  const outline = useMemo(() => outlineOf(country), [country]);
  const frame = useMemo(
    () => frameOf(country, stops.map((s) => ({ lat: s.city.lat, lon: s.city.lon }))),
    [country, stops],
  );
  const LON = frame.lon;
  const LAT = frame.lat;
  const far = frame.farLon ?? -Infinity;
  const mainland = useMemo(() => stops.filter((s) => s.city.lon > far), [stops, far]);
  const islands = useMemo(() => stops.filter((s) => s.city.lon <= far), [stops, far]);

  const w = width - PAD * 2;
  const h = Math.round(w * ((LAT[1] - LAT[0]) / (LON[1] - LON[0])) * 0.78);
  const height = h + PAD * 2;
  const px = useCallback((lon: number) => PAD + ((lon - LON[0]) / (LON[1] - LON[0])) * w, [w]);
  const py = useCallback((lat: number) => PAD + ((LAT[1] - lat) / (LAT[1] - LAT[0])) * h, [h]);

  /**
   * 처음 보여 줄 영역 — 고른 도시들이 화면을 채우게 맞춘다.
   *
   * 예전에는 언제나 스페인 전도로 시작했다. 마드리드에 묵으며 톨레도·
   * 세고비아를 다녀오는 계획은 세 도시가 반경 70km 안에 몰려 있어, 점과
   * 이름이 서로 겹쳐 아무것도 읽을 수 없었다. 거점 하나에 근교를 붙이는
   * 여행이 이제 가장 흔한 모양이므로, 그 경우가 기본이 되어야 한다.
   */
  const home = useMemo(() => {
    if (mainland.length === 0) return { x: 0, y: 0, z: 1 };
    const xs = mainland.map((s) => px(s.city.lon));
    const ys = mainland.map((s) => py(s.city.lat));
    /*
     * 이름표와 아이콘이 들어갈 여백. 도시가 하나뿐이면 넉넉히 둔다.
     * 여백을 크게 잡으면 그만큼 덜 확대되는데, 글자는 확대해도 화면에서
     * 같은 크기이므로(1/z 로 줄인다) 확대할수록 이름표가 서로 떨어진다.
     * 그래서 여백은 최소로 두는 편이 읽기에 낫다.
     */
    const m = mainland.length === 1 ? 90 : 24;
    const x0 = Math.min(...xs) - m;
    const x1 = Math.max(...xs) + m;
    const y0 = Math.min(...ys) - m;
    const y1 = Math.max(...ys) + m;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
      Math.min(width / Math.max(1, x1 - x0), height / Math.max(1, y1 - y0))));
    const vw = width / z;
    const vh = height / z;
    return {
      z,
      x: Math.min(width - vw, Math.max(0, (x0 + x1) / 2 - vw / 2)),
      y: Math.min(height - vh, Math.max(0, (y0 + y1) / 2 - vh / 2)),
    };
  }, [mainland, px, py, width, height]);

  /** 보이는 영역. 확대·끌기는 이것만 바꾼다. */
  const [view, setView] = useState(home);
  // 도시가 바뀌면 다시 맞춘다. 사용자가 확대해 둔 것을 덮지 않도록 키로 건다.
  const fitted = useRef('');
  const fitKey = mainland.map((s) => s.city.slug).join(',');
  if (fitted.current !== fitKey) { fitted.current = fitKey; if (view !== home) setView(home); }
  const [picked, setPicked] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinch = useRef<{ dist: number; z: number } | null>(null);

  const clamp = useCallback((v: { x: number; y: number; z: number }) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z));
    const vw = width / z;
    const vh = height / z;
    return {
      z,
      x: Math.min(width - vw, Math.max(0, v.x)),
      y: Math.min(height - vh, Math.max(0, v.y)),
    };
  }, [width, height]);

  /** 화면의 한 점을 기준으로 확대한다. 그 점이 제자리에 있어야 자연스럽다. */
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor));
      const k = 1 / v.z - 1 / z;
      return clamp({ z, x: v.x + cx * k, y: v.y + cy * k });
    });
  }, [clamp]);

  /** 화면 좌표를 지도 좌표로. 확대돼 있어도 맞아야 한다. */
  const toMap = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * width,
      y: ((clientY - r.top) / r.height) * height,
    };
  };

  const at = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const s of mainland) m.set(s.city.slug, { x: px(s.city.lon), y: py(s.city.lat) });
    return m;
  }, [mainland, px, py]);

  const path = (poly: [number, number][]) =>
    `${poly.map(([lo, la], i) => `${i ? 'L' : 'M'}${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join('')}Z`;

  // 확대할수록 점과 글자를 줄여, 화면에서 보이는 크기를 일정하게 유지한다.
  const k = 1 / view.z;
  const chosen = stops.find((s) => s.city.slug === picked) ?? null;

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        className="trip-map"
        viewBox={`${view.x} ${view.y} ${width / view.z} ${height / view.z}`}
        width="100%" role="img"
        aria-label={`여행 경로 지도: ${stops.map((s) => s.city.name).join(' → ')}`}
        onWheel={(e) => {
          e.preventDefault();
          const p = toMap(e.clientX, e.clientY);
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = svgRef.current?.getBoundingClientRect();
          if (!r) return;
          const dx = ((e.clientX - drag.current.x) / r.width) * (width / view.z);
          const dy = ((e.clientY - drag.current.y) / r.height) * (height / view.z);
          setView(clamp({ z: view.z, x: drag.current.vx - dx, y: drag.current.vy - dy }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onTouchStart={(e) => {
          if (e.touches.length !== 2) return;
          const [a, b] = [e.touches[0], e.touches[1]];
          pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: view.z };
          drag.current = null;
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinch.current) return;
          const [a, b] = [e.touches[0], e.touches[1]];
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const p = toMap((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
          setView((v) => {
            const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.current!.z * (d / pinch.current!.dist)));
            const kk = 1 / v.z - 1 / z;
            return clamp({ z, x: v.x + p.x * kk, y: v.y + p.y * kk });
          });
        }}
        onTouchEnd={() => { pinch.current = null; }}
      >
        <g className="map-land">
          {outline.map((poly, i) => (
            <path key={i} d={path(poly)} strokeWidth={0.8 * k} />
          ))}
        </g>

        <g className="map-route">
          {hops.map((hp) => {
            const a = at.get(hp.from);
            const b = at.get(hp.to);
            if (!a || !b) return null;
            return (
              /*
                짐을 옮기는 구간은 굵은 실선에 가까운 파선으로, 거점에서 왕복만
                하는 근교는 가늘게 그린다. 같은 굵기로 그리면 마드리드에 계속
                묵는 여행이 도시 세 곳을 옮겨 다니는 것처럼 보인다.
              */
              <line
                key={`${hp.from}-${hp.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className={hp.dayTrip ? 'is-daytrip' : undefined}
                strokeWidth={(hp.dayTrip ? 0.9 : 1.6) * k}
                strokeDasharray={hp.dayTrip ? `${2 * k} ${2.6 * k}` : `${4 * k} ${3 * k}`}
              />
            );
          })}
        </g>

        <g className="map-mode">
          {hops.map((hp) => {
            const a = at.get(hp.from);
            const b = at.get(hp.to);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={`m-${hp.from}-${hp.to}`}>
                <circle cx={mx} cy={my} r={4.6 * k} strokeWidth={0.8 * k} />
                <text x={mx} y={my + 1.8 * k} textAnchor="middle" fontSize={5 * k}>{hp.icon}</text>
              </g>
            );
          })}
        </g>

        <g className="map-city">
          {mainland.map((s) => {
            const p = at.get(s.city.slug)!;
            const on = picked === s.city.slug;
            return (
              <g
                key={s.city.slug}
                className={`map-pin${on ? ' is-on' : ''}`}
                onClick={(e) => { e.stopPropagation(); setPicked(on ? null : s.city.slug); }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* 손가락으로 누를 수 있게 보이지 않는 넓은 과녁을 둔다. */}
                <circle cx={p.x} cy={p.y} r={11 * k} fill="transparent" />
                <circle
                  cx={p.x} cy={p.y} r={(s.sleep ? 3.6 : 2.6) * k}
                  strokeWidth={1.4 * k}
                  className={s.sleep ? 'is-sleep' : 'is-trip'}
                />
                <text
                  x={p.x} y={p.y - 6 * k} textAnchor="middle"
                  className="map-name" fontSize={6.2 * k}
                >
                  {s.city.name}
                </text>
                <text
                  x={p.x} y={p.y + 10 * k} textAnchor="middle"
                  className="map-days" fontSize={5.4 * k}
                >
                  {s.sleep ? `${s.days}일` : '당일'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="map-tools">
        <button type="button" aria-label="축소" onClick={() => zoomAt(1 / 1.4, width / 2, height / 2)}>−</button>
        <span className="map-zoom">{view.z.toFixed(1)}×</span>
        <button type="button" aria-label="확대" onClick={() => zoomAt(1.4, width / 2, height / 2)}>＋</button>
        <button type="button" className="map-reset" onClick={() => { setView(home); setPicked(null); }}>
          처음으로
        </button>
      </div>
      <p className="help map-hint">
        손가락으로 벌려 확대하거나 끌어서 움직일 수 있습니다. 도시를 누르면 그날 일정이 아래에 나옵니다.
      </p>

      {islands.length > 0 && (
        <p className="help" style={{ margin: '4px 0 0' }}>
          ✈ {frame.farLabel ?? '본토 밖'}: {islands.map((s) => `${s.city.name}(${s.sleep ? `${s.days}일` : '당일'})`).join(' · ')}
        </p>
      )}

      {chosen && <CityCard stop={chosen} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** 지도에서 도시를 눌렀을 때 나오는 그 도시의 일정. 사진을 함께 보여 준다. */
function CityCard({ stop, onClose }: { stop: MapStop; onClose: () => void }) {
  return (
    <div className="map-card">
      <div className="map-card-head">
        <span className="leg-no">{stop.order}</span>
        <span className="leg-city">{stop.city.name}</span>
        <span className={`leg-stay${stop.sleep ? '' : ' is-trip'}`}>
          {stop.sleep ? `${stop.days}일 머묾 · 숙박` : '당일치기'}
        </span>
        <button type="button" className="map-card-close" aria-label="닫기" onClick={onClose}>×</button>
      </div>
      {stop.schedule.map((d) => (
        <div className="map-card-day" key={d.date}>
          <div className="map-card-date">{d.dayIndex}일차 · {d.date}</div>
          {d.entries.length === 0
            ? <div className="help">이 날은 이동과 휴식입니다.</div>
            : (
              <ul className="map-card-list">
                {d.entries.map((e) => (
                  <li key={e.item.id}>
                    <ItemPhoto item={e.item} />
                    <div className="map-card-body">
                      <div className="map-card-time">{formatTime(e.startMin)}</div>
                      <div className="map-card-name">{e.item.name}</div>
                      {e.item.summary && <div className="map-card-sum">{e.item.summary}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ))}
    </div>
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
  const sched = new Map<string, MapStop['schedule']>();
  const hops: MapHop[] = [];

  for (const d of plan.days) {
    if (!order.includes(d.city)) order.push(d.city);
    days.set(d.city, (days.get(d.city) ?? 0) + 1);
    if (!sleep.has(d.city)) sleep.set(d.city, false);
    if (d.sleepAt === d.city) sleep.set(d.city, true);
    const list = items.get(d.city) ?? [];
    list.push(...d.entries.filter((e) => e.item.city === d.city).map((e) => e.item));
    items.set(d.city, list);
    const sc = sched.get(d.city) ?? [];
    sc.push({ date: d.date, dayIndex: d.dayIndex, entries: d.entries });
    sched.set(d.city, sc);
    // 하루에 두 번 옮기는 날이 있다. 전부 그린다.
    for (const t of d.travels) {
      if (t.kind !== 'move') continue;
      hops.push({
        from: t.from,
        to: t.to,
        icon: t.chosen.icon,
        label: t.chosen.label,
        minutes: t.arriveAt - t.leaveAt,
      });
    }
    /*
     * 근교 왕복도 실제로 타는 구간이다.
     *
     * 예전에는 거점 사이 이동(d.travel)만 그렸다. 그래서 마드리드에 묵으며
     * 톨레도·세고비아를 다녀오는 계획은 지도에 선이 하나도 없었다 - 실제로
     * 네 번을 타는데 지도에는 점 세 개만 있었다.
     */
    if (d.isDayTrip && d.returnTo && d.dayTripMode) {
      const key = `${d.returnTo}>${d.city}`;
      if (!hops.some((h) => `${h.from}>${h.to}` === key)) {
        hops.push({
          from: d.returnTo,
          to: d.city,
          icon: d.dayTripMode.icon,
          label: d.dayTripMode.label,
          minutes: d.dayTripMode.minutes,
          dayTrip: true,
        });
      }
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
        schedule: sched.get(slug) ?? [],
      };
    })
    .filter((s): s is MapStop => s !== null);

  return { stops, hops };
}
