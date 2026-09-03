/**
 * 취향 역산(inferThemes)이 멀쩡한 관심사를 0으로 만들지 않는지 검사한다.
 *
 * 0 은 "이 도시엔 그런 게 없다"는 뜻이라 코스에서 통째로 빠진다.
 * min-max 정규화는 최저 테마를 항상 정확히 0 으로 만들었고, 그래서
 * 바르셀로나(프로필 history:2)에서 역사가 0 이 되어 고딕 지구·대성당이
 * 후보에서 사라졌다. 0 은 도시 프로필이 실제로 0 일 때만 나와야 한다.
 */
import { readFile } from 'node:fs/promises';

const index = JSON.parse(await readFile(new URL('../public/data/spain/index.json', import.meta.url), 'utf8'));
const cities = index.cities;
const { inferThemes } = await import('../src/lib/taste.ts');
const { THEMES } = await import('../src/lib/themes.ts');

let fail = 0;
const ok = (cond, label, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fail++;
};

const fmt = (t) => THEMES.map((x) => `${x.id}:${t[x.id]}`).join(' ');

console.log('\n=== 바르셀로나 단독 선택 ===');
const bcn = cities.find((c) => c.slug === 'barcelona');
const t = inferThemes([bcn]);
console.log(`  프로필 ${fmt(bcn.profile)}`);
console.log(`  역산   ${fmt(t)}`);
ok(t.history > 0, '역사가 0 이 아니다', `history:${t.history} (프로필 ${bcn.profile.history})`);
ok(t.nature > 0 && t.activity > 0, '자연·액티비티도 0 이 아니다',
  `nature:${t.nature} activity:${t.activity}`);

console.log('\n=== 60곳 단독 선택 전수 ===');
let fabricated = 0, manyZero = 0, totalZero = 0, outOfRange = 0;
for (const c of cities) {
  const r = inferThemes([c]);
  const zero = THEMES.filter((x) => r[x.id] === 0);
  totalZero += zero.length;
  if (zero.length >= 3) manyZero++;
  for (const x of zero) if ((c.profile?.[x.id] ?? 0) > 0) fabricated++;
  for (const x of THEMES) if (r[x.id] < 0 || r[x.id] > 3) outOfRange++;
}
ok(fabricated === 0, '프로필이 0 이 아닌 테마는 0 으로 역산되지 않는다', `${fabricated}건`);
ok(outOfRange === 0, '역산값이 0~3 범위 안에 있다', `${outOfRange}건 이탈`);
console.log(`     (0 인 테마 평균 ${(totalZero / cities.length).toFixed(2)}개 · 0 이 3개 이상인 도시 ${manyZero}곳)`);

console.log('\n=== 도시 조합 ===');
for (const combo of [['barcelona', 'madrid'], ['seville', 'granada', 'cordoba'], ['bilbao', 'san-sebastian']]) {
  const sel = combo.map((s) => cities.find((c) => c.slug === s)).filter(Boolean);
  if (sel.length !== combo.length) continue;
  const r = inferThemes(sel);
  const fake = THEMES.filter((x) => r[x.id] === 0
    && sel.some((c) => (c.profile?.[x.id] ?? 0) > 0));
  ok(fake.length === 0, sel.map((c) => c.name).join('+'), fmt(r));
}

console.log(fail === 0 ? '\n✓ 취향 역산 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
