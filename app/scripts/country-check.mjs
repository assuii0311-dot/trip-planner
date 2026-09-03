/**
 * 나라 고르는 곳과, 나라가 서로 섞이지 않는가.
 *
 * 나라를 쪼갠 이유가 '데이터가 겹치면 어려워서' 였으므로, 검사할 것도
 * **겹치지 않는가** 다. 주소·저장분·데이터 폴더가 나라마다 따로 가는지 본다.
 *
 *   npx tsx scripts/country-check.mjs [주소]
 */
import { readFileSync, existsSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const site = process.argv[2] ?? 'http://localhost:4300/0829_kos_basic_001/';
const engine = process.env.VERIFY_ENGINE === 'webkit' ? webkit : chromium;
const browser = engine === webkit
  ? await webkit.launch()
  : await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });

const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`); };
const errs = [];
const watch = (page, tag) => {
  page.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${tag}: ${m.text()}`);
  });
};

/** 앱이 아는 나라 목록. 검사가 목록을 따로 들고 있으면 둘이 어긋난다. */
const src = readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8');
const COUNTRIES = [...src.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]);
const READY = [...src.matchAll(/slug: '([a-z-]+)'[\s\S]*?status: '(ready|soon)'/g)]
  .filter((m) => m[2] === 'ready').map((m) => m[1]);

console.log(`■ 나라 고르는 곳 (${engine === webkit ? 'WebKit' : 'Chromium'})`);
console.log(`  아는 나라: ${COUNTRIES.join(', ')} · 들어갈 수 있는 나라: ${READY.join(', ')}`);
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const page = await ctx.newPage();
  watch(page, '[접수]');
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pick', { timeout: 25000 });

  check('나라 카드가 모두 나온다',
    (await page.locator('.pick').count()) === COUNTRIES.length,
    `${await page.locator('.pick').count()} / ${COUNTRIES.length}`);
  check('준비된 나라만 눌린다',
    (await page.locator('a.pick').count()) === READY.length,
    `${await page.locator('a.pick').count()}곳`);

  /*
   * 준비 안 된 나라는 링크가 아니어야 한다. 눌러서 빈 화면을 만나는 것이
   * 가장 나쁘다 — 고장인지 아직인지 알 수가 없다.
   */
  for (const slug of COUNTRIES.filter((c) => !READY.includes(c))) {
    check(`${slug} 은 아직 못 들어간다`,
      (await page.locator(`a.pick[href*="/${slug}/"]`).count()) === 0);
    check(`${slug} 은 왜 아직인지 적혀 있다`,
      /준비 중/.test(await page.locator('.pick.is-soon').first().innerText()));
  }

  // 어떻게 짜 주는지 한 번은 말해 준다 — 처음 온 사람이 여기서 판단한다.
  const body = await page.locator('.landing').innerText();
  check('무엇을 해 주는 곳인지 적혀 있다', /계획 3안|세 가지 안/.test(body));
  check('자료 출처를 밝힌다', /Wikivoyage|OpenStreetMap/.test(body));
  await ctx.close();
}

console.log('\n■ 나라마다 따로 도는가');
for (const slug of READY) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const page = await ctx.newPage();
  watch(page, `[${slug}]`);

  // 접수 페이지에서 눌러 들어간다 — 링크가 실제로 그 나라로 가는가.
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pick', { timeout: 25000 });
  await page.locator(`a.pick[href*="/${slug}/"]`).click();
  await page.waitForSelector('.city-card', { timeout: 30000 });
  check(`${slug} · 그 나라 주소로 들어간다`, page.url().includes(`/${slug}/`), page.url());
  check(`${slug} · 도시가 실려 있다`, (await page.locator('.city-card').count()) > 0,
    `${await page.locator('.city-card').count()}장`);

  // 도시를 하나 골라 저장을 만든다.
  await page.locator('.city-main').first().click();
  await page.waitForTimeout(900);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^trip-planner\.v1/.test(k)));
  check(`${slug} · 저장이 그 나라 자리에 들어간다`,
    keys.includes(`trip-planner.v1.${slug}`) && !keys.includes('trip-planner.v1'),
    keys.join(', ') || '없음');

  // 나라 이름을 눌러 돌아온다.
  await page.locator('.country-back').click();
  await page.waitForSelector('.pick', { timeout: 25000 });
  check(`${slug} · 나라 고르는 곳으로 돌아온다`, !/\/(spain|japan)\//.test(page.url()), page.url());
  check(`${slug} · 돌아오면 이어서 하기가 뜬다`,
    (await page.locator('.pick-resume').count()) > 0,
    (await page.locator('.pick-resume').allInnerTexts()).join(' | ') || '없음');
  await ctx.close();
}

