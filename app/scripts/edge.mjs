/**
 * 경계값 확인 — 하루짜리 일정과 2주짜리 일정이 각각 온전히 나오는지 본다.
 *   node scripts/edge.mjs
 *
 * 1단계가 날짜 두 개(출발·도착)를 받도록 바뀌면서 예전 슬라이더 조작은 없어졌다.
 * 이제 date 인풋에 직접 값을 넣는다.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4174/0829_kos_basic_001/spain/';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const errors = [];

/** 리액트가 알아채도록 네이티브 setter 로 값을 넣고 input 이벤트를 쏜다. */
const setValue = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const isoPlus = (days) => {
  const d = new Date('2026-05-01T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function run(days, picks, label) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.city-card');

  for (const [region, city] of picks) {
    // 권역 아코디언은 처음부터 열려 있는 것이 있어서, 눌러 닫아 버리면 안 된다.
    const card = p.locator('.city-main', { hasText: city }).first();
    if (!(await card.isVisible().catch(() => false))) {
      await p.getByRole('button', { name: new RegExp(region) }).click();
      await p.waitForTimeout(250);
    }
    await card.click();
    await p.waitForTimeout(200);
  }

  // 출발일 = 2026-05-01, 도착일 = 출발일 + (days - 1). 마지막 날도 온종일 쓴다.
  const dates = p.locator('input[type=date]');
  await dates.nth(0).evaluate(setValue, isoPlus(0));
  await dates.nth(1).evaluate(setValue, isoPlus(days - 1));
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^종일$/, exact: true }).click().catch(() => {});
  await p.waitForTimeout(200);

  // 1 → 2 → 3단계
  for (let i = 0; i < 2; i++) {
    await p.getByRole('button', { name: /^다음$/ }).click();
    await p.waitForTimeout(700);
  }
  // 3단계 — 도시마다 첫 코스를 담는다.
  await p.waitForSelector('.course', { timeout: 20000 });
  for (const head of await p.locator('main > .theme-group > .city-head > .theme-head').all()) {
    if ((await head.getAttribute('aria-expanded')) !== 'true') {
      await head.click();
      await p.waitForTimeout(400);
    }
    const c = p.locator('.course').first();
    if (await c.count()) { await c.click(); await p.waitForTimeout(400); }
  }
  await p.getByRole('button', { name: /^(다음|계획 세우기)$/ }).click();
  await p.waitForTimeout(1500);

  const dayCount = await p.locator('.day').count();
  const empties = await p.locator('.empty').count();
  const stats = await p.locator('.stat .v').allInnerTexts();
  const heads = await p.locator('.day-head .d').allInnerTexts();
  console.log(`${label}: 요청 ${days}일 → 표시 ${dayCount}일, 빈 일자 ${empties}, 통계 ${stats.join(' / ')}`);
  console.log(`   ${heads[0]} … ${heads[heads.length - 1]}`);
  if (dayCount !== days) errors.push(`${label}: ${days}일을 기대했는데 ${dayCount}일`);
  if (empties > 0) errors.push(`${label}: 빈 일자 ${empties}개`);
  await p.close();
}

await run(1, [['마드리드·중부', '마드리드']], '1일·1개 도시');
await run(14, [['카탈루냐', '바르셀로나'], ['안달루시아', '세비야'], ['북부', '빌바오']], '14일·3개 도시');
await b.close();

if (errors.length) {
  console.error('\n실패:');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\n✓ 경계값 통과');
