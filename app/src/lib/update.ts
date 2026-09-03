/**
 * 지금 돌고 있는 판이 서버에 올라간 판과 같은가.
 *
 * ## 왜 필요한가
 *
 * 사용자가 보내 준 진단에 이렇게 찍혔다.
 *
 *   화면판   assets/index-DvezZlkA.js          ← 서버에 올라간 것
 *   실행판   /trip-planner/assets/index-Ck8APwe9.js   ← 돌고 있는 것
 *
 * 두 판 뒤진 것을 쓰고 있었다. 아이패드 사파리는 탭을 그대로 되살리므로,
 * 앱을 '다시 열어도' 새로 받아오는 항해가 일어나지 않는다. 그러면 고쳐 놓은
 * 것이 영원히 도달하지 않는다 — 같은 문제를 계속 겪으면서.
 *
 * 그러니 앱이 스스로 확인하고 말해야 한다. 파일 이름에 내용 해시가 붙으므로
 * 문서를 한 번 받아 이름만 비교하면 된다.
 */

/** 지금 이 페이지가 실행 중인 번들 파일 이름. */
/*
 * 이 페이지를 띄운 진입 파일 이름.
 *
 * 예전에는 `index-*.js` 를 찾았다. 나라를 쪼개면서 페이지가 여럿이 되자
 * Vite 가 번들을 나눴고 이름이 `main-*.js`·`landing-*.js` 가 되었다 —
 * 이름을 박아 두었으면 낡은 판 알림이 **말없이 꺼졌을** 것이다. 그건
 * 사용자가 두 판 뒤진 것을 쓰면서 같은 문제를 계속 겪게 만든 바로 그 고장이다.
 * 그래서 이름을 찾지 않고, 문서가 실제로 부르는 진입 스크립트를 본다.
 */
const fileOf = (src: string): string => src.split('/').pop() ?? src;

/**
 * 문서가 부르는 진입 스크립트 전부를, 이름만 모아 한 줄로.
 *
 * 하나만 보면 안 된다. 지금 빌드는 진입 파일과 공통 덩어리 둘을 부르는데,
 * 앞의 것만 보면 공통 덩어리가 그대로일 때 진입 파일만 바뀐 배포를 놓친다.
 * 정렬해서 붙이므로 순서가 바뀌어도 같은 판은 같은 값이 된다.
 */
const joinNames = (srcs: string[]): string | null =>
  (srcs.length ? srcs.map(fileOf).sort().join(' · ') : null);

function runningBundle(): string | null {
  return joinNames([...document.querySelectorAll('script[type="module"][src]')]
    .map((el) => el.getAttribute('src') ?? '')
    .filter(Boolean));
}

/** HTML 글에서 진입 스크립트 주소를 모두 뽑는다. */
export function entrySrcs(html: string): string[] {
  const out: string[] = [];
  const tag = /<script\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html)) !== null) {
    const t = m[0];
    if (!/\btype=["']module["']/i.test(t)) continue;
    const src = t.match(/\bsrc=["']([^"']+)["']/i);
    if (src) out.push(src[1]);
  }
  return out;
}

/** 서버에 올라가 있는 번들 파일 이름들. */
async function servedBundle(): Promise<string | null> {
  // 캐시를 건너뛴다. 이 확인만큼은 반드시 서버에 물어야 한다.
  const res = await fetch(`${location.pathname}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return joinNames(entrySrcs(await res.text()));
}

/**
 * 새 판이 올라와 있으면 그 이름을 돌려준다. 같거나 확인할 수 없으면 null.
 *
 * 확인에 실패했다고 경고를 띄우지는 않는다 — 비행기 안에서 쓰는 사람에게
 * '확인 실패' 를 들이밀 이유가 없다.
 */
export async function newerBuild(): Promise<string | null> {
  try {
    const mine = runningBundle();
    if (!mine) return null;
    const theirs = await servedBundle();
    return theirs && theirs !== mine ? theirs : null;
  } catch {
    return null;
  }
}
