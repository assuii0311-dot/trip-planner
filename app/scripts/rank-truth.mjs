/**
 * 순위가 사람의 판단과 맞는가.
 *
 * ## 왜 이 검사가 필요한가
 *
 * 다른 검사들은 '끝나는가 · 안 사라지는가 · 어긋나지 않는가' 를 본다.
 * 그것들이 다 통과해도 **순위가 엉뚱하면** 사용자는 볼 만한 곳을 못 본다.
 * 그런데 순위는 눈으로 봐서는 옳은지 알 수 없다 — 스페인 도시 60곳의
 * 볼거리 1,640곳을 사람이 다시 매길 수는 없기 때문이다.
 *
 * ## 정답지
 *
 * 이 저장소에는 이미 사람의 판단이 있다 — 도시 등록부의 `highlights`
 * (도시마다 대표 3곳). 그것을 정답지로 쓴다. **순위 엔진이 쓸 만하다면
 * 사람이 꼽은 대표가 그 도시 순위의 위쪽에 있어야 한다.**
 *
 * ## must 를 빼고 재는 이유 — 순환을 피한다
 *
 * 점수의 `must` 항이 바로 그 `highlights` 로 만들어진다. 그대로 재면
 * '내가 넣은 것이 위에 있다' 는 동어반복이 된다. 그래서 `must` 를 뺀
 * 점수(`fame`·`vetted`·`purpose`)로 순위를 매기고, 나머지 신호가
 * **독립적으로** 대표를 알아보는지 본다.
 *
 * ## 이 검사가 잡는 것과 못 잡는 것
 *
 * ## 되돌려 확인한 것 — 무엇에 반응하고 무엇에 반응하지 않는가
 *
 * 순위를 일부러 망가뜨려 이 검사가 실제로 걸리는지 하나씩 확인했다.
 *
 * | 망가뜨린 것 | 걸리나 |
 * |---|---|
 * | `fame` 을 상수로 (명성 신호 제거) | ✓ 상위10% 49→32% |
 * | `fame` 가중 0.40 → 0.05 | ✓ 49→45% |
 * | 순위를 통째로 뒤집음 | ✓ 49→13% |
 * | `purpose` 보정 끄기 | ✗ 반응 없음 |
 * | `vetted` 의 `named`(한국어이름) 제거 | ✗ 반응 없음 |
 * | `vetted` 의 `guide`(출처) 제거 | ✗ 반응 없음 |
 *
 * **반응하지 않는 셋은 검사가 무뎌서가 아니다.** 따로 잰 결과 그 셋은
 * 순위를 거의 가르지 못한다 — `purpose` 는 실측 편차가 0.046 이고,
 * `named` 는 92% 가 이미 갖고 있어 상수나 마찬가지이며, `guide` 는
 * 대표든 아니든 80% 가 위키보이지 출처라 '볼 만한가' 를 구분하지 못한다.
 * 즉 **이 검사가 반응하지 않는 항은 순위 품질에 기여하지 않는 항이다.**
 * (자세한 것은 `docs/25-how-places-are-chosen.md`)
 *
 * 그 밖에 못 잡는 것 — `highlights` 에 없는 곳들 사이의 순서. 정답지가
 * 도시마다 세 곳뿐이라 그 아래는 사정권 밖이다.
 *
 *   npx tsx scripts/rank-truth.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { rankParts, isHighlight, RANK_WEIGHTS, RANK_FLOOR } from '../src/lib/rank.ts';
import { isMeal } from '../src/lib/capacity.ts';

const here = (p) => new URL(p, import.meta.url);
const country = process.argv[2] ?? 'spain';
const idx = JSON.parse(readFileSync(here(`../public/data/${country}/index.json`), 'utf8'));
const cities = idx.cities;
const load = (slug) => {
  const f = here(`../public/data/${country}/cities/${slug}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
};

const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };

/**
 * must 를 뺀 점수. 가중은 rank.ts 의 것을 그대로 쓴다 —
 * 여기에 숫자를 복사해 두면 본체를 고쳤을 때 검사가 조용히 딴 것을 잰다.
 */
function blindScore(item, city) {
  const p = rankParts(item, city);
  return (p.fame * RANK_WEIGHTS.fame + p.vetted * RANK_WEIGHTS.vetted) * p.purpose;
}

