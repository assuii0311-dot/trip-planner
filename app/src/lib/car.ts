import type { City } from '../types';
import type { Hop, Stop } from './itinerary';
import type { Service } from './routing';

/**
 * 렌터카만 따로 보는 이유.
 *
 * 교통 엔진은 구간마다 '문앞~문앞 시간' 으로 수단을 고른다. 그 기준에서
 * 렌터카는 기다리지 않으므로 거의 항상 이긴다 — 실제로 도시 쌍 1,770 개 중
 * 1,072 개(60.6%)에서 1순위다. 그런데 그 차이는 대개 4~40분이고, 값은
 * 서너 배다(바르셀로나→빅: 4분 빠르고 €43 대 €10).
 *
 * 게다가 렌터카는 구간이 아니라 여행 전체에 걸리는 결정이다.
 *
 *  - 빌린 곳과 반납한 곳이 다르면 편도 반납료가 붙는다. 이것은 구간이
 *    아니라 대여 한 건에 한 번 붙는다.
 *  - 중간에 이틀을 한 도시에 머물면 그동안에도 대여료와 주차비를 낸다.
 *    구간별 비용에는 이 날들이 잡히지 않는다.
 *  - 도심 주차는 비싸고, 구시가는 대개 차가 못 들어간다.
 *
 * 그래서 구간별 비교와 별도로 '이번 여행에서 차를 빌리면 어떻게 되는가' 를
 * 한 덩어리로 계산해 보여 준다.
 */

/**
 * 편도 반납료(유로) 추정 범위.
 *
 * 조사한 값: 스페인 국내 편도 반납료는 대개 €50~150 이다. 같은 지역 안
 * 반납은 낮고 지역을 건너면 높다. 방향에 따라 달라지기도 한다 — 업체가
 * 차를 되돌려야 하는 방향(예: 말라가로 돌아가는 편)은 무료인 경우도 있다.
 * 업체 간 편차가 커서 같은 구간이 €0 인 곳과 €200 인 곳이 함께 있다.
 *
 * 그래서 하나의 숫자로 단정하지 않고 범위로만 말한다.
 */
export interface DropFee {
  lo: number;
  hi: number;
  /** 같은 권역 안 반납인가. 권역을 건너면 비싸진다. */
  sameRegion: boolean;
}

export function dropFee(from: City, to: City): DropFee | null {
  if (from.slug === to.slug) return null;
  const sameRegion = from.macroRegion === to.macroRegion;
  return sameRegion ? { lo: 30, hi: 80, sameRegion } : { lo: 60, hi: 150, sameRegion };
}

/** 도심 주차 하루치(유로). 공영 주차장 기준 대략값. */
export const PARKING_PER_DAY = 25;

export interface CarLeg {
  from: City;
  to: City;
  car: Service;
  /** 렌터카가 아닌 대안 중 가장 빠른 것. 없으면 null(섬 구간 등). */
  alt: Service | null;
  /** 대안으로 바꾸면 몇 분 더 걸리는가. 음수면 대안이 더 빠르다. */
  slowerMin: number;
  /** 대안으로 바꾸면 얼마를 아끼는가(구간 요금 기준, 1인). */
  savesEur: number;
}

export interface CarPlan {
  legs: CarLeg[];
  pickUp: City;
  dropOff: City;
  /** 빌린 곳과 반납한 곳이 다른가. */
  oneWay: boolean;
  fee: DropFee | null;
  /** 차를 쥐고 있는 날. 첫 구간부터 마지막 구간까지의 달력 일수. */
  heldDays: number;
  /** 그중 이동하지 않고 세워 두기만 하는 날. */
  idleDays: number;
  /** 구간 요금 합계(연료·통행료·일일 렌트비 분담). */
  legCostEur: number;
  /** 세워 두는 날의 주차비 추정. */
  parkingEur: number;
  /** 전부 대안으로 바꾸면 더 걸리는 시간(분). */
  totalSlowerMin: number;
}

/**
 * 이번 여정에서 렌터카가 쓰이는 부분을 한 덩어리로 계산한다.
 * 렌터카 구간이 없으면 null.
 */
export function carPlanOf(hops: Hop[], stops: Stop[]): CarPlan | null {
  const legs: CarLeg[] = [];
  for (const h of hops) {
    if (h.chosen.mode !== 'car') continue;
    const alt = h.options.find((o) => o.mode !== 'car') ?? null;
    legs.push({
      from: h.from,
      to: h.to,
      car: h.chosen,
      alt,
      slowerMin: alt ? alt.totalMin - h.chosen.totalMin : 0,
      savesEur: alt ? h.chosen.costEur - alt.costEur : 0,
    });
  }
  if (!legs.length) return null;

  const pickUp = legs[0].from;
  const dropOff = legs[legs.length - 1].to;

  /*
   * 차를 쥐고 있는 날 — 첫 구간이 있는 도시부터 마지막 구간이 닿는 도시까지.
   * 그 사이 도시에서 며칠을 묵든 차는 계속 빌린 상태다. 이 날들이 구간별
   * 비교에서 통째로 빠져 있었다.
   */
  const firstIdx = stops.findIndex((s) => s.city.slug === pickUp.slug);
  const lastIdx = stops.findIndex((s) => s.city.slug === dropOff.slug);
  const span = firstIdx >= 0 && lastIdx > firstIdx ? stops.slice(firstIdx, lastIdx + 1) : [];
  const heldDays = Math.max(legs.length, span.reduce((a, s) => a + (s.sleep ? s.nights : 1), 0));
  const idleDays = Math.max(0, heldDays - legs.length);

  return {
    legs,
    pickUp,
    dropOff,
    oneWay: pickUp.slug !== dropOff.slug,
    fee: dropFee(pickUp, dropOff),
    heldDays,
    idleDays,
    legCostEur: legs.reduce((a, l) => a + l.car.costEur, 0),
    parkingEur: idleDays * PARKING_PER_DAY,
    totalSlowerMin: legs.reduce((a, l) => a + (l.alt ? l.slowerMin : 0), 0),
  };
}

/**
 * 렌터카를 두고 알아 둘 것.
 *
 * 겁을 주려는 것이 아니라, 구간 비교에 안 잡히는 것만 적는다.
 * ZBE(저공해구역)는 넣지 않는다 — 스페인에서 빌린 차는 DGT 환경 라벨을
 * 이미 달고 나오므로 관광객이 따로 등록할 일이 없다. 실제로 걸리는 것은
 * 구시가 진입 제한과 주차다.
 */
export function carNotes(plan: CarPlan): string[] {
  const out: string[] = [];
  if (plan.oneWay && plan.fee) {
    out.push(
      `${plan.pickUp.name}에서 빌려 ${plan.dropOff.name}에서 반납하면 편도 반납료가 붙습니다. `
      + `대개 €${plan.fee.lo}~${plan.fee.hi}${plan.fee.sameRegion ? '' : ' (권역을 건너므로 높은 쪽)'}이고, `
      + '업체와 방향에 따라 €0 인 곳도 €200 인 곳도 있습니다. 예약 화면에서 반납지를 넣고 총액으로 비교하세요.',
    );
  }
  if (plan.idleDays > 0) {
    out.push(
      `이동하지 않는 ${plan.idleDays}일 동안에도 대여료가 나갑니다. `
      + `도심 주차장은 하루 €${PARKING_PER_DAY} 안팎이라 세워 두는 값만 €${plan.parkingEur} 정도입니다.`,
    );
  }
  out.push('스페인 구시가는 대부분 차가 들어갈 수 없습니다. 숙소에 주차가 되는지 예약 전에 확인하세요.');
  return out;
}
