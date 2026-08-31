/**
 * 이번 수정 3가지를 실제 화면에서 확인한다.
 *   node scripts/days-car-stay.mjs [base-url]
 *
 *  1. 일수 — 도시 헤더의 '박' 과 패널의 '일' 이 어긋나지 않고,
 *     ± 버튼이 실제로 값을 바꾼다(예전에는 1.1일에서 '−' 가 먹지 않았다).
 *  2. 도시 빼기 — 3단계에서 도시를 여행에서 뺄 수 있다.
 *  3. 렌터카·숙박 — 렌터카 구간에 안내와 대안이 붙고, 자는 도시마다
 *     숙박 구역 안내가 나온다.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4300/0829_kos_basic_001/';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 1366 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let pass = 0;
const fails = [];
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { fails.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

const setValue = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const next = async (n) => {
  await page.getByRole('button', { name: /^(다음|계획 세우기|이 계획으로 진행)$/ }).click();
  await page.waitForTimeout(800);
  const label = await page.locator('.step-label span').first().innerText();
  if (!label.startsWith(String(n))) throw new Error(`expected step ${n}, got "${label}"`);
};

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.theme-head', { timeout: 20000 });

// 스크린샷과 같은 조합 — 안달루시아 + 지중해 + 섬.
const dates = await page.locator('input[type="date"]').all();
await dates[0].evaluate(setValue, '2026-09-01');
await dates[1].evaluate(setValue, '2026-09-12');
await page.waitForTimeout(300);

for (const [region, cities] of [
  [/안달루시아/, ['말라가', '네르하', '그라나다']],
  [/카탈루냐·지중해 동부/, ['발렌시아']],
  [/섬 /, ['팔마데마요르카']],
]) {
  await page.getByRole('button', { name: region }).click();
  await page.waitForTimeout(300);
  for (const c of cities) {
    await page.locator('.city-main', { hasText: c }).first().click();
    await page.waitForTimeout(200);
  }
}
await next(2);
await next(3);
await page.waitForSelector('.course', { timeout: 20000 });

console.log('\n■ 1. 일수 표시와 ± 버튼');
// 모든 도시의 코스를 고른 뒤 헤더(박)와 패널(일)을 대조한다.
for (const head of await page.locator('main > .theme-group .city-head-row > .theme-head').all()) {
  if ((await head.getAttribute('aria-expanded')) === 'true') continue;
  await head.click();
  await page.waitForTimeout(400);
  const c = page.locator('.course').first();
  if (await c.count()) { await c.click(); await page.waitForTimeout(400); }
}
await page.waitForTimeout(500);

const heads = await page.locator('main > .theme-group .city-head-row > .theme-head').all();
let mismatched = 0;
let checked = 0;
for (const head of heads) {
  const text = await head.innerText();
  const m = text.match(/(\d+)박/);
  if (!m) continue;                       // 당일치기는 건너뛴다
  if ((await head.getAttribute('aria-expanded')) !== 'true') {
    await head.click();
    await page.waitForTimeout(400);
  }
  const stepper = await page.locator('.city-panel .days-value').first().innerText();
  const days = Number(stepper.replace('일', ''));
  const nights = Number(m[1]);
  checked++;
  // 헤더의 박수는 패널의 일수를 반올림한 값이어야 한다. 예전에는 올림이라
  // 1.1일이 2박이 됐고 화면에 '1.1일' 과 '2일' 이 나란히 떴다.
  if (Math.abs(nights - days) > 0) {
    mismatched++;
    console.log(`     ${text.split('\n')[0]} — 헤더 ${nights}박 vs 패널 ${days}일`);
  }
  // 접어서 다음 도시로.
  await head.click();
  await page.waitForTimeout(250);
}
ok(checked > 0, '숙박 도시를 확인했다', `${checked}곳`);
ok(mismatched === 0, '헤더의 박수와 패널의 일수가 일치한다', `어긋남 ${mismatched}건`);

// ± 버튼이 실제로 값을 바꾸는가.
const firstHead = page.locator('main > .theme-group .city-head-row > .theme-head').first();
if ((await firstHead.getAttribute('aria-expanded')) !== 'true') {
  await firstHead.click();
  await page.waitForTimeout(400);
}
const value = () => page.locator('.city-panel .days-value').first().innerText();
const plusBtn = page.locator('.days-step button', { hasText: '＋' }).first();
const before = await value();
await plusBtn.click();
await page.waitForTimeout(600);
const plus1 = await value();
ok(plus1 !== before, '＋ 를 누르면 일수가 늘어난다', `${before} → ${plus1}`);
// 2일까지 올려 두어야 '−' 를 눌러 볼 수 있다(1일에서는 비활성이 정상이다).
if (!(await plusBtn.isDisabled())) {
  await plusBtn.click();
  await page.waitForTimeout(600);
}
const plus = await value();
await page.locator('.days-step button', { hasText: '−' }).first().click();
await page.waitForTimeout(600);
const minus = await value();
ok(minus !== plus, '− 를 누르면 일수가 줄어든다', `${plus} → ${minus}`);
// 1일에서는 더 줄일 수 없어야 한다(예전에는 눌러도 아무 일이 없었다).
const minusBtn = page.locator('.days-step button', { hasText: '−' }).first();
let guard = 0;
while (!(await minusBtn.isDisabled()) && guard++ < 6) {
  await minusBtn.click();
  await page.waitForTimeout(500);
}
ok(await minusBtn.isDisabled(), '1일에 닿으면 − 가 비활성이 된다', `${await value()}`);

console.log('\n■ 2. 3단계에서 도시 빼기');
const cityCountBefore = await page.locator('main > .theme-group').count();
const dropBtn = page.locator('.city-drop').last();
ok(await dropBtn.count() > 0, '3단계에 빼기 버튼이 있다');
page.once('dialog', (d) => d.accept());
await dropBtn.click();
await page.waitForTimeout(900);
const cityCountAfter = await page.locator('main > .theme-group').count();
ok(cityCountAfter === cityCountBefore - 1, '빼면 그 도시가 사라진다',
  `${cityCountBefore} → ${cityCountAfter}`);

console.log('\n■ 3. 4단계 — 렌터카와 숙박');
// 남은 도시의 코스를 마저 채워 계획을 만들 수 있게 한다.
for (const head of await page.locator('main > .theme-group .city-head-row > .theme-head').all()) {
  if ((await head.getAttribute('aria-expanded')) === 'true') continue;
  await head.click();
  await page.waitForTimeout(350);
  const c = page.locator('.course').first();
  if (await c.count()) { await c.click(); await page.waitForTimeout(350); }
}
await next(4);
await page.waitForSelector('.plan-tab');

// 숙박 — 자는 도시마다 안내가 붙는가.
const stayCount = await page.locator('.itin-stay').count();
ok(stayCount > 0, '4단계 여정에 숙박 안내가 붙는다', `${stayCount}곳`);
if (stayCount > 0) {
  await page.locator('.itin-stay > summary').first().click();
  await page.waitForTimeout(400);
  const areas = await page.locator('.stay-areas > li').count();
  const generic = await page.locator('.stay-generic').count();
  ok(areas > 0 || generic > 0, '숙박 구역이나 일반 안내가 나온다',
    areas > 0 ? `동네 ${areas}곳` : '일반 안내');
  ok(await page.locator('.stay-links .link-row').count() > 0, '숙소 예약 링크가 있다');
}

// 렌터카 — 렌터카 구간이 있으면 안내와 대안이 함께 있어야 한다.
const carBlocks = await page.locator('.car-caveat').count();
const carSummary = await page.locator('.car-summary').count();
if (carBlocks > 0 || carSummary > 0) {
  ok(carBlocks > 0, '렌터카 구간에 주의 안내가 붙는다', `${carBlocks}건`);
  ok(carSummary > 0, '여정 위에 렌터카 계약 요약이 있다', `${carSummary}건`);
  const openAlts = await page.locator('.travel-alts[open]').count();
  ok(openAlts > 0, '렌터카 구간은 대안이 펼쳐져 있다', `${openAlts}건`);
} else {
  console.log('  · 이 조합에는 렌터카 구간이 없다 — 수단을 직접 바꿔 확인한다');
  const alts = page.locator('.travel-alts').first();
  if (await alts.count()) {
    await alts.locator('summary').click();
    await page.waitForTimeout(300);
    const carMode = alts.locator('.mode', { hasText: '렌터카' }).first();
    if (await carMode.count()) {
      await carMode.click();
      await page.waitForTimeout(900);
      ok(await page.locator('.car-caveat').count() > 0, '렌터카로 바꾸면 주의 안내가 뜬다');
      ok(await page.locator('.car-summary').count() > 0, '렌터카 계약 요약이 뜬다');
    } else {
      console.log('  · 이 구간에는 렌터카 선택지가 없다(섬 구간 등)');
    }
  }
}

// 대안에 도착 시각이 붙는가 — 바꾸기 전에 일정 변화를 알 수 있어야 한다.
const deltas = await page.locator('.mode-delta').count();
ok(deltas > 0, '대안마다 도착 시각이 표시된다', `${deltas}건`);

console.log('\n■ 4. 5단계 안내의 숙박 섹션');
await next(5);
await page.waitForTimeout(800);
const stayGuides = await page.locator('summary', { hasText: /^🛏/ }).count();
ok(stayGuides > 0, '5단계에 도시별 숙소 안내가 있다', `${stayGuides}곳`);

console.log('\n' + '='.repeat(52));
console.log(`검사 ${pass + fails.length}건 · 통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) console.log('실패: ' + fails.join(' / '));
console.log(errors.length ? `브라우저 오류 ${errors.length}건: ${errors.join(' | ')}` : '브라우저 오류 없음');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
