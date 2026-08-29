/**
 * End-to-end smoke test: walk all six steps in a phone-sized viewport and
 * capture a screenshot of each. Run against `npm run preview` or `npm run dev`.
 *
 *   node scripts/smoke.mjs http://localhost:4173/0829_kos_basic_001/
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4173/0829_kos_basic_001/';
const outDir = new URL('../../pipeline/out/shots/', import.meta.url);
await mkdir(outDir, { recursive: true });

// 이 환경에는 Chromium 이 미리 설치돼 있고 playwright 가 기대하는 빌드 번호와
// 다르므로 실행 파일 경로를 직접 준다. PLAYWRIGHT_CHROMIUM 로 덮어쓸 수 있다.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: new URL(`${name}.png`, outDir).pathname, fullPage: false });
  console.log(`  captured ${name}`);
};

const step = async (n) => {
  await page.getByRole('button', { name: /^(다음|계획 세우기|이 계획으로 진행)$/ }).click();
  await page.waitForTimeout(600);
  const label = await page.locator('.step-label span').first().innerText();
  if (!label.startsWith(String(n))) throw new Error(`expected step ${n}, got "${label}"`);
};

console.log(`smoke test → ${base}`);
await page.goto(base, { waitUntil: 'networkidle' });

// 1단계
await page.getByRole('button', { name: /바르셀로나/ }).click();
await page.getByRole('button', { name: /^세비야/ }).click();
await shot('step1-basics');
await step(2);

// 2단계
await page.getByRole('button', { name: '미식 관심도 3' }).click();
await page.getByRole('button', { name: '역사·유적 관심도 3' }).click();
await shot('step2-preferences');
await step(3);

// 3단계
await page.waitForSelector('.theme-head');
const themeCount = await page.locator('.theme-head').count();
if (themeCount < 5) throw new Error(`expected 5+ themes, got ${themeCount}`);
await shot('step3-items');
await step(4);

// 4단계
await page.getByRole('button', { name: '취향대로 추천 담기' }).click();
await page.waitForTimeout(400);
await shot('step4-priority');
await step(5);

// 5단계
await page.waitForSelector('.plan-tab');
const planStats = await page.locator('.stat .v').allInnerTexts();
console.log(`  plan stats: ${planStats.join(' / ')}`);
if (planStats[0] === '0') throw new Error('planner produced an empty itinerary');
const dayCount = await page.locator('.day').count();
if (dayCount < 5) throw new Error(`expected 5 days, got ${dayCount}`);
await shot('step5-plans');

// 여유형 탭으로 바꿔서 3안이 실제로 다른지 확인
await page.getByRole('button', { name: /여유형/ }).click();
await page.waitForTimeout(400);
const relaxed = await page.locator('.stat .v').first().innerText();
console.log(`  packed vs relaxed item count: ${planStats[0]} vs ${relaxed}`);
if (relaxed === planStats[0]) console.warn('  ⚠ 세 옵션의 일정 수가 같습니다');
await shot('step5-relaxed');
await step(6);

// 6단계
await page.waitForSelector('details.guide');
const guides = await page.locator('details.guide').count();
if (guides < 3) throw new Error(`expected guide sections, got ${guides}`);
await page.locator('details.guide').nth(1).click();
await shot('step6-guide');

await browser.close();
if (errors.length) {
  console.error('\n브라우저 오류:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('\n✓ 6단계 모두 통과');
