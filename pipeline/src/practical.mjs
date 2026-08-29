// 아이템 설명을 4부분(요약/왜 가는가/실무 정보/주의점)으로 만든다.
//
// 원칙: 실무 정보는 '지어내지 않는다'.
// 요금·소요·휴관일은 수집한 구조화 필드(priceEur, durationMin, hours)에서
// 기계적으로 계산하고, 예약 필요 여부나 붐비는 시간처럼 출처가 말해주지 않는
// 항목은 사람이 pipeline/ko 에 적어 넣은 경우에만 넣는다.
// 비어 있는 편이, 그럴듯하게 틀린 것보다 낫다.

const DAYS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];
const DAY_KO = { M: '월', Tu: '화', W: '수', Th: '목', F: '금', Sa: '토', Su: '일' };
const DAY_RE = /\b(M|Tu|W|Th|F|Sa|Su)\b(?:\s*-\s*\b(M|Tu|W|Th|F|Sa|Su)\b)?/g;

/**
 * 영업시간 문자열에서 '한 번도 등장하지 않는 요일'을 휴무일로 본다.
 * "Tu-Su 09:30-20:00" → 월요일 휴무.
 * Daily / 요일 표기가 없는 문자열은 판단하지 않고 null 을 돌려준다.
 */
export function closedDays(hours) {
  if (!hours) return null;
  if (/\bdaily\b|\bevery day\b|24\s*\/\s*7|\bM-Su\b/i.test(hours)) return null;
  const open = new Set();
  for (const m of hours.matchAll(DAY_RE)) {
    const from = DAYS.indexOf(m[1]);
    const to = m[2] ? DAYS.indexOf(m[2]) : from;
    if (from < 0) continue;
    for (let i = from; ; i = (i + 1) % 7) {
      open.add(DAYS[i]);
      if (i === (to < 0 ? from : to)) break;
    }
  }
  if (open.size === 0 || open.size === 7) return null;
  const shut = DAYS.filter((d) => !open.has(d));
  // 주 5일 이상 닫는 곳은 표기가 불완전한 경우가 대부분이라 건드리지 않는다.
  if (shut.length > 3) return null;
  return `${shut.map((d) => DAY_KO[d]).join('·')}요일 휴무`;
}

/** 분 → '약 1시간 30분'. */
export function durationText(min) {
  const m = Math.round(min / 15) * 15;
  if (m < 60) return `약 ${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `약 ${h}시간 ${rest}분` : `약 ${h}시간`;
}

/** 유로 → '무료' / '€14' / null(정보 없음). */
export function priceText(eur) {
  if (eur === null || eur === undefined) return null;
  if (eur === 0) return '무료';
  return `€${eur}`;
}

/** 문장 하나로 줄인 목록용 요약. 손으로 쓴 summary 가 없을 때만 쓴다. */
export function firstSentence(text, max = 40) {
  if (!text) return '';
  const head = text.split(/(?<=[.!?。])\s|(?<=다)\.\s|\.\s/)[0].replace(/\s+/g, ' ').trim();
  const one = head.replace(/[.]$/, '');
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/**
 * 아이템 하나의 설명 4부분을 만든다.
 * override 는 pipeline/ko/<country>/<city>.json 의 항목.
 */
export function describe(item, override = {}) {
  const why = override.why ?? override.desc ?? item.desc ?? '';
  const summary = override.summary ?? firstSentence(why);
  const practical = {
    booking: override.booking ?? null,
    closed: override.closed ?? closedDays(item.hours),
    busy: override.busy ?? null,
    duration: durationText(item.durationMin),
    price: priceText(item.priceEur),
    hours: item.hours ?? null,
  };
  return { summary, why, practical, caution: override.caution ?? null };
}
