import type { Airport } from './airports';
import type { City } from '../types';
import { distanceKm } from './geo';

/**
 * 공항에서 잡아먹는 시간.
 *
 * ## 왜 필요한가
 *
 * 계획이 달력 날짜만 세고 있었다. 11일이면 11일치를 짰다. 그런데 첫날
 * 오후 4시에 착륙하면 그날은 저녁 한 끼가 전부이고, 마지막 날 낮 12시
 * 비행기면 아침에 짐을 끌고 공항으로 가야 한다. 실제로 쓸 수 있는 날은
 * 11일이 아니라 9일 남짓인데, 앱은 11일치를 담으라고 했다.
 *
 * 공항은 착륙과 이륙 사이에만 있는 것이 아니다. 입국심사와 수하물, 시내로
 * 들어가는 이동, 돌아갈 때의 체크인과 보안 — 이 시간들이 여행의 앞뒤를
 * 반나절씩 먹는다.
 *
 * ## 값의 근거
 *
 * 체크인 권장 시각은 항공사와 공항이 공지하는 값을 따랐다 — 장거리
 * 국제선 3시간, 셍겐 안 단거리 2시간. 수하물 접수는 출발 45~60분 전에
 * 닫히므로 그보다 여유가 있어야 한다.
 *
 * 공항~시내 이동은 좌표 사이 거리에서 계산한다(18분 + km당 1.5분).
 * 실제로 알려진 값과 맞춰 정한 식이다 — 마드리드 40분(실제 40), 바르셀로나
 * 37분(35), 그라나다 42분(45), 빌바오 25분(25). 평균 오차 4분이다.
 *
 * 전부 추정이므로 화면에서는 내역을 펼쳐 보여 준다. 사용자가 자기 항공권을
 * 보고 판단할 수 있어야 한다.
 */

export const AIRPORT_TIME = {
  /** 착륙 후 입국심사·수하물·세관. 셍겐 밖(한국)에서 바로 들어올 때. */
  entryDirect: 55,
  /** 유럽 어딘가에서 갈아타고 들어오면 입국심사는 거기서 끝났다. */
  entryConnecting: 30,
  /** 짐을 숙소에 두고 나오는 시간. */
  dropBags: 30,
  /** 장거리 국제선 권장 도착 — 항공사 공지 기준 3시간. */
  checkInLongHaul: 180,
  /** 셍겐 안 단거리 — 2시간. */
  checkInShortHaul: 120,
};

/** 공항 ↔ 시내 이동(분). 좌표 거리에서 계산한다. */
export function transferMin(airport: Airport, city: City | undefined): number {
  if (!city) return 45;
  const km = distanceKm({ lat: airport.lat, lon: airport.lon }, { lat: city.lat, lon: city.lon });
  return Math.round(18 + km * 1.5);
}

export interface AirportLeg {
  /** 공항 ↔ 시내 이동(분). */
  transfer: number;
  /** 공항 안에서 쓰는 시간(입국 절차 또는 체크인·보안). */
  process: number;
  /** 합계(분). */
  total: number;
  /** 왜 이 값인지 한 줄. */
  note: string;
}

/**
 * 도착일 — 착륙하고 실제로 일정을 시작할 수 있는 시각.
 *
 * 인천 직항이 있는 공항(마드리드·바르셀로나)은 셍겐 밖에서 바로 들어오는
 * 경우로 보아 입국심사를 넉넉히 잡고, 나머지는 유럽 어딘가에서 갈아타고
 * 오므로 심사가 이미 끝난 것으로 본다. 표를 보고 다르면 화면에서 시각을
 * 조정하면 된다.
 */
export function arrivalLeg(airport: Airport, city: City | undefined): AirportLeg {
  const process = airport.direct ? AIRPORT_TIME.entryDirect : AIRPORT_TIME.entryConnecting;
  const transfer = transferMin(airport, city);
  return {
    transfer,
    process,
    total: process + transfer + AIRPORT_TIME.dropBags,
    note: airport.direct
      ? `입국심사·수하물 ${process}분 + 시내 이동 ${transfer}분 + 짐 풀기 ${AIRPORT_TIME.dropBags}분`
      : `수하물·출구 ${process}분 + 시내 이동 ${transfer}분 + 짐 풀기 ${AIRPORT_TIME.dropBags}분 (유럽 경유 입국 기준)`,
  };
}

