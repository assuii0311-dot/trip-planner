/**
 * 안드로이드에서 실제로 쓸 수 있는가.
 *
 * 데스크톱 검증이 놓치는 것들이 있다. 실제로 '날짜 선택 불가' 가 보고됐는데,
 * 원인은 두 날짜 칸에 서로를 가리키는 max/min 을 걸어 둔 것이었다. 안드로이드
 * 달력은 범위 밖 날짜를 회색으로 막아 아예 탭이 안 먹는데, 데스크톱은
 * 타이핑으로 넘어가서 보이지 않았다.
 *
 * 게다가 검증 스크립트가 input 의 .value 를 프로그래밍으로 넣고 있었다.
 * 그건 min/max 검증을 통째로 우회한다. 여기서는 브라우저의 validity 를
 * 직접 확인해 그 사각지대를 막는다.
 *
 * 안드로이드 크롬과 같은 엔진(Chromium)에 같은 기기 조건(터치·좁은 화면·
 * 모바일 UA)을 씌운 것이지 실기기는 아니다. 레이아웃·터치·입력 검증에는
 * 충분하지만, 기기 고유 문제(삼성 인터넷, 특정 IME)는 잡지 못한다.
 *
 *   node scripts/android-check.mjs [base-url]
 */
import { chromium, devices } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4300/0829_kos_basic_001/spain/';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let fail = 0;
const ok = (c, label, detail = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!c) fail++;
};

const DEVICES = ['Pixel 7', 'Galaxy S9+'];

for (const name of DEVICES) {
  console.log(`\n■ ${name}`);
  const ctx = await browser.newContext({ ...devices[name] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text());
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 30000 });

  const dates = () => page.locator('input[type=date]');
  const info = () => dates().evaluateAll((els) => els.map((e) => ({
    value: e.value, min: e.min, max: e.max, valid: e.validity.valid,
    w: Math.round(e.getBoundingClientRect().width),
  })));

  /*
   * 날짜 칸이 서로를 묶고 있지 않은가.
   *
   * 첫날에 max=마지막날, 마지막날에 min=첫날 을 걸면 여행을 다른 달로
   * 옮길 수가 없다. 안드로이드 달력이 범위 밖을 회색으로 막기 때문이다.
   */
  const d0 = await info();
  ok(d0.length === 2, '날짜 칸이 둘 있다', `${d0.length}개`);
  ok(d0.every((x) => x.min === '' && x.max === ''),
    '두 날짜 칸이 서로를 막지 않는다',
    d0.map((x, i) => `${i ? '마지막' : '첫날'} min="${x.min}" max="${x.max}"`).join(' · '));
  ok(d0.every((x) => x.w >= 120), '날짜 칸이 잘리지 않을 만큼 넓다',
    d0.map((x) => `${x.w}px`).join(' · '));

  // 여행을 두 달 뒤로 — 첫날부터 바꾸는 자연스러운 순서
  await dates().nth(0).fill('2026-11-01');
  await page.waitForTimeout(500);
  let st = await info();
  ok(st[0].value === '2026-11-01' && st[0].valid,
    '첫날을 마음대로 옮길 수 있다', `${st[0].value} · ${st[0].valid ? '유효' : '무효'}`);
  ok(st[1].value >= st[0].value, '첫날이 뒤로 가면 마지막 날이 따라온다',
    `${st[0].value} ~ ${st[1].value}`);

  // 마지막 날을 첫날보다 앞으로 — 반대 방향
  await dates().nth(1).fill('2026-08-10');
  await page.waitForTimeout(500);
  st = await info();
  ok(st[0].value <= st[1].value, '마지막 날이 앞으로 가면 첫날이 따라온다',
    `${st[0].value} ~ ${st[1].value}`);
  const span = (Date.parse(`${st[1].value}T00:00:00Z`) - Date.parse(`${st[0].value}T00:00:00Z`)) / 86400000;
  ok(span >= 0 && span <= 30, '기간이 뒤집히거나 터무니없어지지 않는다', `${span + 1}일`);

  // 시각 칸도 안드로이드에서 잡히는가
  ok((await page.locator('input[type=time]').count()) === 2, '시각 칸이 보인다');

  /*
   * 가로 스크롤이 생기지 않는가. 좁은 화면에서 가장 흔한 고장이다.
   */
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, '가로로 삐져나가지 않는다', `${overflow}px`);

  /*
   * 손가락으로 누를 수 있는 크기인가. 44px 는 널리 쓰이는 최소 기준이다.
   * 화면에 보이는 것만 센다.
   */
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, a')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 36) {
        const t = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 14);
        out.push(`${t} ${Math.round(r.height)}px`);
      }
    }
    return out;
  });
  ok(small.length === 0, '누를 것이 손가락에 충분히 크다', small.slice(0, 4).join(' · ') || '전부 36px 이상');

  /*
   * 터치로 실제 진행이 되는가.
   * 카드 한가운데는 자식 요소(테마 칩·설명)가 차지한다. 실제 기기에서는
   * 이벤트가 부모 버튼으로 올라가므로 아무 문제가 없는데, Playwright 는
   * '누른 지점의 요소가 대상 자신이거나 그 자손' 일 때만 통과시킨다.
   * 그래서 force 로 그 검사만 건너뛴다 — 실제로 손가락이 하는 일과 같다.
   */
  const card = page.locator('.city-main').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await card.tap({ force: true });
  await page.waitForTimeout(500);
  ok((await card.getAttribute('aria-pressed')) === 'true', '탭으로 도시를 고를 수 있다');

  const nextBtn = page.getByRole('button', { name: /^다음$/ });
  ok(await nextBtn.isEnabled(), '도시를 고르면 다음으로 갈 수 있다');
  await nextBtn.tap();
  await page.waitForTimeout(1400);
  ok((await page.locator('.step-label').innerText()).includes('2단계'),
    '탭으로 2단계까지 간다', (await page.locator('.step-label').innerText()).replace(/\n/g, ' '));

  /* 단계 표시는 앞 단계로 돌아가는 버튼이기도 하다 — 눌러서 실제로 돌아가는가. */
  await page.locator('.steps button').first().tap();
  await page.waitForTimeout(1000);
  ok((await page.locator('.step-label').innerText()).includes('1단계'),
    '단계 표시를 눌러 앞 단계로 돌아간다',
    (await page.locator('.step-label').innerText()).replace(/\n/g, ' '));

  ok(errs.length === 0, '브라우저 오류가 없다', errs.slice(0, 2).join(' / ') || '없음');
  await ctx.close();
}

await browser.close();
console.log(fail === 0 ? '\n✓ 안드로이드 정상' : `\n✗ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