/*
 * 한 나라에서 짠 계획이 다른 나라로 새지 않는가.
 *
 * 이것이 나라를 쪼갠 진짜 이유다. localStorage 는 주소가 달라도 같은 서랍을
 * 보므로, 열쇠를 안 나누면 스페인 도시가 담긴 계획을 일본 데이터로 읽으려 든다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const page = await ctx.newPage();
  watch(page, '[격리]');
  const a = READY[0];
  // 한 나라에서 도시를 고른다.
  await page.goto(`${site}${a}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 30000 });
  await page.locator('.city-main').first().click();
  await page.waitForTimeout(900);

  /*
   * 그 상태로 다른 나라 주소로 간다.
   *
   * 데이터가 아직 없는 나라라도 이 검사는 뜻이 있다 — 오히려 이때
   * 새는지가 가장 잘 보인다. 앞 나라 계획을 읽어 버리면 '스페인 도시가
   * 담긴 계획을 일본 데이터로 읽으려 드는' 바로 그 상태가 되기 때문이다.
   */
  for (const b of COUNTRIES.filter((c) => c !== a)) {
    await page.goto(`${site}${b}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const picked = await page.locator('.city-card.is-selected').count();
    check(`${a} 에서 고른 것이 ${b} 로 새지 않는다`, picked === 0, `${b} 에 ${picked}곳 선택됨`);
    const seen = await page.evaluate(() => document.body.innerText);
    check(`${b} 에서 ${a} 계획을 읽지 않는다`,
      !/이어서|이어 하기/.test(seen) || READY.includes(b),
      seen.slice(0, 40).replace(/\n/g, ' '));

    // 아직인 나라는 '아직' 이라고 말한다 — 망 오류처럼 보이면 안 된다.
    if (!READY.includes(b)) {
      check(`${b} 은 아직이라고 말한다 (고장이 아니라)`,
        /준비 중/.test(seen) && !/불러오지 못했습니다/.test(seen),
        seen.split('\n').filter(Boolean)[1] ?? seen.slice(0, 40));
      check(`${b} 에서 나라 고르는 곳으로 나갈 수 있다`,
        (await page.locator(`a[href$="${new URL(site).pathname}"]`).count()) > 0);
    }
  }
  await ctx.close();
}

console.log('\n■ 데이터가 나라 폴더 안에 있는가');
{
  const root = new URL('../public/data/', import.meta.url);
  for (const slug of READY) {
    for (const f of ['index.json', 'cities']) {
      check(`data/${slug}/${f} 이 있다`, existsSync(new URL(`${slug}/${f}`, root)));
    }
  }
  // 예전 한 나라 시절의 자리가 남아 있으면 둘 중 어느 것이 진짜인지 알 수 없다.
  for (const stale of ['spain.json', 'spain-rail.json', 'cities']) {
    check(`옛 자리 data/${stale} 가 남아 있지 않다`, !existsSync(new URL(stale, root)));
  }
}

await browser.close();
if (errs.length) console.log(`\n브라우저 오류 ${errs.length}건:\n  ${errs.slice(0, 5).join('\n  ')}`);
const bad = results.filter((r) => !r.ok);
console.log(`\n검사 ${results.length}건 · 통과 ${results.length - bad.length} · 실패 ${bad.length}`);
process.exit(bad.length || errs.length ? 1 : 0);