/**
 * 출국일 — 마지막 일정을 끝내야 하는 시각까지 얼마가 필요한가.
 *
 * @param city    마지막 날 실제로 있는 도시. 공항이 있는 도시와 다를 수 있다.
 * @param interMin 그 도시에서 공항 도시까지 가는 시간(분). 같은 도시면 0.
 *
 * 왕복 항공권으로 마드리드로 돌아가는 일정에서 마지막 날을 세비야에서
 * 보내면, 공항까지는 40분이 아니라 세비야→마드리드 열차까지 얹은 시간이다.
 * 이것을 빼먹으면 비행기를 놓친다.
 */
export function departureLeg(
  airport: Airport, city: City | undefined, interMin = 0,
): AirportLeg {
  const process = airport.direct ? AIRPORT_TIME.checkInLongHaul : AIRPORT_TIME.checkInShortHaul;
  const local = transferMin(airport, city);
  const transfer = local + interMin;
  const head = interMin > 0
    ? `도시 간 이동 ${interMin}분 + 공항 이동 ${local}분`
    : `공항 이동 ${local}분`;
  return {
    transfer,
    process,
    total: process + transfer,
    note: airport.direct
      ? `${head} + 체크인·보안·출국심사 ${process}분 (장거리 국제선 3시간 권장)`
      : `${head} + 체크인·보안 ${process}분 (셍겐 안 단거리 2시간 권장)`,
  };
}

/** 'HH:MM' → 분. 잘못된 값이면 null. */
export function parseHm(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const fmtHm = (min: number): string =>
  `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface TripWindow {
  /** 첫날 일정을 시작할 수 있는 시각(분). 도착 시각을 모르면 null. */
  firstDayStart: number | null;
  /** 마지막 날 일정을 끝내야 하는 시각(분). 출발 시각을 모르면 null. */
  lastDayEnd: number | null;
  arrival: AirportLeg | null;
  departure: AirportLeg | null;
  /**
   * 달력 일수에서 공항에 먹히는 만큼을 뺀 값.
   * 하루 활동 가능 시간을 기준으로 잰다.
   */
  usableDays: number;
  /** 공항에 먹히는 날(소수). 화면에 '0.9일이 공항에 들어갑니다' 로 쓴다. */
  lostDays: number;
}

/**
 * 실제로 쓸 수 있는 날을 센다.
 *
 * @param dayStart 하루가 시작되는 시각(분). 취향의 '아침 시작' 설정에서 온다.
 * @param dayEnd   하루가 끝나는 시각(분). 저녁 일정까지 포함한 현실적인 끝.
 */
export function tripWindow(
  calendarDays: number,
  arrivalAt: number | null, departureAt: number | null,
  inLeg: AirportLeg | null, outLeg: AirportLeg | null,
  dayStart: number, dayEnd: number,
): TripWindow {
  const dayLen = Math.max(60, dayEnd - dayStart);

  let firstDayStart: number | null = null;
  let lostFirst = 0;
  if (arrivalAt !== null && inLeg) {
    firstDayStart = arrivalAt + inLeg.total;
    // 하루 중 앞쪽에서 잘려 나가는 몫.
    lostFirst = Math.min(1, Math.max(0, (firstDayStart - dayStart) / dayLen));
  }

  let lastDayEnd: number | null = null;
  let lostLast = 0;
  if (departureAt !== null && outLeg) {
    lastDayEnd = departureAt - outLeg.total;
    lostLast = Math.min(1, Math.max(0, (dayEnd - lastDayEnd) / dayLen));
  }

  const lost = Math.round((lostFirst + lostLast) * 10) / 10;
  return {
    firstDayStart,
    lastDayEnd,
    arrival: inLeg,
    departure: outLeg,
    usableDays: Math.max(0.5, Math.round((calendarDays - lost) * 10) / 10),
    lostDays: lost,
  };
}

/**
 * 화면이 그대로 쓰는 형태.
 * TripWindow 에 공항 이름과 사용자가 넣은 시각을 얹은 것이다.
 */
export interface AirportInfo extends TripWindow {
  arrivalTime: string | null;
  departureTime: string | null;
  arrivalAirport: string | null;
  departureAirport: string | null;
}
