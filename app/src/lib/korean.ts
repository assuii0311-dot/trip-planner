/**
 * 한국어 조사를 앞말에 맞춰 고른다.
 *
 * 도시 이름이 데이터에서 오기 때문에 "코르도바은", "론다은" 같은 문장이
 * 그대로 화면에 나온다. 받침 유무로 조사를 정해야 읽을 수 있는 문장이 된다.
 */

/** 한글 음절의 종성 유무. 숫자와 알파벳으로 끝나는 경우도 발음으로 판단한다. */
function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;

  const code = last.charCodeAt(0);
  // 한글 음절 영역: 종성 인덱스가 0이 아니면 받침이 있다.
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;

  // 숫자는 읽는 소리로 판단한다. 1(일)·3(삼)·6(육)·7(칠)·8(팔)·0(영)은 받침이 있다.
  if (/[0-9]/.test(last)) return ['1', '3', '6', '7', '8', '0'].includes(last);

  // 알파벳은 관용 발음으로 판단한다. l, m, n, ng 로 끝나는 소리에 받침이 있다.
  if (/[a-zA-Z]/.test(last)) return ['l', 'm', 'n', 'g', 'b', 'k', 'p', 't', 'c', 'd'].includes(last.toLowerCase());

  return false;
}

type Pair = '은는' | '이가' | '을를' | '와과' | '으로로';

const PAIRS: Record<Pair, [string, string]> = {
  은는: ['은', '는'],
  이가: ['이', '가'],
  을를: ['을', '를'],
  와과: ['과', '와'],
  으로로: ['으로', '로'],
};

/** 조사만 돌려준다. `${city}${josa(city, '은는')}` 처럼 쓴다. */
export function josa(word: string, pair: Pair): string {
  const [withFinal, withoutFinal] = PAIRS[pair];
  // '으로/로'는 ㄹ 받침일 때 '로'를 쓴다.
  if (pair === '으로로') {
    const last = word.trim().slice(-1);
    const code = last.charCodeAt(0);
    const isRieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
    if (isRieul) return withoutFinal;
  }
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/** 단어와 조사를 붙여 돌려준다. */
export const withJosa = (word: string, pair: Pair): string => `${word}${josa(word, pair)}`;
