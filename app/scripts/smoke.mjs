/**
 * 6단계를 실제 화면 크기로 통과시키며 각 단계를 캡처한다.
 *   node scripts/smoke.mjs [base-url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4174/0829_kos_basic_001/';
const outDir = new URL('../../pipeline/out/shots/', import.meta.url);
await mkdir(outDir, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL(`${name}.png`, outDir).pathname });
  console.log(`  captured ${name}`);
};
const next = async (n) => {
  await page.getByRole('button', { name: /^(다음|계획 세우기|이 계획으로 진행)$/ }).click();
  await page.waitForTimeout(700);
  const label = await page.locator('.step-label span').first().innerText();
  if (!label.startsWith(String(n))) throw new Error(`expected step ${n}, got "${label}"`);
};

console.log(`smoke test → ${base}`);
// networkidle 은 외부 사진 요청 때문에 안정되지 않는다. 앱이 그려졌는지로 판단한다.
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.theme-head', { timeout: 20000 });

// 1단계 — 안달루시아 권역을 열고 소도시만 골라 거점 제안이 뜨는지 본다.
await page.getByRole('button', { name: /안달루시아/ }).click();
await page.waitForTimeout(300);
for (const city of ['코르도바', '론다']) {
  await page.locator('.city-main', { hasText: city }).first().click();
  await page.waitForTimeout(200);
}
await page.getByRole('button', { name: /마드리드·중부/ }).click();
await page.waitForTimeout(300);
for (const city of ['톨레도', '세고비아']) {
  await page.locator('.city-main', { hasText: city }).first().click();
  await page.waitForTimeout(200);
}
await page.waitForSelector('.base-group');
const bases = await page.locator('.base-name').allInnerTexts();
const suggested = await page.locator('.badge-suggest').count();
console.log(`  거점 판정: ${bases.join(' / ')} (제안 ${suggested}개)`);
const reasons = await page.locator('.base-reason').allInnerTexts();
reasons.forEach((r) => console.log(`  ${r}`));
// 도시 카드가 보이도록 위로 올려 한 장, 거점 제안으로 한 장.
await page.locator('.city-card').first().scrollIntoViewIfNeeded();
await shot('step1-cities');
await page.locator('.base-group').first().scrollIntoViewIfNeeded();
await shot('step1-basics');
await next(2);

// 2단계 — 역산된 테마가 채워져 있어야 한다.
await page.waitForSelector('.theme-row');
const dots = await page.locator('.theme-row .dot[aria-pressed="true"]').allInnerTexts();
console.log(`  역산된 테마 관심도: ${dots.join(',')}`);
if (dots.every((d) => d === dots[0])) console.warn('  ⚠ 모든 테마가 같은 값입니다');
await shot('step2-preferences');
await next(3);

// 3단계
await page.waitForSelector('.theme-head');
await shot('step3-items');
await next(4);

// 4단계
await page.getByRole('button', { name: '취향대로 추천 담기' }).click();
await page.waitForTimeout(400);
await shot('step4-priority');
await next(5);

// 5단계
await page.waitForSelector('.plan-tab');
const stats = await page.locator('.stat .v').allInnerTexts();
const dayCount = await page.locator('.day').count();
console.log(`  계획: ${stats.join(' / ')}, ${dayCount}일`);
if (stats[0] === '0') throw new Error('planner produced an empty itinerary');
const cityByDay = await page.locator('.day-head .d').allInnerTexts();
console.log(`  일자별 도시: ${cityByDay.map((s) => s.split('·').pop().trim()).join(' → ')}`);
await shot('step5-plans');
await page.getByRole('button', { name: /여유형/ }).click();
await page.waitForTimeout(400);
const relaxed = await page.locator('.stat .v').first().innerText();
console.log(`  알찬형 ${stats[0]} vs 여유형 ${relaxed}`);
await shot('step5-relaxed');
await next(6);

// 6단계
await page.waitForSelector('details.guide');
await page.locator('details.guide').nth(1).click();
await shot('step6-guide');

await browser.close();
if (errors.length) {
  console.error('\n브라우저 오류:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('\n✓ 6단계 모두 통과');