/* ── 정답지를 훑는다 ──────────────────────────────────────────────── */
const hits = [];          // 대표 하나하나가 그 도시에서 몇 번째인가
for (const c of cities) {
  const sights = load(c.slug).filter((i) => !isMeal(i));
  // 표본이 너무 작으면 백분위가 뜻을 잃는다(5곳 중 3위 = 50%).
  if (sights.length < 8) continue;
  const sorted = [...sights].sort((a, b) => blindScore(b, c) - blindScore(a, c));
  sorted.forEach((item, pos) => {
    if (!isHighlight(item, c)) return;
    hits.push({ city: c.name, name: item.name, pos: pos + 1, of: sorted.length,
      pct: pos / (sorted.length - 1), item });
  });
}

const n = hits.length;
const pctOf = (f) => Math.round((hits.filter(f).length / n) * 100);
const top10 = pctOf((h) => h.pct <= 0.10);
const top25 = pctOf((h) => h.pct <= 0.25);
const bottom = pctOf((h) => h.pct > 0.50);
const mean = Math.round((hits.reduce((a, h) => a + h.pct, 0) / n) * 100);

console.log(`■ 순위가 사람의 판단과 맞는가 (${country})`);
console.log(`  정답지: 대표 ${n}곳 / 도시 ${new Set(hits.map((h) => h.city)).size}곳`);
console.log('  (must 를 뺀 점수로 매긴 순위에서 대표가 어디에 있는가)\n');

/*
 * 기준값 — 적어 둔 실측치다(2026-09 · 스페인 볼거리 1,640곳).
 *
 * 여유를 2%p 만 둔다. 처음에는 5~6%p 를 뒀는데 그러면 진짜 악화가 새어
 * 나간다 — `fame` 가중을 0.40 에서 0.05 로 잘못 바꿔 보니 성적이
 * 49→45 · 68→63 으로 떨어졌는데도 전부 통과했다. 이 검사는 고정된
 * 데이터를 보므로 값이 저절로 흔들리지 않는다. 여유는 작아도 된다.
 *
 * **엔진이나 데이터를 고쳐 성적이 좋아지면 이 숫자도 함께 올린다.**
 * 안 올리면 다음에 나빠져도 예전 자리까지는 안 걸린다.
 */
const BASE = { top10: 49, top25: 68, bottom: 19, mean: 22 };
check('대표가 상위 10% 안에 든다', top10 >= BASE.top10 - 2, `${top10}%  (기준 ${BASE.top10 - 2}% 이상 · 적어 둔 값 ${BASE.top10}%)`);
check('대표가 상위 25% 안에 든다', top25 >= BASE.top25 - 2, `${top25}%  (기준 ${BASE.top25 - 2}% 이상 · 적어 둔 값 ${BASE.top25}%)`);
check('대표가 하위 절반으로 밀리지 않는다', bottom <= BASE.bottom + 2, `${bottom}%  (기준 ${BASE.bottom + 2}% 이하 · 적어 둔 값 ${BASE.bottom}%)`);
check('평균 백분위가 무작위보다 뚜렷이 낫다', mean <= BASE.mean + 1, `${mean}%  (기준 ${BASE.mean + 1}% 이하 · 무작위 50%)`);

/* ── 어디서 밀리는지 ─────────────────────────────────────────────── */
const missed = hits.filter((h) => h.pct > 0.5).sort((a, b) => b.pct - a.pct);
console.log(`\n■ 엔진이 못 알아본 대표 ${missed.length}곳 (진단)`);
for (const m of missed.slice(0, 10)) {
  console.log(`   ${m.city.padEnd(12)} ${m.name.padEnd(22)} ${m.pos}위 / ${m.of}곳`);
}
if (missed.length > 10) console.log(`   … 그 밖 ${missed.length - 10}곳`);

/*
 * 밀린 것이 어느 항에서 잃는지. 고칠 곳을 가리키는 표다 —
 * fame 이 크게 벌어지면 위키데이터 연결이나 fame 설계를 봐야 하고,
 * vetted 가 벌어지면 출처 편중을 봐야 한다.
 */
const found = hits.filter((h) => h.pct <= 0.5);
const cityOf = (name) => cities.find((c) => c.name === name);
const avg = (arr, f) => (arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0);
console.log('\n   어느 항에서 잃는가 (알아본 것 → 못 알아본 것)');
for (const k of ['fame', 'vetted', 'purpose']) {
  const a = avg(found, (h) => rankParts(h.item, cityOf(h.city))[k]);
  const b = avg(missed, (h) => rankParts(h.item, cityOf(h.city))[k]);
  console.log(`     ${k.padEnd(8)} ${a.toFixed(3)} → ${b.toFixed(3)}   ${(b - a).toFixed(3)}`);
}
const noWd = (arr) => Math.round((arr.filter((h) => !h.item.wikidata).length / Math.max(1, arr.length)) * 100);
console.log(`     위키데이터 없음 ${noWd(found)}% → ${noWd(missed)}%`);

