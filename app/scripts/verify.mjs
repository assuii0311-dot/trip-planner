/**
 * 전 기능 실사용 검증.
 *
 * 스모크 테스트는 '한 번 끝까지 지나가는가' 를 본다. 이것은 그 위에서
 * 실제로 눌러야 하는 것을 다 눌러 보고, 눌렀을 때 값이 정말 바뀌는지 본다.
 * 여러 여행 조합(최소·초과·잉여·섬·왕복)으로 돌려 경계도 함께 본다.
 *
 *   node scripts/verify.mjs [base-url]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4300/0829_kos_basic_001/';
const shots = new URL('../../pipeline/out/shots/verify/', import.meta.url);
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const setValue = (el, v) => {
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

/** 한 여행을 1단계부터 끝까지 만든다. */
async function build(page, { cities, from, to, airports, courses = true }) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  for (const [region, city] of cities) {
    const card = page.locator('.city-main', { hasText: city }).first();
    if (!(await card.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: new RegExp(region) }).click();
      await page.waitForTimeout(300);
    }
    await card.click();
    await page.waitForTimeout(200);
  }
  const d = page.locator('input[type=date]');
  await d.nth(0).evaluate(setValue, from);
  await d.nth(1).evaluate(setValue, to);
  await page.waitForTimeout(500);
  if (airports) {
    const sel = page.locator('select');
    await sel.nth(0).selectOption(airports[0]); await page.waitForTimeout(300);
    await sel.nth(1).selectOption(airports[1]); await page.waitForTimeout(500);
  }
  const next = async () => {
    await page.getByRole('button', { name: /^(다음|계획 세우기|이 계획으로 진행)$/ }).click();
    await page.waitForTimeout(1300);
  };
  await next(); await next();                       // → 3단계
  if (courses) {
    await page.waitForSelector('.course', { timeout: 25000 });
    for (const head of await page.locator('main > .theme-group > .theme-head').all()) {
      if ((await head.getAttribute('aria-expanded')) !== 'true') {
        await head.click(); await page.waitForTimeout(400);
      }
      const c = page.locator('.course').first();
      if (await c.count()) { await c.click(); await page.waitForTimeout(320); }
    }
  }
  return next;
}

function watch(page, errs, label) {
  page.on('pageerror', (e) => errs.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    // 원격 사진 실패가 콘솔에도 찍힌다. 위와 같은 이유로 오류로 세지 않는다.
    if (/Failed to load resource/.test(t)) return;
    if (m.type() === 'error') errs.push(`${label} console: ${t}`);
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    // 앱이 스스로 가져오는 것만 오류로 센다. 위키미디어 원격 사진은
    // 이 검증 환경에 인터넷이 없어 실패하는 것이고, 앱은 그 실패를
    // 감안해 자리를 비우도록 만들어져 있다.
    if (u.startsWith(new URL(base).origin)) errs.push(`${label} 요청실패: ${u}`);
    else remote.add(new URL(u).host);
  });
}

