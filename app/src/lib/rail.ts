/**
 * Renfe 실제 시간표.
 *
 * data.renfe.com 이 CC BY 4.0 으로 공개하는 고속·장거리·중거리 GTFS 를
 * 도시 쌍별 직통편으로 줄여 둔 것(pipeline/fetch-renfe-gtfs.mjs).
 * 원본 33MB → 92KB.
 *
 * 이것이 있는 구간은 추정을 쓰지 않는다. 첫차·막차·배차 간격으로 어림하던
 * 것이 실제 출발 시각 목록으로 바뀐다.
 *
 * 없는 구간(섬, 근교선, 환승이 필요한 조합)은 예전처럼 운행 패턴으로
 * 추정하고 화면에 추정임을 밝힌다.
 */

export interface RailDeparture {
  /** 출발 시각(분, 0시 기준). */
  d: number;
  /** 도착 시각(분). */
  a: number;
  /** 열차 종별 — AVE, AVLO, ALVIA, AVANT, EUROMED 등. */
  n: string;
  /** 운행 요일 비트마스크. 일=1, 월=2, 화=4 … 토=64. */
  w: number;
  /** 운휴 지정된 날짜 수. 잦으면 그대로 믿기 어렵다. */
  x: number;
}

export interface RailTable {
  source: string;
  license: string;
  url: string;
  fetchedAt: string;
  validFrom: string;
  validTo: string;
  note: string;
  cities: string[];
  pairs: Record<string, RailDeparture[]>;
}

let table: RailTable | null = null;

export function setRailTable(t: RailTable | null): void { table = t; }
export function railTable(): RailTable | null { return table; }

/** 이 구간의 실제 직통편. 없으면 null. */
export function railBetween(from: string, to: string): RailDeparture[] | null {
  const l = table?.pairs[`${from}>${to}`];
  return l && l.length ? l : null;
}

/**
 * 그 요일에 실제로 다니는 편만.
 * weekday 는 0=일요일. 모르면 요일을 따지지 않는다.
 */
export function railOnDay(list: RailDeparture[], weekday: number | null): RailDeparture[] {
  if (weekday === null) return list;
  return list.filter((r) => (r.w & (1 << weekday)) !== 0);
}

/** 시간표가 이 날짜를 덮는가. 지나면 다시 받아야 한다. */
export function railCovers(isoDate: string): boolean {
  if (!table) return false;
  const d = isoDate.replace(/-/g, '');
  return d >= table.validFrom && d <= table.validTo;
}
