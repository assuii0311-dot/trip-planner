/**
 * 명성(`popularity`) 을 정하는 규칙이 한 곳에만 있고, 세는 대상이
 * 위키백과 언어판인가.
 *
 * ## 왜 이 검사가 있나
 *
 * 두 번 어긋난 적이 있다.
 *
 * 1. **표가 둘이었다.** `enrich.mjs`(위키보이지 경로)는 `3 미만 → 1` 이
 *    있었고 `wdnearby.mjs`(위키데이터 경로)는 없어서 `그 외 2` 였다.
 *    같은 곳이 어느 경로로 들어왔느냐에 따라 1 이 되기도 2 가 되기도 했다.
 * 2. **세는 대상이 달랐다.** 주석은 '위키백과 언어판 수' 라고 적어 두고
 *    코드는 sitelink 를 전부 셌다. 실측하니 볼거리 1,064곳 중 917곳(86%)
 *    이 커먼즈 하나로 +1, 등급이 부풀어 있던 것이 256곳(24%)이었다.
 *    특히 위키보이지 sitelink 까지 세어, **이 앱이 읽는 가이드에 실렸다는
 *    이유로 명성을 얹어 주고** 있었다.
 *
 * 둘 다 조용한 고장이다 — 값이 그럴듯해서 눈으로는 안 보인다.
 *
 *   node pipeline/popularity-check.mjs
 */
import { readFileSync } from 'node:fs';
import { popularityOf, wikipediaEditions } from './src/enrich.mjs';

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

console.log('■ 명성 규칙');

/* ① 백과사전이 아닌 것은 세지 않는다. */
const keys = ['enwiki', 'eswiki', 'zh_yuewiki', 'simplewiki', 'commonswiki', 'specieswiki',
  'eswikivoyage', 'enwikiquote', 'enwikinews', 'frwikisource', 'wikidatawiki'];
check('위키백과 언어판만 센다', wikipediaEditions(keys) === 4,
  `${wikipediaEditions(keys)}개 (en·es·zh_yue·simple 만 · 커먼즈/위키보이지/인용집/뉴스 제외)`);
check('위키보이지 sitelink 는 명성이 아니다', wikipediaEditions(['enwiki', 'eswikivoyage']) === 1);

/* ② 칸막이. 경계값을 양쪽에서 짚는다. */
const table = [[0, 1], [2, 1], [3, 2], [6, 2], [7, 3], [17, 3], [18, 4], [39, 4], [40, 5], [200, 5]];
check('등급표가 경계에서 맞는다', table.every(([n, want]) => popularityOf(n) === want),
  table.map(([n, w]) => `${n}→${popularityOf(n)}(${w})`).join(' '));

/* ③ 표가 하나뿐인가 — 예전에 갈라졌던 자리를 글자로 확인한다. */
const wd = readFileSync(new URL('./src/wdnearby.mjs', import.meta.url), 'utf8');
check('위키데이터 경로가 자기 등급표를 갖고 있지 않다', !/>=?\s*40\s*\?\s*5/.test(wd));
check('위키데이터 경로가 같은 함수를 쓴다', /sitelinksByWikidata/.test(wd) && /popularityOf/.test(wd));

const bad = results.filter((r) => !r).length;
console.log(bad ? `\n✗ ${bad}건 어긋남` : '\n✓ 명성 규칙 정상 — 한 곳에서 위키백과 언어판만 센다');
process.exit(bad ? 1 : 0);