const allErrors = [];
const remote = new Set();

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 1. 기본 흐름 — 3개 도시 11일 (공항 지정)');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, allErrors, '[기본]');
  const next = await build(page, {
    cities: [['마드리드·중부', '마드리드'], ['안달루시아', '세비야'], ['안달루시아', '그라나다']],
    from: '2026-09-14', to: '2026-09-24',
    airports: ['MAD', 'AGP'],
  });

  // 3단계 — 코스와 일수
  const summary = async () => (await page.locator('main').innerText()).match(/(\d+)곳 선택 · 예상 ([\d.]+)일/);
  const s0 = await summary();
  check('3단계 코스 선택으로 아이템이 담긴다', Number(s0?.[1]) > 0, s0?.[0]);
  check('코스가 도시마다 2개 이상', (await page.locator('.course').count()) >= 2,
    `${await page.locator('.course').count()}개`);

  const daysVal = async () => (await page.locator('.days-value').first().innerText());
  const before = await daysVal();
  await page.getByRole('button', { name: '하루 늘리기' }).first().click();
  await page.waitForTimeout(900);
  const after = await daysVal();
  const s1 = await summary();
  check('일수 ＋ → 아이템이 늘어난다', before !== after && Number(s1[1]) > Number(s0[1]),
    `${before} → ${after} · ${s0[1]}일→${s1[1]}일`);
  await page.getByRole('button', { name: '하루 줄이기' }).first().click();
  await page.waitForTimeout(900);
  check('일수 − → 되돌아온다', (await daysVal()) === before, `${after} → ${await daysVal()}`);

  // 개별 아이템 추가/제거
  const cnt = async () => Number((await summary())[1]);
  const c0 = await cnt();
  const box = page.locator('.item input[type=checkbox]:not(:checked)').first();
  if (await box.count()) {
    await box.check(); await page.waitForTimeout(700);
    check('아이템 개별 추가', (await cnt()) === c0 + 1, `${c0} → ${await cnt()}`);
    await page.locator('.item input[type=checkbox]:checked').first().uncheck();
    await page.waitForTimeout(700);
    check('아이템 개별 제거', (await cnt()) === c0, `→ ${await cnt()}`);
  }
  await page.screenshot({ path: new URL('01-step3.png', shots).pathname });

  await next();                                     // → 4단계
  await page.waitForSelector('.itin', { timeout: 30000 });
  check('4단계 여정 패널이 기본으로 펼쳐진다', (await page.locator('.itin[open]').count()) === 1);
  const order0 = (await page.locator('.itin-city').allInnerTexts()).join('→');
  const hops0 = (await page.locator('.travel-route').allInnerTexts()).join(' | ');
  check('도시 간 이동 구간이 그려진다', (await page.locator('.travel-block').count()) > 0,
    `${await page.locator('.travel-block').count()}구간`);
  const when0 = await page.locator('.travel-when').first().innerText();
  check('이동에 출발·탑승·도착 시각이 있다', /\d\d:\d\d.*\d\d:\d\d.*\d\d:\d\d/.test(when0.replace(/\n/g, ' ')),
    when0.replace(/\n/g, ' '));
  const meta0 = await page.locator('.travel-meta').first().innerText();
  check('실제 시간표/추정이 구분 표시된다', /실제 시간표|추정치/.test(meta0), meta0.slice(0, 60));

  // 첫 일정이 도착 시각 이후에 시작하는가
  const days = await page.locator('.day').all();
  let travelDayOk = true; let travelDetail = '';
  for (const dayEl of days) {
    if (!(await dayEl.locator('.travel-block').count())) continue;
    const arr = (await dayEl.locator('.travel-when').innerText()).match(/(\d\d:\d\d) 도착/);
    const first = await dayEl.locator('.entry .time').first().innerText().catch(() => null);
    if (arr && first) {
      const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      if (m(first) < m(arr[1])) { travelDayOk = false; travelDetail = `도착 ${arr[1]} < 첫 일정 ${first}`; }
      else travelDetail = `도착 ${arr[1]} → 첫 일정 ${first}`;
    }
  }
  check('이동한 날은 도착 시각 뒤에 일정이 시작한다', travelDayOk, travelDetail);

  // 수단 바꾸기
  await page.locator('.travel-alts > summary').first().click();
  await page.waitForTimeout(400);
  const modes = await page.locator('.travel-block').first().locator('.mode').count();
  check('대안 수단이 제시된다', modes >= 2, `${modes}가지`);
  const other = page.locator('.travel-block').first().locator('.mode:not(.is-on)').first();
  const otherName = await other.locator('.mode-label').innerText();
  await other.click(); await page.waitForTimeout(1200);
  const chosenNow = await page.locator('.travel-block').first().locator('.mode.is-on .mode-label').innerText();
  check('수단을 바꾸면 반영된다', chosenNow === otherName, `${otherName} 선택됨`);

  // 숙박 전환
  const lodge0 = (await page.locator('.itin-state').allInnerTexts()).join(' | ');
  await page.locator('.itin-swap').first().click(); await page.waitForTimeout(1300);
  const lodge1 = (await page.locator('.itin-state').allInnerTexts()).join(' | ');
  check('숙박↔당일치기 전환이 반영된다', lodge0 !== lodge1, `${lodge0} → ${lodge1}`);
  await page.locator('.itin-swap').first().click(); await page.waitForTimeout(1300);

  // 도시 순서 바꾸기 → 교통편 재검색
  const moveBtns = page.locator('.itin-move button');
  if (await moveBtns.count() > 2) {
    await moveBtns.nth(2).click(); await page.waitForTimeout(1400);
    const order1 = (await page.locator('.itin-city').allInnerTexts()).join('→');
    const hops1 = (await page.locator('.travel-route').allInnerTexts()).join(' | ');
    check('도시 순서를 바꾸면 순서가 바뀐다', order0 !== order1, `${order0} → ${order1}`);
    check('순서를 바꾸면 교통편을 다시 찾는다', hops0 !== hops1, hops1.slice(0, 70));
  }

  // 일정 순서 바꾸기 → 시각 재계산
  const day1 = page.locator('.day').first();
  const t0 = await day1.locator('.entry .time').allInnerTexts();
  const n0 = await day1.locator('.entry .title').allInnerTexts();
  if (n0.length >= 2) {
    await day1.locator('.entry').nth(1).locator('.entry-move button').first().click();
    await page.waitForTimeout(1100);
    const n1 = await day1.locator('.entry .title').allInnerTexts();
    const t1 = await day1.locator('.entry .time').allInnerTexts();
    check('하루 안 일정 순서가 바뀐다', n0[0] !== n1[0], `${n0[0]} ↔ ${n1[0]}`);
    check('순서를 바꾸면 시각이 다시 계산된다', t0[0] === t1[0] && t0[1] !== t1[1],
      `${t0.slice(0, 2).join('/')} → ${t1.slice(0, 2).join('/')}`);
    check('순서를 바꾼 날에 표시가 붙는다',
      (await day1.locator('.badge', { hasText: '순서 바꿈' }).count()) === 1);
  }

  // 대안 설명·펼치기
  await page.locator('.entry-alts > summary').first().click();
  await page.waitForTimeout(400);
  const alt = page.locator('.alt').first();
  if (await alt.count()) {
    check('대안에 한 줄 설명이 있다', (await alt.locator('.alt-sum').count()) > 0);
    await alt.locator('.alt-more > summary').click(); await page.waitForTimeout(400);
    const detail = await alt.locator('.alt-detail').innerText();
    check('대안 상세가 펼쳐진다', detail.length > 30, detail.replace(/\n/g, ' ').slice(0, 60));
    check('대안 상세에 실무 정보가 있다', /소요|요금|예약|휴관/.test(detail));
  }
  await page.screenshot({ path: new URL('02-step4.png', shots).pathname });

  await next();                                     // → 5단계
  await page.waitForSelector('.trip-map', { timeout: 25000 });
  const names = await page.$$eval('.map-name', (e) => e.map((x) => x.textContent));
  check('지도에 도시가 그려진다', names.length > 0, names.join(' · '));
  check('지도에 국경선이 있다', (await page.locator('.map-land path').count()) > 0);
  const icons = await page.$$eval('.map-mode text', (e) => e.map((x) => x.textContent));
  check('지도에 이동 수단 아이콘이 있다', icons.length > 0, icons.join(' '));
  const z0 = await page.locator('.map-zoom').innerText();
  await page.getByRole('button', { name: '확대' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '확대' }).click(); await page.waitForTimeout(300);
  const z1 = await page.locator('.map-zoom').innerText();
  check('지도 확대가 된다', z0 !== z1, `${z0} → ${z1}`);
  await page.getByRole('button', { name: '처음으로' }).click(); await page.waitForTimeout(300);
  check('지도 되돌리기가 된다', (await page.locator('.map-zoom').innerText()) === z0);
  await page.locator('.map-pin').first().click({ force: true }); await page.waitForTimeout(600);
  check('도시를 누르면 그 도시 일정이 나온다', (await page.locator('.map-card').count()) === 1);
  check('도시 일정에 사진이 붙는다', (await page.locator('.map-card .item-photo').count()) > 0,
    `${await page.locator('.map-card .item-photo').count()}장`);
  await page.screenshot({ path: new URL('03-step5-map.png', shots).pathname });

  // KML
  for (const [label, want] of [['전체 장소', 'all'], ['여행 경로만', 'route']]) {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: new RegExp(label) }).click(),
    ]);
    const name = dl.suggestedFilename();
    const xml = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
    const marks = (xml.match(/<Placemark>/g) ?? []).length;
    check(`KML 내보내기 (${label})`, name.endsWith(`-${want}.kml`) && marks > 0,
      `${name} · 장소 ${marks}`);
    await page.waitForTimeout(400);
  }

  // 저장·복원
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('새로고침해도 5단계가 유지된다',
    (await page.locator('.step-label span').first().innerText()).startsWith('5'));
  check('새로고침해도 지도가 남는다', (await page.locator('.trip-map').count()) === 1);
  check('이어서 하기 배너가 뜬다', (await page.locator('.resume').count()) === 1);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 2. 경계 — 도시 1곳 / 1일');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[최소]');
  const next = await build(page, {
    cities: [['마드리드·중부', '마드리드']],
    from: '2026-09-14', to: '2026-09-14',
  });
  await next();
  await page.waitForSelector('.plan-tab', { timeout: 25000 });
  const dayCount = await page.locator('.day').count();
  const empty = await page.locator('.day .empty').count();
  check('1일 일정이 하루로 나온다', dayCount === 1, `${dayCount}일`);
  check('빈 일자가 없다', empty === 0);
  check('이동 구간이 없다', (await page.locator('.travel-block').count()) === 0);
  await next();
  await page.waitForSelector('.trip-map', { timeout: 25000 });
  check('도시 1곳도 지도가 그려진다', (await page.locator('.map-name').count()) === 1);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 3. 경계 — 도시가 많고 날이 모자람');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[초과]');
  const next = await build(page, {
    cities: [['카탈루냐', '바르셀로나'], ['마드리드·중부', '마드리드'], ['안달루시아', '세비야'],
      ['안달루시아', '그라나다'], ['북부', '빌바오'], ['북서부', '산티아고데콤포스텔라']],
    from: '2026-09-14', to: '2026-09-18',
  });
  await next();
  await page.waitForSelector('.plan-tab', { timeout: 30000 });
  const over = page.locator('.notice', { hasText: '모자랍니다' });
  check('날이 모자라면 알린다', (await over.count()) === 1);
  if (await over.count()) {
    const chips = await over.locator('.chip').count();
    check('뺄 도시를 고를 수 있다', chips > 0, `${chips}곳 제시`);
    const before = await page.locator('.itin-city').count();
    await over.locator('.chip').first().click();
    await page.waitForTimeout(1600);
    check('도시를 빼면 여정에서 사라진다', (await page.locator('.itin-city').count()) < before,
      `${before} → ${await page.locator('.itin-city').count()}`);
  }
  const dayCount = await page.locator('.day').count();
  check('일정 일수가 여행 일수와 같다', dayCount === 5, `${dayCount}일 / 5일`);
  await page.screenshot({ path: new URL('04-overflow.png', shots).pathname });
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 4. 경계 — 섬 포함 (항공만) · 왕복 공항');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[섬]');
  const next = await build(page, {
    cities: [['카탈루냐', '바르셀로나'], ['섬', '팔마데마요르카']],
    from: '2026-09-14', to: '2026-09-21',
    airports: ['BCN', 'BCN'],
  });
  await next();
  await page.waitForSelector('.plan-tab', { timeout: 30000 });
  const t = await page.locator('.travel-block').first().innerText().catch(() => '');
  check('섬 구간은 항공으로 이어진다', /항공|✈/.test(t), t.split('\n').slice(0, 2).join(' | '));
  const dayCount = await page.locator('.day').count();
  check('8일 일정이 8일로 나온다', dayCount === 8, `${dayCount}일`);
  await next();
  await page.waitForSelector('.trip-map', { timeout: 25000 });
  check('섬 포함해도 지도가 그려진다', (await page.locator('.trip-map').count()) === 1);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 5. 데이터 무결성');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[데이터]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const probe = await page.evaluate(async (b) => {
    const idx = await (await fetch(`${b}data/spain.json`)).json();
    const rail = await (await fetch(`${b}data/spain-rail.json`)).json();
    let items = 0; let noSummary = 0; let noWhy = 0; let badPrice = 0; let noCoord = 0;
    for (const c of idx.cities.slice(0, 12)) {
      const list = await (await fetch(`${b}data/cities/${c.slug}.json`)).json();
      for (const i of list) {
        items += 1;
        if (!i.summary) noSummary += 1;
        if (!i.why) noWhy += 1;
        if (i.priceEur !== null && (i.priceEur < 0 || i.priceEur > 500)) badPrice += 1;
        if (i.lat === null || i.lon === null) noCoord += 1;
      }
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return {
      cities: idx.cities.length,
      items, noSummary, noWhy, badPrice, noCoord,
      railPairs: Object.keys(rail.pairs).length,
      railExpired: today > rail.validTo,
      railValidTo: rail.validTo,
    };
  }, base);
  check('도시 60곳', probe.cities === 60, `${probe.cities}곳`);
  check('아이템 요약이 모두 있다', probe.noSummary === 0, `표본 ${probe.items}개 중 ${probe.noSummary}개 누락`);
  check('아이템 설명이 모두 있다', probe.noWhy === 0, `${probe.noWhy}개 누락`);
  check('비정상 요금이 없다', probe.badPrice === 0, `${probe.badPrice}건`);
  check('철도 시간표가 실려 있다', probe.railPairs > 100, `${probe.railPairs}쌍`);
  check('철도 시간표가 만료되지 않았다', !probe.railExpired, `유효 ~${probe.railValidTo}`);
  console.log(`     (좌표 없는 아이템 ${probe.noCoord}/${probe.items} — 지도에서 제외됨, 정상)`);
  await ctx.close();
}

await browser.close();

// ─────────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(60)}`);
console.log(`검사 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
if (failed.length) {
  console.log('\n실패한 검사:');
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
}
if (allErrors.length) {
  console.log(`\n브라우저 오류 ${allErrors.length}건:`);
  for (const e of [...new Set(allErrors)].slice(0, 12)) console.log(`  ${e}`);
} else {
  console.log('\n브라우저 오류 없음');
}
if (remote.size) {
  console.log(`\n(외부 호스트 ${[...remote].join(', ')} 접속 실패 — 이 검증 환경에`);
  console.log(' 인터넷이 없어서이며, 앱은 원격 사진이 실패하면 자리를 비웁니다.)');
}
process.exit(failed.length || allErrors.length ? 1 : 0);