/*
 * 어느 명성 구간에서 실패하는가.
 *
 * 2단계(docs/26)에서 밝힌 것이다. `fame` 이 3 이상이면 대표를 한 곳도
 * 놓치지 않는다. **실패는 전부 `fame<=2` 덩어리 안에서 일어난다** —
 * 볼거리의 69%(1,137곳)가 거기 있고, 그 안에서 `fame` 은 순위를 전혀
 * 가르지 못해 사실상 동전 던지기가 된다.
 *
 * 함께 적는 '열린 공간' 줄은 **기각된 가설의 묘비**다. 밀린 곳이
 * 성벽·해변·전망대처럼 보여 '무료로 열려 있는 공간을 fame 이 깎는다'
 * 고 의심했는데, 같은 덩어리 안에서 갈라 보면 차이가 없다. 열린 공간이
 * 많아 보이는 것은 그저 그것들이 fame<=2 에 몰려 있기 때문이다.
 * 여기에 보정을 걸면 성적이 오히려 내려간다(49→45~48%). 다시 하지 않는다.
 */
const openSpace = (i) => !i.indoor && !i.hours && (i.priceEur === null || i.priceEur === 0);
console.log('\n   어느 명성 구간에서 실패하는가');
for (let p = 1; p <= 5; p++) {
  const g = hits.filter((h) => h.item.popularity === p);
  if (!g.length) continue;
  const m = g.filter((h) => h.pct > 0.5).length;
  console.log(`     pop ${p}  대표 ${String(g.length).padStart(3)}곳 → 못 알아봄 ${String(m).padStart(2)}곳 (${Math.round((m / g.length) * 100)}%)`);
}
const mass = hits.filter((h) => h.item.popularity <= 2);
const share = (f) => { const g = mass.filter(f); const m = g.filter((h) => h.pct > 0.5).length; return `${g.length}곳 중 ${m}곳 (${g.length ? Math.round((m / g.length) * 100) : 0}%)`; };
console.log(`     └ 그 덩어리 안에서 '열린 공간' 은 따로 불리하지 않다 — 열린 공간 ${share((h) => openSpace(h.item))} · 그 밖 ${share((h) => !openSpace(h.item))}`);

/*
 * 점수가 계단인가 — 판정하지 않고 적기만 한다.
 *
 * 값의 가짓수가 적으면 1,640곳이 열 몇 개 값에 뭉치고, 기준선이 그
 * 계단 사이에 놓여 한 칸이 통째로 떨어진다. 이것을 고치는 것은
 * 따로 잡아 둔 일이라(docs/26 3단계) 여기서는 눈금만 남긴다.
 */
const allScores = [];
for (const c of cities) {
  for (const i of load(c.slug).filter((x) => !isMeal(x))) {
    const p = rankParts(i, c);
    allScores.push(Math.round(((p.fame * RANK_WEIGHTS.fame + p.must * RANK_WEIGHTS.must
      + p.vetted * RANK_WEIGHTS.vetted) * p.purpose) * 100) / 100);
  }
}
const freq = {};
for (const s of allScores) freq[s.toFixed(2)] = (freq[s.toFixed(2)] ?? 0) + 1;
const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
const biggest = top[0];
console.log(`\n■ 점수 분포 (진단 · 판정 안 함)`);
console.log(`   볼거리 ${allScores.length}곳이 ${Object.keys(freq).length}가지 값에 들어 있다`);
console.log(`   가장 많이 뭉친 곳: ${top.map(([v, c]) => `${v}→${c}곳`).join(' · ')}`);
console.log(`   기준선 ${RANK_FLOOR} 바로 아래(0.38~) : ${allScores.filter((s) => s >= 0.38 && s < RANK_FLOOR).length}곳`);
if (Number(biggest[0]) < RANK_FLOOR && biggest[1] > allScores.length * 0.2) {
  console.log(`   → 한 칸(${biggest[0]}, ${biggest[1]}곳)이 기준선 아래에 통째로 있다. docs/26 3단계 참고`);
}

const bad = results.filter((r) => !r.ok);
console.log(`\n검사 ${results.length}건 · 통과 ${results.length - bad.length} · 실패 ${bad.length}`);
console.log(bad.length ? '✗ 순위가 사람의 판단에서 멀어졌다' : '✓ 순위 정상 — 사람이 꼽은 대표를 위쪽에 둔다');
process.exit(bad.length ? 1 : 0);
