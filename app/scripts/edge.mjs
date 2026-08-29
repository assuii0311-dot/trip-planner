import { chromium } from 'playwright';
const base = 'http://localhost:4174/0829_kos_basic_001/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];

async function run(days, cities, label) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await p.goto(base, { waitUntil: 'networkidle' });
  for (const c of cities) await p.getByRole('button', { name: new RegExp(`^${c}`) }).click();
  await p.locator('input[type=range]').first().evaluate((el, d) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, days);
  await p.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await p.getByRole('button', { name: /^(다음)$/ }).click(); await p.waitForTimeout(500); }
  await p.getByRole('button', { name: '취향대로 추천 담기' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: '계획 세우기' }).click();
  await p.waitForTimeout(900);
  const dayCount = await p.locator('.day').count();
  const empties = await p.locator('.empty').count();
  const stats = await p.locator('.stat .v').allInnerTexts();
  const first = await p.locator('.entry .time').first().innerText().catch(() => '-');
  const dates = await p.locator('.day-head .d').allInnerTexts();
  console.log(`${label}: 요청 ${days}일 → 표시 ${dayCount}일, 빈 일자 ${empties}, 통계 ${stats.join('/')}, 첫 일정 ${first}`);
  console.log(`   날짜: ${dates[0]} … ${dates[dates.length - 1]}`);
  if (dayCount !== days) errors.push(`${label}: expected ${days} days, got ${dayCount}`);
  if (empties > 0) errors.push(`${label}: ${empties} empty day(s)`);
  await p.close();
}

await run(1, ['마드리드'], '1일·거점1');
await run(14, ['바르셀로나', '세비야', '빌바오'], '14일·거점3');
await b.close();
if (errors.length) { console.error('\n실패:'); errors.forEach((e) => console.error('  ' + e)); process.exit(1); }
console.log('\n✓ 경계값 통과');
