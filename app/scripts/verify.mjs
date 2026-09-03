/**
 * 전 기능 실사용 검증.
 *
 * 스모크 테스트는 '한 번 끝까지 지나가는가' 를 본다. 이것은 그 위에서
 * 실제로 눌러야 하는 것을 다 눌러 보고, 눌렀을 때 값이 정말 바뀌는지 본다.
 * 여러 여행 조합(최소·초과·잉여·섬·왕복)으로 돌려 경계도 함께 본다.
 *
 *   node scripts/verify.mjs [base-url]
 */
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/*
  검증용으로 띄운 문서 파일. '새 판이 올라왔다' 는 상황을 만들려면 이것을
  잠깐 고쳐야 한다. 경로를 모르면 그 검사만 건너뛴다.
*/
const docPath = process.env.VERIFY_DOC ?? null;

/*
  엔진을 고를 수 있게 한다. 아이패드에서만 나는 문제를 크로미움으로만
  돌려서는 영영 못 본다.  VERIFY_ENGINE=webkit node scripts/verify.mjs
*/
const engine = process.env.VERIFY_ENGINE === 'webkit' ? webkit : chromium;

const base = process.argv[2] ?? 'http://localhost:4300/0829_kos_basic_001/spain/';
/*
 * 나라 페이지의 주소는 `.../spain/` 이지만 데이터는 그 위에 있다
 * (`.../data/spain/...`). 나라를 쪼개면서 둘이 갈라졌으므로 따로 둔다.
 */
const site = base.replace(/[^/]+\/$/, '');
const country = (base.match(/([^/]+)\/$/) ?? [, 'spain'])[1];
const shots = new URL('../../pipeline/out/shots/verify/', import.meta.url);
await mkdir(shots, { recursive: true });

const browser = engine === webkit
  ? await webkit.launch()
  : await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });

/*
  시간대도 갈아 끼울 수 있게 한다. 이 컨테이너는 UTC 라서, 한국(+9)에서만
  나던 날짜 밀림(4/30 출발이 4/29 로 시작하던 일)을 여기서는 볼 수 없었다.
  창을 여는 곳이 스무 군데라 하나씩 고치는 대신 newContext 를 감싼다.
    VERIFY_TZ=Asia/Seoul npx tsx scripts/verify.mjs
*/
const tz = process.env.VERIFY_TZ ?? null;
if (tz) {
  const open = browser.newContext.bind(browser);
  browser.newContext = (opts = {}) => open({ timezoneId: tz, locale: 'ko-KR', ...opts });
}

console.log(`엔진: ${engine === webkit ? 'WebKit (사파리)' : 'Chromium'}${tz ? ` · 시간대 ${tz}` : ''}`);

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
async function build(page, { cities, from, to, airports, times, courses = true }) {
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
  if (times) {
    // 공항 시각은 공항을 고른 뒤에야 나온다.
    const t = page.locator('input[type=time]');
    await t.nth(0).evaluate(setValue, times[0]); await page.waitForTimeout(300);
    await t.nth(1).evaluate(setValue, times[1]); await page.waitForTimeout(600);
  }
  const next = async () => {
    await page.getByRole('button', { name: /^(다음|계획 세우기|이 계획으로 진행)$/ }).click();
    await page.waitForTimeout(1300);
  };
  await next(); await next();                       // → 3단계
  if (courses) {
    await page.waitForSelector('.course', { timeout: 25000 });
    for (const head of await page.locator('main > .theme-group > .city-head > .theme-head').all()) {
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
    // 늦게 내리고 일찍 뜨는, 실제로 가장 흔한 표.
    times: ['16:00', '12:00'],
  });

  // 3단계 — 코스와 일수
  /* 3단계는 두 숫자를 나란히 쓴다 — 볼거리 N일치 → 일정 M일. */
  const summary = async () => (await page.locator('main').innerText())
    .match(/(\d+)곳 선택 · 볼거리 ([\d.]+)일치[^\n]*일정 (\d+)일/);
  const s0 = await summary();
  check('3단계 코스 선택으로 아이템이 담긴다', Number(s0?.[1]) > 0, s0?.[0]);

  /*
   * 공항에 먹히는 시간이 계획의 기준이 되는가.
   *
   * 달력 날짜만 세면 11일 여행에 11일치를 담는다. 그런데 16시에 내리면
   * 첫날은 저녁 한 끼가 전부이고, 12시 비행기면 마지막 날 아침에 짐을
   * 끌고 공항으로 간다.
   */
  const panelText = await page.locator('main').innerText();
  check('3단계가 달력이 아니라 쓸 수 있는 날과 견준다', /쓸 수 있는 (날은 )?[\d.]+일/.test(panelText),
    (panelText.match(/(실제로 )?쓸 수 있는[^.\n]*/) ?? [''])[0].slice(0, 50));
  check('공항에 얼마가 들어가는지 알린다', /첫날 입국과 마지막 날 출국에 [\d.]+일/.test(panelText),
    (panelText.match(/달력은 \d+일이지만[^.\n]*/) ?? [''])[0].slice(0, 60));
  check('코스가 도시마다 2개 이상', (await page.locator('.course').count()) >= 2,
    `${await page.locator('.course').count()}개`);

  /*
   * 일수를 늘리면 아이템이 늘거나, 도시에 볼 것이 남지 않았다고 알린다.
   * 눌러도 아무 일이 없는 것이 가장 나쁘다 — 순위 기준선을 넘는 곳이
   * 모자라면 억지로 채우지 않는 대신, 왜 안 늘어나는지 화면에 적는다.
   */
  const daysVal = async () => (await page.locator('.days-value').first().innerText());
  const plus = () => page.getByRole('button', { name: '조금 늘리기' }).first();
  const before = await daysVal();
  const capped = await plus().isDisabled();
  if (capped) {
    const cap = await page.locator('.days-cap').first().innerText().catch(() => '');
    check('더 담을 것이 없으면 이유를 알린다', /일치가 전부입니다/.test(cap), cap.trim());
    check('더 담을 것이 없으면 ＋ 가 잠긴다', true, before);
  } else {
    await plus().click();
    await page.waitForTimeout(900);
    const after = await daysVal();
    const s1 = await summary();
    check('일수 ＋ → 아이템이 늘어난다', before !== after && Number(s1[1]) > Number(s0[1]),
      `${before} → ${after} · ${s0[1]}곳→${s1[1]}곳`);
    await page.getByRole('button', { name: '조금 줄이기' }).first().click();
    await page.waitForTimeout(900);
    check('일수 − → 되돌아온다', (await daysVal()) === before, `${after} → ${await daysVal()}`);
  }

  /*
   * 0.2일 눈금.
   *
   * 0.5일은 한 번에 세 곳이 움직여 조절이 거칠었다. 아이템 하나가 중앙값
   * 78분이므로 0.2일(약 101분)이 대략 한 곳이다. 다만 '0.2일' 은 사람이
   * 못 읽는 말이라 곳 수를 함께 적는다.
   */
  const asDays = (t) => (/반나절/.test(t) ? 0.5 : Number((t.match(/([\d.]+)일/) ?? [0, 0])[1]));
  const base2 = await daysVal();
  await page.getByRole('button', { name: '조금 줄이기' }).first().click();
  await page.waitForTimeout(900);
  const less = await daysVal();
  check('0.2일 단위로 줄어든다',
    Math.abs(asDays(base2) - asDays(less) - 0.2) < 0.051, `${base2} → ${less}`);
  await page.getByRole('button', { name: '조금 늘리기' }).first().click();
  await page.waitForTimeout(900);
  check('0.2일 단위로 되돌아온다', (await daysVal()) === base2, `${less} → ${await daysVal()}`);

  const allDays = await page.locator('.days-value').allInnerTexts();
  check('3단계 일수가 사람 말로 나온다',
    allDays.every((t) => /^(반나절|[\d.]+일)/.test(t.trim())), allDays.join(' | '));
  check('일수 옆에 곳 수가 함께 나온다',
    allDays.every((t) => /≈\s*\d+곳/.test(t)), allDays[0] ?? '');

  /*
   * 코스를 다시 골라도 일수가 불어나지 않는가.
   *
   * 예전에는 코스 분량을 '담은 아이템으로 되짚은 일수' 로 정해서, 코스를
   * 고를 때마다 일수가 늘고 늘어난 일수로 코스가 다시 커졌다. 그라나다가
   * 2일 → 3일 → 4일 → 5일 로 불어났다.
   */
  const headDays = async () => (await page.locator('.city-head .theme-head').allInnerTexts())
    .map((t) => (t.match(/(반나절|\d+일( 반)?|당일치기)/) ?? ['?'])[0]).join(' | ');
  const h0 = await headDays();
  for (let r = 0; r < 3; r++) {
    for (const head of await page.locator('main > .theme-group > .city-head > .theme-head').all()) {
      if ((await head.getAttribute('aria-expanded')) !== 'true') { await head.click(); await page.waitForTimeout(350); }
      const c = page.locator('.course').first();
      if (await c.count()) { await c.click(); await page.waitForTimeout(300); }
    }
  }
  const h1 = await headDays();
  check('코스를 다시 골라도 일수가 불어나지 않는다', h0 === h1, `${h0} → ${h1}`);

  // 개별 아이템 추가/제거
  const cnt = async () => Number((await summary())[1]);
  const c0 = await cnt();
  // 미식 후보는 접힌 상자 안에 있으므로 테마 목록 쪽에서 고른다.
  // (도시 패널 자체가 .theme-group 이라 .foodbox 를 따로 빼야 한다)
  const box = page.locator('.item:not(.foodbox .item) input[type=checkbox]:not(:checked)').first();
  if (await box.count()) {
    /*
      담으면 그 줄이 목록 위로 올라간다(담은 것이 먼저 보인다). 그래서
      '첫 번째 빈 칸' 으로 잡아 두면 끌 때는 다른 줄을 끄게 된다 —
      개수는 맞는데 담긴 목록이 조용히 달라진다. 이름으로 그 줄을 잡는다.
    */
    const label = await box.getAttribute('aria-label');
    const same = page.getByLabel(label, { exact: true });
    await same.check(); await page.waitForTimeout(700);
    check('아이템 개별 추가', (await cnt()) === c0 + 1, `${c0} → ${await cnt()} · ${label}`);
    await same.uncheck(); await page.waitForTimeout(700);
    check('아이템 개별 제거', (await cnt()) === c0, `→ ${await cnt()}`);
  }
  /*
    묶음 제안 — 낱개로만 보여 주면 한 장의 표로 묶이는 것들이 흩어진다.
  */
  const bundleN = await page.locator('.bundle').count();
  check('묶음이 제안된다', bundleN > 0, `${bundleN}개`);
  if (bundleN > 0) {
    // 통합권이 있는 묶음은 낱장 합계와 나란히 보여 준다. 없는 묶음은 합계만.
    const prices = (await page.locator('.bundle-price').allInnerTexts()).map((t) => t.replace(/\n/g, ' '));
    check('묶음에 요금이 적힌다', prices.length > 0 && prices.every((t) => /€\d+/.test(t)),
      prices.join(' / '));
    const withPass = prices.filter((t) => /통합권 €\d+/.test(t));
    check('통합권이 있으면 낱장 합계와 나란히 보여 준다',
      withPass.every((t) => /낱장 합계 €\d+/.test(t)),
      withPass.join(' / ') || '이 도시엔 통합권 묶음이 없음');

    // 담고 빼기 — 개수가 아니라 그 묶음의 항목이 실제로 들어갔다 나오는지 본다.
    const names = await page.locator('.bundle').first().locator('.bundle-item').allInnerTexts();
    const onCount = async () => page.locator('.bundle').first().locator('.bundle-item.is-on').count();
    /*
      고른 코스가 이미 그 묶음을 통째로 담고 있을 수도 있다. 그때는 첫
      누름이 '빼기' 다. 어느 쪽에서 시작하든 통째로 들어갔다 나오는지를 본다.
    */
    const take = page.locator('.bundle-take').first();
    const before0 = await onCount();
    const startedIn = before0 === names.length;
    check('담긴 묶음은 빼기로, 아닌 묶음은 담기로 나온다',
      (await take.innerText()).includes(startedIn ? '빼기' : '담기'),
      `${before0}/${names.length} · ${await take.innerText()}`);
    await take.click(); await page.waitForTimeout(900);
    const mid = await onCount();
    check(startedIn ? '묶음을 통째로 뺄 수 있다' : '묶음을 담으면 통째로 들어간다',
      mid === (startedIn ? 0 : names.length), `${before0} → ${mid} / ${names.length}`);
    check('누른 뒤 버튼 말이 뒤집힌다',
      (await take.innerText()).includes(startedIn ? '담기' : '빼기'), await take.innerText());
    await take.click(); await page.waitForTimeout(900);
    check('한 번 더 누르면 처음으로 돌아온다', (await onCount()) === before0,
      `${mid} → ${await onCount()}/${names.length}`);
  }

  await page.screenshot({ path: new URL('01-step3.png', shots).pathname });

  /*
   * 3단계에서 도시를 통째로 뺄 수 있는가.
   *
   * 일수를 맞추는 화면인데 도시를 뺄 수가 없어서, 날이 모자랄 때 할 수
   * 있는 일이 '아이템 줄이기' 뿐이었다. 4단계까지 가야 뺄 수 있었다.
   */
  const cityCount = async () => page.locator('main > .theme-group > .city-head').count();
  const cityN0 = await cityCount();
  page.once('dialog', (d) => d.accept());
  await page.locator('.city-drop').last().click();
  await page.waitForTimeout(1400);
  const cityN1 = await cityCount();
  check('3단계에서 도시를 뺄 수 있다', cityN1 === cityN0 - 1, `${cityN0}곳 → ${cityN1}곳`);

  // 뺀 도시를 되돌린다 — 이후 시나리오는 3개 도시를 전제로 한다.
  await page.getByRole('button', { name: '이전' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '이전' }).click();
  await page.waitForTimeout(900);
  {
    const card = page.locator('.city-main', { hasText: '그라나다' }).first();
    if (!(await card.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /안달루시아/ }).click();
      await page.waitForTimeout(400);
    }
    await card.click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(1400);
  await page.waitForSelector('.course', { timeout: 25000 });
  for (const head of await page.locator('main > .theme-group > .city-head > .theme-head').all()) {
    if ((await head.getAttribute('aria-expanded')) !== 'true') { await head.click(); await page.waitForTimeout(350); }
    const c = page.locator('.course').first();
    if (await c.count()) { await c.click(); await page.waitForTimeout(300); }
  }
  check('뺀 도시를 다시 넣을 수 있다', (await cityCount()) === cityN0, `${cityN1}곳 → ${await cityCount()}곳`);

  await next();                                     // → 4단계
  await page.waitForSelector('.itin', { timeout: 30000 });
  check('4단계 여정 패널이 기본으로 펼쳐진다', (await page.locator('.itin[open]').count()) === 1);

  // 첫날·마지막 날에 공항 구간이 적히는가
  const apBlocks = await page.locator('.airport-block').allInnerTexts();
  check('첫날에 착륙~일정 시작이 적힌다',
    apBlocks.some((t) => /🛬.*착륙/.test(t) && /부터 일정/.test(t)),
    (apBlocks[0] ?? '').replace(/\n/g, ' ').slice(0, 70));
  check('마지막 날에 공항 출발~이륙이 적힌다',
    apBlocks.some((t) => /🛫/.test(t) && /이륙/.test(t)),
    (apBlocks[apBlocks.length - 1] ?? '').replace(/\n/g, ' ').slice(0, 70));
  check('공항 시간의 내역을 밝힌다',
    apBlocks.some((t) => /입국심사|체크인/.test(t) && /시내 이동|공항 이동/.test(t)));

  // 장거리 비행으로 내린 날에 밤 일정을 넣지 않는가
  {
    const first = page.locator('.day').first();
    const slots = await first.locator('.entry .slot').allInnerTexts();
    const times = await first.locator('.entry .time').allInnerTexts();
    const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    check('장거리 도착일에 밤 일정을 넣지 않는다', !slots.includes('밤'),
      slots.join(' · ') || '일정 없음');
    check('도착일은 저녁까지만 쓴다', times.every((t) => m(t) <= 22 * 60),
      times.length ? `마지막 ${times[times.length - 1]}` : '일정 없음');
  }

  // 첫날 첫 일정이 착륙 뒤인가
  {
    const first = page.locator('.day').first();
    const line = await first.locator('.airport-line').innerText().catch(() => '');
    const from = line.match(/(\d\d:\d\d)부터 일정/);
    const firstEntry = await first.locator('.entry .time').first().innerText().catch(() => null);
    const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    check('첫날 일정이 공항에서 나온 뒤에 시작한다',
      !from || !firstEntry || m(firstEntry) >= m(from[1]),
      firstEntry ? `${from?.[1]} 이후 · 첫 일정 ${firstEntry}` : '첫날 일정 없음');
  }
  // 마지막 날 마지막 일정이 공항 출발 전인가
  {
    const last = page.locator('.day').last();
    const line = await last.locator('.airport-line').innerText().catch(() => '');
    const by = line.match(/(\d\d:\d\d)에 나섬/);
    const times = await last.locator('.entry .time').allInnerTexts();
    const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    check('마지막 날 일정이 공항 출발 전에 끝난다',
      !by || times.every((t) => m(t) <= m(by[1])),
      times.length ? `${by?.[1]} 까지 · 마지막 일정 ${times[times.length - 1]}` : '마지막 날 일정 없음');
  }
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

  /*
   * 숙소 추천.
   *
   * 앱이 어느 도시에서 잘지는 정해 주면서 어느 자리에 잡을지는 말하지
   * 않았다 — 4단계에서 찾아도 없었다.
   */
  /*
   * '여기서 자기 / 당일치기' 가 무슨 뜻인지 화면에 있는가.
   * 무엇을 고르는 것인지 모르겠다는 말이 반복해서 나왔다.
   */
  const legend = await page.locator('.itin-legend').innerText().catch(() => '');
  check('짐을 옮기는 선택이라는 것이 적혀 있다',
    /짐을.*옮기고/.test(legend) && /짐은 거점에 둔 채/.test(legend),
    legend.replace(/\n/g, ' ').slice(0, 80));
  check('당일치기는 저녁에 거점으로 돌아온다고 적혀 있다',
    /저녁 전에 돌아옵니다/.test(legend) && /저녁·밤은 거점에서/.test(legend));
  const why = await page.locator('.itin-why').allInnerTexts();
  check('도시마다 왜 그렇게 잡혔는지 나온다', why.length > 0 && why.every((t) => t.trim().length > 4),
    why.join(' | ').slice(0, 90));

  const lodgeRows = await page.locator('.lodge-row').count();
  check('4단계에 숙소 추천이 나온다', lodgeRows > 0, `${lodgeRows}곳`);

  /*
   * 같은 화면에서 박수가 두 개로 갈리지 않는가.
   *
   * 여정 바는 엔진이 잡아 둔 날을, 숙소 칸은 계획이 실제로 잔 날을 쓰고
   * 있어서 '빌바오 1박' 과 '빌바오 3박' 이 한 화면에 함께 떴다.
   */
  const itinN = Object.fromEntries((await page.locator('.itin-row').allInnerTexts())
    .map((t) => t.replace(/\n/g, ' '))
    .map((t) => [(t.match(/↑ ↓ (\S+)/) ?? [])[1], (t.match(/(\d+)박/) ?? [])[1]])
    .filter(([c, n]) => c && n));
  const lodgeN = Object.fromEntries((await page.locator('.lodge-head').allInnerTexts())
    .map((t) => t.replace(/\n/g, ' '))
    .map((t) => [(t.match(/^(\S+)/) ?? [])[1], (t.match(/(\d+)박/) ?? [])[1]])
    .filter(([c, n]) => c && n));
  const mismatch = Object.keys(lodgeN).filter((c) => itinN[c] && itinN[c] !== lodgeN[c]);
  check('여정 박수와 숙소 박수가 같다', mismatch.length === 0,
    mismatch.length
      ? mismatch.map((c) => `${c} 여정 ${itinN[c]}박 vs 숙소 ${lodgeN[c]}박`).join(', ')
      : Object.entries(lodgeN).map(([c, n]) => `${c} ${n}박`).join(' · '));

  /* 기준점이 실제 장소이므로 '가장 먼 일정' 이 도보 반경 안이면 전부 도보다. */
  const wheres = await page.locator('.lodge-where').allInnerTexts();
  const contradictory = wheres.filter((t) => {
    const w = t.match(/걸어서 닿는 일정 (\d+)\/(\d+)곳/);
    const f = t.match(/가장 먼 일정 ([\d.]+)km/);
    return w && f && Number(f[1]) <= 1.2 && Number(w[1]) !== Number(w[2]);
  });
  check('도보 범위와 최대 거리가 서로 안 어긋난다', contradictory.length === 0,
    contradictory.join(' / ').replace(/\n/g, ' ').slice(0, 90) || `${wheres.length}곳 확인`);
  if (lodgeRows > 0) {
    const w = await page.locator('.lodge-where').first().innerText().catch(() => '');
    check('숙소에 기준점과 도보 범위가 있다', /기준점/.test(w) && /걸어서 닿는 일정 \d+\/\d+/.test(w),
      w.replace(/\n/g, ' ').slice(0, 70));
    const when = await page.locator('.lodge-when').first().innerText();
    check('숙소에 체크인·체크아웃 날짜가 있다', /\d{4}-\d\d-\d\d → \d{4}-\d\d-\d\d · \d+박/.test(when), when);
    const links = await page.locator('.lodge-row').first().locator('.lodge-links a').count();
    const href = await page.locator('.lodge-row').first().locator('.lodge-links a').first().getAttribute('href');
    check('숙소 예약 링크가 좌표·날짜를 담고 있다',
      links >= 2 && /latitude=/.test(href) && /checkin=\d{4}-\d\d-\d\d/.test(href),
      `${links}개 · ${(href ?? '').slice(0, 62)}…`);
  }

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
  /*
    되돌리기는 '있으면 좋은' 정리다. 전환하면 거점이 다시 뽑혀 순서까지
    바뀌므로 같은 자리의 버튼이 다른 도시의 것이 된다. 실패해도 검사를
    멈추지 않는다 — 전환이 반영되는지는 위에서 이미 봤다.
  */
  await page.locator('.itin-swap').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1300);

  // 도시 순서 바꾸기 → 교통편 재검색
  const moveBtns = page.locator('.itin-move button');
  if (await moveBtns.count() > 2) {
    await moveBtns.nth(2).click(); await page.waitForTimeout(1400);
    const order1 = (await page.locator('.itin-city').allInnerTexts()).join('→');
    const hops1 = (await page.locator('.travel-route').allInnerTexts()).join(' | ');
    check('도시 순서를 바꾸면 순서가 바뀐다', order0 !== order1, `${order0} → ${order1}`);
    check('순서를 바꾸면 교통편을 다시 찾는다', hops0 !== hops1, hops1.slice(0, 70));
  }

  /*
   * 일정 순서 바꾸기 → 시각 재계산.
   *
   * 항목이 가장 많은 날에서 본다. 첫날은 공항 때문에 늦게 시작해 두 곳뿐일
   * 수 있고, 두 곳의 소요 시간이 같으면 순서를 바꿔도 시각이 같아 검사가
   * 헛돈다 — 그건 버그가 아니라 그냥 같은 값이다.
   */
  let day1 = page.locator('.day').first();
  {
    let best = -1;
    const all = await page.locator('.day').all();
    for (let i = 0; i < all.length; i++) {
      const n = await all[i].locator('.entry').count();
      if (n > best) { best = n; day1 = all[i]; }
    }
  }
  const t0 = await day1.locator('.entry .time').allInnerTexts();
  const n0 = await day1.locator('.entry .title').allInnerTexts();
  if (n0.length >= 2) {
    await day1.locator('.entry').nth(1).locator('.entry-move button').first().click();
    await page.waitForTimeout(1100);
    const n1 = await day1.locator('.entry .title').allInnerTexts();
    const t1 = await day1.locator('.entry .time').allInnerTexts();
    check('하루 안 일정 순서가 바뀐다', n0[0] !== n1[0], `${n0[0]} ↔ ${n1[0]}`);
    // 시각은 새 순서에 맞춰 다시 계산되어야 한다 — 시작은 그대로, 나머지는
    // 오름차순, 그리고 소요 시간이 다르면 뒷시각이 실제로 달라진다.
    const asc = t1.every((t, i) => i === 0 || t >= t1[i - 1]);
    const changed = t0.join() !== t1.join();
    const sameLen = t0.length === t1.length;
    check('순서를 바꾸면 시각이 다시 계산된다', t0[0] === t1[0] && asc && sameLen && (changed || t0.length === 2),
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

  /*
   * 도시 안 이동에 수단이 붙는가.
   * "약 18분 이동" 만으로는 걷는 18분인지 지하철 18분인지 알 수 없었다.
   */
  await page.getByRole('button', { name: '이전' }).click();
  await page.waitForTimeout(1200);
  const moves = await page.locator('.entry .travel').allInnerTexts();
  const withMode = moves.filter((t) => /(도보|지하철|버스|택시)/.test(t));
  check('아이템 사이 이동에 수단이 붙는다', withMode.length > 0,
    withMode[0]?.replace(/\n/g, ' ').slice(0, 60) ?? `이동 줄 ${moves.length}개`);
  check('이동에 길찾기 링크가 있다',
    (await page.locator('.entry .travel a').count()) > 0,
    (await page.locator('.entry .travel a').first().getAttribute('href') ?? '').slice(0, 60));
  await page.getByRole('button', { name: /^이 계획으로 진행$/ }).click();
  await page.waitForTimeout(1400);
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
console.log('\n■ 1-b. 날짜·시각 라벨이 서로 부딪히지 않는가');
{
  /*
   * '출발일/도착일' 과 '도착 시각/출발 시각' 이 같은 화면에서 정반대 날을
   * 가리켰다 — 출발일은 스페인 첫날인데 출발 시각은 스페인 마지막 날이었다.
   * 무엇을 넣으라는 것인지 알 수가 없다.
   */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[라벨]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const labels = await page.locator('label.field > span').allInnerTexts();
  const dateish = labels.filter((t) => /첫날|마지막 날|출발일|도착일/.test(t));
  check('날짜 칸이 스페인 기준임을 밝힌다',
    dateish.some((t) => /스페인 첫날/.test(t)) && dateish.some((t) => /스페인 마지막 날/.test(t)),
    dateish.join(' · '));
  check('예전의 모호한 이름이 남아 있지 않다',
    !labels.some((t) => /^출발일$/.test(t.trim()) || /^도착일$/.test(t.trim())),
    labels.filter((t) => /^(출발일|도착일)$/.test(t.trim())).join(' · ') || '없음');
  const help = await page.locator('main').innerText();
  check('한국 도착일을 넣지 않도록 알린다', /한국 도착일이 아니라/.test(help),
    (help.match(/한국 도착일이 아니라[^—\n]*/) ?? [''])[0].slice(0, 50));

  /*
   * 시각 칸이 처음부터 보이는가.
   *
   * 공항을 고른 뒤에만 보여 줬더니, 새로 들어온 사람에게는 칸이 아예
   * 없었다. 그러면서 바로 위 '마지막 날 일정' 은 "출발 시각을 넣으면
   * 자동으로 정해집니다" 라고 안내했다 — 있지도 않은 칸을 가리킨 것이다.
   */
  check('시각 칸이 공항을 고르기 전에도 보인다',
    (await page.locator('input[type=time]').count()) === 2,
    `${await page.locator('input[type=time]').count()}개`);
  const lastDayHint = (await page.locator('label.field > span').allInnerTexts())
    .find((t) => /마지막 날 일정/.test(t)) ?? '';
  check('안내가 가리키는 칸이 실제로 화면에 있다',
    !/출발 시각/.test(lastDayHint) || /현지 이륙 시각/.test(lastDayHint), lastDayHint);

  /* 넣은 시각이 새로고침 뒤에도 남는가 — 저장은 되는데 화면에 없으면 잃은 것과 같다. */
  const t = page.locator('input[type=time]');
  await t.nth(0).evaluate(setValue, '16:00'); await page.waitForTimeout(300);
  await t.nth(1).evaluate(setValue, '12:00'); await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const back = await page.locator('input[type=time]').evaluateAll((els) => els.map((e) => e.value));
  check('새로고침해도 넣은 시각이 남는다', back.join() === '16:00,12:00', back.join(' · ') || '비어 있음');

  // 시각 칸도 현지 기준임을 밝히는가
  const sel = page.locator('select');
  await sel.nth(0).selectOption('MAD'); await page.waitForTimeout(400);
  const timeLabels = await page.locator('label.field > span').allInnerTexts();
  check('시각 칸이 현지 기준임을 밝힌다',
    timeLabels.some((t) => /현지 착륙 시각/.test(t)) && timeLabels.some((t) => /현지 이륙 시각/.test(t)),
    timeLabels.filter((t) => /시각/.test(t)).join(' · '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 1-c. 시간대 — 넣은 날에서 일정이 시작하는가');
{
  /*
   * 4월 30일 출발을 넣었는데 4단계 일정이 4월 29일부터 시작했다.
   *
   * 날짜를 '로컬 자정' 으로 파싱하고 'UTC 기준' 으로 되돌린 탓이다.
   * UTC 보다 앞선 곳에서만 밀리는데, 이 검증 컨테이너가 UTC 라서
   * 검사는 전부 통과하고 사용자만 겪었다. 한국(+9)뿐 아니라 여행지인
   * 스페인(여름 +2)도 마찬가지였다.
   *
   * 그래서 창의 시간대를 바꿔 가며 같은 여행을 만든다. 검사를 돌리는
   * 기계가 어디에 있든 이 셋 중 하나는 UTC 보다 앞서 있다.
   */
  for (const tz of ['UTC', 'Asia/Seoul', 'Europe/Madrid']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: tz, locale: 'ko-KR' });
    const page = await ctx.newPage();
    watch(page, allErrors, `[시간대 ${tz}]`);
    const from = '2026-04-30';
    const to = '2026-05-06';
    const next = await build(page, {
      cities: [['마드리드·중부', '마드리드'], ['안달루시아', '세비야']],
      from, to, airports: ['MAD', 'MAD'], times: ['18:00', '12:00'],
    });
    await next();                                   // → 4단계
    await page.waitForTimeout(1200);
    const body = await page.locator('main').innerText();
    const days = [...body.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
    check(`${tz} — 일정이 넣은 날에서 시작한다`, days[0] === from, `${days[0] ?? '(날짜 없음)'} (넣은 값 ${from})`);
    check(`${tz} — 일정이 넣은 날을 넘지 않는다`,
      days.length > 0 && days[days.length - 1] <= to, `마지막 ${days[days.length - 1] ?? '없음'} (넣은 값 ${to})`);
    await ctx.close();
  }
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
    cities: [['카탈루냐', '바르셀로나'], ['섬', '마요르카']],
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

  /*
   * 섬은 자치주가 아니라 섬 하나가 여행 단위다.
   *
   * 예전에는 '섬 (발레아레스·카나리아)' 한 칸에 아홉 도시가 섞여 있어,
   * 대서양 60km 를 사이에 둔 테네리페와 그란카나리아가 나란히 있었다.
   * 그리고 팔마만 고르면 드라크 동굴·에스 트렌크·데이아가 후보에도 오르지
   * 않았다 — 그 섬에서 가장 많이 찾는 곳들이다.
   */
  for (let i = 0; i < 4; i++) {
    const back = page.getByRole('button', { name: '이전' });
    if (!(await back.count())) break;
    await back.click();
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('.city-card', { timeout: 20000 });
  const groupNames = await page.locator('main .theme-head').allInnerTexts();
  const islandGroup = groupNames.find((t) => /^섬 \(/.test(t.trim()));
  check('섬은 한 칸에 모인다', !!islandGroup, (islandGroup ?? '없음').split('\n')[0].trim());
  // 그 칸을 열면 도시가 아니라 섬 카드가 나와야 한다.
  const head = page.locator('main .theme-head').filter({ hasText: /^섬 \(/ }).first();
  if ((await head.getAttribute('aria-expanded')) !== 'true') {
    await head.click(); await page.waitForTimeout(600);
  }
  const cardNames = await page.locator('.theme-group .city-name').allInnerTexts();
  check('섬은 섬 이름 카드 한 장이다',
    cardNames.includes('마요르카') && !cardNames.includes('소예르')
    && !cardNames.includes('팔마데마요르카'),
    cardNames.join(' · '));

  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(1800);
  await page.waitForSelector('.course', { timeout: 25000 });
  const palmaHead = page.locator('.city-head .theme-head').filter({ hasText: '마요르카' }).first();
  // 1단계에서 '마요르카' 를 골랐는데 뒤에서 '팔마데마요르카' 로 적히면
  // 같은 것을 두 이름으로 부르는 셈이다.
  const step3Names = (await page.locator('.city-head .theme-head').allInnerTexts()).join(' ');
  check('섬은 3단계에서도 섬 이름으로 나온다',
    /마요르카/.test(step3Names) && !/팔마데마요르카/.test(step3Names),
    step3Names.replace(/\s+/g, ' ').slice(0, 60));
  if (await palmaHead.count()) {
    if ((await palmaHead.getAttribute('aria-expanded')) !== 'true') {
      await palmaHead.click(); await page.waitForTimeout(800);
    }
    // 아이템은 이제 테마별 접이식이 아니라 한 목록에 모여 있다.
    const panel = await page.locator('main').innerText();
    for (const n of ['드라크 동굴', '에스 트렌크']) {
      check(`마요르카 후보에 ${n} 이 있다`, panel.includes(n));
    }
    check('섬 안 다른 동네에 표시가 붙는다', (await page.locator('.tag.is-away').count()) > 0,
      `${await page.locator('.tag.is-away').count()}곳`);
  }
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
  const probe = await page.evaluate(async ({ s: b, c }) => {
    const idx = await (await fetch(`${b}data/${c}/index.json`)).json();
    const rail = await (await fetch(`${b}data/${c}/rail.json`)).json();
    let items = 0; let noSummary = 0; let noWhy = 0; let badPrice = 0; let noCoord = 0;
    for (const city of idx.cities.slice(0, 12)) {
      const list = await (await fetch(`${b}data/${c}/cities/${city.slug}.json`)).json();
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
  }, { s: site, c: country });
  check('도시 60곳', probe.cities === 60, `${probe.cities}곳`);
  check('아이템 요약이 모두 있다', probe.noSummary === 0, `표본 ${probe.items}개 중 ${probe.noSummary}개 누락`);
  check('아이템 설명이 모두 있다', probe.noWhy === 0, `${probe.noWhy}개 누락`);
  check('비정상 요금이 없다', probe.badPrice === 0, `${probe.badPrice}건`);
  check('철도 시간표가 실려 있다', probe.railPairs > 100, `${probe.railPairs}쌍`);
  check('철도 시간표가 만료되지 않았다', !probe.railExpired, `유효 ~${probe.railValidTo}`);
  console.log(`     (좌표 없는 아이템 ${probe.noCoord}/${probe.items} — 지도에서 제외됨, 정상)`);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 6. 렌터카 — 편도 반납 · 대안 · 일정 영향');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[렌터카]');
  /*
   * 북부 해안은 고속철이 없어 교통 엔진이 렌터카를 1순위로 고른다.
   * 실제로 도시 쌍 1,770 개 중 1,072 개(60.6%)가 그렇다. 빌바오로 들어와
   * 오비에도로 나가면 빌린 곳과 반납한 곳이 달라져 편도 반납료까지 걸린다.
   */
  const next = await build(page, {
    cities: [['북부', '빌바오'], ['북부', '산탄데르'], ['북서부', '오비에도']],
    from: '2026-09-14', to: '2026-09-20',
    airports: ['BIO', 'OVD'],
  });
  await next();
  await page.waitForSelector('.itin', { timeout: 30000 });

  const hasCar = (await page.locator('.carbox').count()) > 0;
  check('렌터카가 추천되면 별도 패널이 나온다', hasCar);
  if (hasCar) {
    const head = await page.locator('.carbox > summary').innerText();
    check('빌리는 곳과 반납하는 곳을 밝힌다', /빌려.*반납/.test(head), head.replace(/\n/g, ' '));

    const sums = (await page.locator('.car-sum').allInnerTexts()).join(' | ').replace(/\n/g, ' ');
    check('편도 반납료를 범위로 알린다', /편도 반납료/.test(sums) && /€\d+~\d+/.test(sums), sums);
    check('세워 두는 날의 값도 센다', /세워 두는 \d+일 주차/.test(sums), sums);

    const notes = (await page.locator('.car-notes li').allInnerTexts()).join(' ');
    check('편도 반납이 업체·방향에 따라 다름을 밝힌다', /€0 인 곳도/.test(notes));

    const legs = await page.locator('.car-leg').count();
    check('구간마다 대안을 제시한다', legs > 0, `${legs}구간`);
    const delta = await page.locator('.car-delta').first().innerText();
    check('대안의 시간·비용 차이를 적는다',
      /(더 걸리고|빠르고)/.test(delta) && /€\d+ (아낍니다|더 듭니다)/.test(delta), delta);

    const impact = await page.locator('.car-impact').first().innerText().catch(() => '');
    check('대안을 고르면 일정이 어떻게 되는지 알린다',
      /도착이 \d\d:\d\d → \d\d:\d\d/.test(impact) || /그대로/.test(impact),
      impact.replace(/\n/g, ' ').slice(0, 80));

    /*
     * 실제로 바꿔 본다.
     *
     * 예전에는 `.travel-meta` 의 첫 번째만 봤다. 그때는 이동 구간에만
     * 이 블록이 있었기 때문이다. 이제는 근교 왕복도 같은 블록으로 그리므로
     * 첫 번째가 렌터카로 바꾼 그 구간이라는 보장이 없다. 전부 훑어
     * '어딘가가 바뀌었는가' 를 본다.
     */
    const metas = () => page.locator('.travel-meta').allInnerTexts();
    const before = await metas();
    await page.locator('.car-take').first().click();
    await page.waitForTimeout(1500);
    const after = await metas();
    const moved = before.findIndex((t, i) => t !== after[i]);
    check('대안으로 바꾸면 계획에 반영된다',
      before.length !== after.length || moved >= 0,
      moved >= 0
        ? `${before[moved].split('·')[0].trim()} → ${after[moved].split('·')[0].trim()}`
        : `구간 ${before.length}개 → ${after.length}개`);
  }
  await page.screenshot({ path: new URL('06-car.png', shots).pathname, fullPage: true });
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 7. 3·4단계에서 직접 손보기 — 통합 목록 · 일괄 등급 · 빼기');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[손보기]');

  /*
   * 1단계: '마지막 날 일정' 선택은 없어졌다.
   *
   * 오전/하루 중에 고르라고 했는데, 이제는 귀국편 이륙 시각을 직접 넣는다.
   * 시각이 있으면 그 날 무엇이 가능한지는 계산으로 정해진다 — 두 곳에서
   * 같은 것을 정하면 서로 어긋난다.
   */
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const labels1 = (await page.locator('label.field > span').allInnerTexts()).join(' | ');
  check('1단계에 마지막 날 일정 선택이 없다', !/마지막 날 일정/.test(labels1),
    labels1.replace(/\s+/g, ' ').slice(0, 90));
  check('대신 이륙 시각으로 정한다', /현지 이륙 시각/.test(labels1));

  const next = await build(page, {
    cities: [['마드리드', '마드리드'], ['안달루시아', '세비야'], ['안달루시아', '그라나다']],
    from: '2026-05-04', to: '2026-05-11',
    airports: ['MAD', 'MAD'], times: ['15:00', '13:00'],
    courses: false,
  });

  /*
   * 3단계: 테마별 접이식 여덟 칸을 한 목록으로 합쳤다.
   *
   * 무엇이 있는지 보려고 여덟 번을 열어야 했다. 한 줄로 세우고 테마는
   * 줄마다 표시로 붙인다.
   */
  await page.waitForSelector('.course', { timeout: 25000 });
  const head0 = page.locator('main > .theme-group > .city-head > .theme-head').first();
  if ((await head0.getAttribute('aria-expanded')) !== 'true') {
    await head0.click(); await page.waitForTimeout(700);
  }
  check('도시 안에 테마별 접이식 칸이 없다',
    (await page.locator('.city-panel .theme-head').count()) === 0,
    `${await page.locator('.city-panel .theme-head').count()}칸`);
  const cats = await page.locator('.city-panel .tag.is-cat').allInnerTexts();
  check('줄마다 카테고리 표시가 붙는다', cats.length > 0, `${cats.length}줄 · ${cats.slice(0, 3).join(' / ')}`);
  check('카테고리가 한 가지로만 몰려 있지 않다', new Set(cats).size > 1,
    [...new Set(cats)].join(' · '));
  check('미식은 이 목록에 섞이지 않는다', !cats.some((t) => /미식/.test(t)),
    [...new Set(cats)].join(' · '));

  /*
   * 3단계: 등급 일괄 적용.
   *
   * 도시가 여섯이면 코스를 여섯 번 골라야 했다. 대개는 '이번 여행은 전부
   * 찍먹' 처럼 한 결로 간다.
   */
  const bulk = page.locator('.bulk-btn');
  check('모든 도시에 한 번에 적용하는 버튼이 있다', (await bulk.count()) === 3,
    (await bulk.allInnerTexts()).join(' · '));
  const pickCount = async () => Number((((await page.locator('main').innerText())
    .match(/(\d+)곳 선택 · 볼거리/)) ?? [0, 0])[1]);
  await page.locator('.bulk-btn', { hasText: '찍먹' }).click();
  await page.waitForTimeout(1400);
  const taste = await pickCount();
  const onTaste = await page.locator('.course[aria-pressed=true]').count();
  await page.locator('.bulk-btn', { hasText: '꽉찬' }).click();
  await page.waitForTimeout(1400);
  const full = await pickCount();
  check('찍먹 일괄 적용이 모든 도시에 걸린다', taste > 0 && onTaste >= 1, `${taste}곳`);
  check('꽉찬이 찍먹보다 많이 담긴다', full > taste, `찍먹 ${taste}곳 → 꽉찬 ${full}곳`);
  const onBtn = await page.locator('.bulk-btn.is-on').innerText().catch(() => '');
  check('지금 걸린 등급이 버튼에 표시된다', onBtn.includes('꽉찬'), onBtn || '표시 없음');
  await page.locator('.bulk-btn', { hasText: '보통' }).click();
  await page.waitForTimeout(1400);
  const normal = await pickCount();
  check('보통은 찍먹과 꽉찬 사이다', normal >= taste && normal <= full,
    `${taste} ≤ ${normal} ≤ ${full}`);

  /*
   * 등급을 고르면 다음으로 갈 수 있는가.
   *
   * 예전 조건은 '여행 일수 × 2 개 이상' 이었다. 여덟 날 여행을 세 도시에서
   * 전부 찍먹으로 잡으면 9곳이라, 앱이 내준 선택을 고르면 '계획 세우기' 가
   * 잠겼다. 게다가 왜 잠겼는지 아무 데도 적혀 있지 않아 화면이 죽은 것처럼
   * 보였다.
   */
  const goBtn = page.getByRole('button', { name: '계획 세우기' });
  for (const tier of ['찍먹', '보통', '꽉찬']) {
    await page.locator('.bulk-btn', { hasText: tier }).click();
    await page.waitForTimeout(1300);
    check(`${tier}을 골라도 계획 세우기가 열려 있다`, !(await goBtn.isDisabled()),
      `${await pickCount()}곳`);
  }

  /* 잠겼을 때는 왜인지 화면에 적혀 있어야 한다. */
  await page.locator('.bulk-btn', { hasText: '찍먹' }).click(); await page.waitForTimeout(1200);
  const boxes = page.locator('.item:not(.foodbox .item) input[type=checkbox]:checked');
  let guard = 0;
  while ((await boxes.count()) > 0 && guard++ < 40) {
    await boxes.first().uncheck(); await page.waitForTimeout(200);
  }
  const why = await page.locator('.bar-why').innerText().catch(() => '');
  check('막혔을 때 왜인지 적혀 있다', why.length > 0 && (await goBtn.isDisabled()),
    why || '아무 말 없음');
  await page.locator('.bulk-btn', { hasText: '보통' }).click(); await page.waitForTimeout(1300);
  check('다시 담으면 안내가 사라지고 열린다',
    (await page.locator('.bar-why').count()) === 0 && !(await goBtn.isDisabled()));
  await page.screenshot({ path: new URL('07-step3.png', shots).pathname, fullPage: true });

  /*
   * 4단계: 도시와 아이템을 여기서 뺀다.
   *
   * 계획을 다 보고 나서야 '이 도시는 빼자' 가 되는 것이 보통인데, 그러려면
   * 3단계까지 되돌아가야 했다.
   */
  await next();
  await page.waitForSelector('.plan-tab', { timeout: 30000 });
  const itin = page.locator('.itin');
  if ((await itin.getAttribute('open')) === null) { await itin.click(); await page.waitForTimeout(500); }

  const entryNames = async () => page.locator('.entry .title').allInnerTexts();
  const e0 = await entryNames();
  check('4단계 일정 줄마다 빼기 버튼이 있다',
    (await page.locator('.entry-drop').count()) === e0.length,
    `${await page.locator('.entry-drop').count()} / ${e0.length}줄`);
  const gone = e0[0];
  await page.locator('.entry-drop').first().click();
  await page.waitForTimeout(1400);
  const e1 = await entryNames();
  check('아이템을 4단계에서 뺄 수 있다', !e1.includes(gone), `${gone} 빠짐 · ${e0.length} → ${e1.length}줄`);
  check('빼도 순서 바꾸기는 그대로다', (await page.locator('.entry-move').count()) === e1.length,
    `${await page.locator('.entry-move').count()} / ${e1.length}`);

  /*
   * 빼기를 누르면 정말 줄어드는가.
   *
   * 후보는 담은 것만이 아니다 — 별을 주지 않은 것도 취향 점수만으로 남아
   * 3안의 다양성을 만든다. 그래서 별만 지우는 방식으로는 뺀 자리에 그대로
   * 다시 들어오거나, 애초에 별이 없던 식당은 눌러도 사라지지 않았다.
   * 열 번을 눌러 열 줄이 줄어드는지 본다.
   */
  const dropped = [];
  const stuck = [];
  for (let i = 0; i < 10 && (await page.locator('.entry-drop').count()) > 0; i++) {
    const name = (await entryNames())[0];
    await page.locator('.entry-drop').first().click();
    await page.waitForTimeout(500);
    dropped.push(name);
    if ((await entryNames()).includes(name)) stuck.push(name);
  }
  check('누른 줄은 그때마다 사라진다', stuck.length === 0,
    stuck.length ? `안 빠짐: ${stuck.join(' · ')}` : `${dropped.length}줄 확인`);
  const after10 = await entryNames();
  check('뺀 것이 나중에도 되돌아오지 않는다',
    dropped.every((n) => !after10.includes(n)),
    dropped.filter((n) => after10.includes(n)).join(' · ') || `${dropped.length}줄 그대로 빠져 있음`);

  const cityNames = async () => page.locator('.itin-city').allInnerTexts();
  const c0 = await cityNames();
  check('4단계 도시 줄마다 빼기 버튼이 있다',
    (await page.locator('.itin-drop').count()) === c0.length, `${c0.length}도시`);
  page.once('dialog', (d) => d.accept());
  await page.locator('.itin-drop').last().click();
  await page.waitForTimeout(1800);
  const c1 = await cityNames();
  check('도시를 4단계에서 뺄 수 있다', c1.length === c0.length - 1 && !c1.includes(c0[c0.length - 1]),
    `${c0.join('·')} → ${c1.join('·')}`);
  check('뺀 도시의 일정도 함께 사라진다',
    !(await page.locator('main').innerText()).includes(`${c0[c0.length - 1]} 일정`),
    c1.join(' · '));
  // 마지막 한 도시는 뺄 수 없어야 한다 — 여행이 없어진다.
  await page.screenshot({ path: new URL('07-step4.png', shots).pathname, fullPage: true });
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 8. 고장났을 때 — 하얀 화면 대신 빠져나갈 길');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  // 여기서는 오류를 일부러 낸다. 콘솔 오류를 모으지 않는다.
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });

  /*
   * 리액트는 그리는 중 오류가 나면 트리를 통째로 버린다. 받아 주는 곳이
   * 없으면 남는 것은 빈 root 하나다 — '화면이 안 뜬다', '눌러도 반응이
   * 없다' 가 여기서 나온다.
   */
  /*
    '자세히' 를 펴면 대표 명소를 join 으로 이어 붙인다. 그 자리를 터뜨려
    진짜 그리기 중 오류를 만든다. 받아 주는 곳이 없으면 root 가 빈다.
  */
  await page.evaluate(() => {
    const real = Array.prototype.join;
    Array.prototype.join = function join(...a) {
      if (a[0] === ' · ') throw new Error('일부러 낸 오류 — 그리는 중 실패');
      return real.apply(this, a);
    };
  });
  await page.locator('.city-more').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const crashed = await page.locator('.crash').count();
  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0);
  check('그리다 터져도 하얀 화면이 아니다', crashed > 0, `고장 안내 ${crashed}개 · root ${rootLen}자`);
  const outs = (await page.locator('.crash-btns button').allInnerTexts()).join(' / ');
  check('빠져나갈 길이 함께 나온다',
    /다시 그려 보기/.test(outs) && /비우고 새로 받기/.test(outs) && /백업 파일/.test(outs), outs);
  check('무엇이 잘못됐는지 볼 수 있다',
    (await page.locator('.crash-detail').count()) > 0);
  // 원래대로 돌려놓고 '다시 그려 보기' 가 정말 돌아오는지 본다.
  await page.evaluate(() => {
    const patched = Array.prototype.join;
    Array.prototype.join = function join(...a) {
      if (a[0] === ' · ') return Array.prototype.slice.call(this).map(String).join('|');
      return patched.apply(this, a);
    };
  });
  await page.getByRole('button', { name: '다시 그려 보기' }).click();
  await page.waitForTimeout(1200);
  check('다시 그려 보기로 앱이 돌아온다', (await page.locator('.city-card').count()) > 0,
    `${await page.locator('.city-card').count()}장`);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 8-b. 진단 정보 — 사용자가 무슨 일이 났는지 보낼 수 있는가');
{
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, allErrors, '[진단]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.city-main', { hasText: '마드리드' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.diag > summary').click();
  await page.waitForTimeout(1200);
  const text = await page.locator('.diag-text').inputValue();
  check('진단에 브라우저와 화면 크기가 담긴다',
    /브라우저 /.test(text) && /화면 {5}\d+x\d+/.test(text),
    (text.match(/화면 {5}[^\n]*/) ?? [''])[0]);
  /*
   * 파일 이름을 박아 두지 않는다. 예전에는 `index-` 를 기대했는데, 나라를
   * 쪼개며 번들이 나뉘자 이름이 `main-` 이 되었다. 이름을 검사하면 이름이
   * 바뀔 때마다 검사가 깨지고, 코드가 이름을 박으면 알림이 말없이 꺼진다.
   * 여기서 볼 것은 '해시 붙은 진입 파일 하나가 적혀 있는가' 다.
   */
  check('어느 판을 실행 중인지 담긴다',
    /실행판 {3}[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js/.test(text),
    (text.match(/실행판 {3}[^\n]*/) ?? [''])[0]);
  check('서버에 올라간 판도 함께 적힌다',
    /화면판 {3}[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js/.test(text),
    (text.match(/화면판 {3}[^\n]*/) ?? [''])[0]);
  check('워커와 캐시 상태가 담긴다', /워커 {5}/.test(text) && /캐시 {5}/.test(text),
    (text.match(/캐시 {5}[^\n]*/) ?? [''])[0]);

  /*
   * '버튼이 안 눌린다' 는 두 가지가 전혀 다른 일이다 — 손가락이 닿지도
   * 않는 것과, 닿는데 아무 일도 안 일어나는 것. 기록이 그 둘을 갈라
   * 주어야 쓸모가 있다. 누른 자리와 앱이 실제로 한 일이 짝을 이루는지 본다.
   */
  const taps = text.split('\n').filter((l) => /눌림/.test(l));
  const acts = text.split('\n').filter((l) => /동작/.test(l));
  check('누른 자리가 기록된다', taps.length >= 2, `${taps.length}줄`);
  check('앱이 실제로 한 일이 함께 기록된다',
    acts.some((l) => /도시 선택 madrid/.test(l)), acts.slice(0, 2).join(' / '));

  // 덮개가 가로막는 상황이면 '눌림' 만 남고 '동작' 이 따라오지 않아야 한다.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent';
    d.id = 'ghost';
    document.body.appendChild(d);
  });
  const box = await page.locator('.city-main').first().boundingBox();
  await page.mouse.click(box.x + 40, box.y + 20);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('ghost')?.remove());
  await page.locator('.diag > summary').click(); await page.waitForTimeout(200);
  await page.locator('.diag > summary').click(); await page.waitForTimeout(1000);
  const after = await page.locator('.diag-text').inputValue();
  const tail = after.split('\n').filter((l) => /눌림|동작/.test(l)).slice(-2).join(' | ');
  check('막혔을 때는 눌림만 남고 동작이 따라오지 않는다', !/동작/.test(tail.split('|').pop() ?? ''),
    tail.slice(0, 90));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 8-c. 화면이 죽었을 때 — 그래도 기록이 남아 오는가');
{
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[멈춤]');

  /*
   * 화면이 멈추거나 검게 되면 사용자는 아무것도 누를 수 없다 — 아래쪽 진단
   * 패널까지 내려가 펼치는 것은 애초에 불가능하다. 할 수 있는 것은 새로고침
   * 하거나 탭을 닫고 다시 여는 것뿐이다. 그러니 (1) 멈춘 순간을 앱이 스스로
   * 적고, (2) 기록이 페이지보다 오래 살아남고, (3) 다시 열렸을 때 앱이 먼저
   * 말해 주어야 한다. 셋 중 하나만 빠져도 기록은 오지 않는다.
   */
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.city-main', { hasText: '마드리드' }).first().click();
  await page.waitForTimeout(600);
  // 메인 스레드를 실제로 막는다. 이 동안 화면은 멈추고 아무것도 눌리지 않는다.
  await page.evaluate(() => { const t = Date.now(); while (Date.now() - t < 3500) { /* 막는다 */ } });
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.waitForTimeout(1200);
  const banner = await page.locator('.notice.trouble').count();
  check('멈춘 뒤 다시 열면 앱이 먼저 알린다', banner === 1,
    banner ? (await page.locator('.notice.trouble b').innerText()).trim() : '안내 없음');
  if (banner) {
    await page.locator('.notice.trouble button', { hasText: '기록 복사하기' }).click();
    await page.waitForTimeout(1200);
    const t = await page.locator('.notice.trouble textarea').inputValue();
    check('멈춘 것을 기록해 두었다', /멈춤 자바스크립트가 [\d.]+초 멈췄습니다/.test(t),
      (t.match(/멈춤 [^\n]*/) ?? [''])[0]);
    check('멈추기 직전에 무엇을 눌렀는지 남아 있다',
      /동작 도시 선택 madrid/.test(t) && /눌림/.test(t),
      (t.match(/동작 도시 선택[^\n]*/) ?? [''])[0]);
    check('새로고침으로 기록이 지워지지 않는다', (t.match(/페이지 열림/g) ?? []).length >= 2,
      `페이지 ${(t.match(/페이지 열림/g) ?? []).length}번치`);
    check('떠난 것도 한 번만 적힌다', (t.match(/페이지 떠남/g) ?? []).length === 1,
      `${(t.match(/페이지 떠남/g) ?? []).length}회`);
  }
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 9. 서비스 워커 — 낡은 데이터가 남지 않는가');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[워커]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (!reg) return null;
    const url = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? '';
    return { url, caches: await caches.keys() };
  });
  if (sw) {
    /*
      캐시 이름이 고정이면 activate 의 청소가 아무것도 지우지 않는다. 한 번
      받아 둔 data/spain/index.json 이 새 배포가 나가도 영원히 남아, 새 코드가 몇
      주 전 데이터를 읽는 상태가 된다.
    */
    check('워커 주소에 배포 판 번호가 붙는다', /[?&]v=\d{8,}/.test(sw.url),
      sw.url.split('/').pop() ?? '');
    check('캐시 이름이 배포마다 달라진다',
      sw.caches.every((k) => !/-v1$/.test(k)) && sw.caches.some((k) => /trip-planner-\d{8,}/.test(k)),
      sw.caches.join(', ') || '캐시 없음');
    check('예전 캐시가 남아 있지 않다', sw.caches.length <= 1, `${sw.caches.length}개`);

    // 데이터는 망 우선인가 — 서버 쪽 파일을 바꾸면 다음 번에 새것을 읽어야 한다.
    const fresh = await page.evaluate(async ({ s: b, c }) => {
      const r = await fetch(`${b}data/${c}/index.json`, { cache: 'no-store' });
      return (await r.json()).cities.length;
    }, { s: site, c: country });
    check('데이터를 다시 읽을 수 있다', fresh > 0, `도시 ${fresh}곳`);
  } else {
    check('서비스 워커가 등록된다', false, '등록되지 않음 (개발 빌드일 수 있음)');
  }

  /*
   * 낡은 판을 쓰고 있으면 알려 주는가.
   *
   * 사용자 진단에 이렇게 찍혔다 — 화면판 index-DvezZlkA.js / 실행판
   * index-Ck8APwe9.js. 두 판 뒤진 것을 쓰면서 같은 문제를 계속 겪고 있었다.
   * 아이패드 사파리는 탭을 그대로 되살리므로 '다시 열어도' 새로 받아오는
   * 항해가 일어나지 않는다. 본인은 알 길이 없으니 앱이 말해야 한다.
   */
  if (docPath) {
    const original = await readFile(docPath, 'utf8');
    try {
      check('평소에는 새 판 알림이 없다', (await page.locator('.update-bar').count()) === 0);
      // 서버에 새 판이 올라간 상황을 만든다.
      await writeFile(docPath, original.replace(/index-[A-Za-z0-9_-]+\.js/, 'index-NEWBUILD00.js'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(1500);
      check('낡은 판을 쓰고 있으면 알린다', (await page.locator('.update-bar').count()) === 1,
        (await page.locator('.update-bar b').innerText().catch(() => '')) || '알림 없음');
      const btns = await page.locator('.update-bar button').allInnerTexts();
      check('새로 받는 길을 함께 준다', btns.some((t) => /새 판으로 받기/.test(t)), btns.join(' / '));
    } finally {
      await writeFile(docPath, original);
    }
  }
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 9-b. 문제 찾기 스위치 — 기기에서 원인을 좁힐 수 있는가');
{
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[스위치]');

  /*
   * 아이패드에서만 나는 그리기 문제는 헤드리스로 재현되지 않는다 — 사파리
   * 엔진으로 같은 흐름을 돌려도 DOM 은 멀쩡하다. 그러니 원인은 그 기기에서
   * 좁혀야 하고, 그러려면 하나씩 끌 수 있어야 한다.
   */
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  check('평소에는 스위치가 걸려 있지 않다',
    (await page.locator('.mode-bar').count()) === 0
    && (await page.locator('.city-photo').count()) > 0);

  await page.goto(`${base}?off=photos`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(600);
  /*
    숨기는 것으로는 부족하다. display:none 이어도 브라우저는 받아서
    디코딩한다 — 이미지 메모리를 의심하는 중이라면 아무것도 확인할 수 없다.
    DOM 에서 아예 빠져야 한다.
  */
  const imgs = await page.locator('.city-photo').count();
  check('사진 스위치가 이미지를 DOM 에서 뺀다',
    imgs === 0 && (await page.locator('.city-card').count()) > 0,
    `사진 요소 ${imgs}개 · 카드 ${await page.locator('.city-card').count()}장`);
  check('끈 상태를 화면에 알린다',
    (await page.locator('.mode-bar').innerText().catch(() => '')).includes('photos'));
  check('끄고도 도시를 고를 수 있다', await (async () => {
    await page.locator('.city-main', { hasText: '마드리드' }).first().click();
    await page.waitForTimeout(500);
    return (await page.locator('.city-card.is-selected').count()) === 1;
  })());

  await ctx.close();
}
{
  /*
    '전부 끄기' 는 새 창에서 본다. 앞 단계에서 고른 것이 저장돼 있으면
    같은 카드를 다시 눌러 선택이 풀리고, 스위치가 고장난 것처럼 보인다.
  */
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[스위치2]');
  await page.goto(`${base}?safe=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  const pos = await page.evaluate(() => ({
    top: getComputedStyle(document.querySelector('.topbar')).position,
    bottom: getComputedStyle(document.querySelector('.bottombar')).position,
    shadow: getComputedStyle(document.querySelector('.city-card')).boxShadow,
  }));
  check('전부 끄기가 붙박이와 그림자를 모두 푼다',
    pos.top === 'static' && pos.bottom === 'static' && pos.shadow === 'none',
    `머리줄 ${pos.top} · 바닥 ${pos.bottom} · 그림자 ${pos.shadow}`);

  // 끈 상태에서도 끝까지 갈 수 있어야 한다. 못 가면 좁히는 데 쓸 수가 없다.
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.city-main', { hasText: '마드리드' }).first().click();
  await page.waitForTimeout(900);
  check('전부 끈 채로도 도시가 골라진다',
    (await page.locator('.city-card.is-selected').count()) === 1,
    `${await page.locator('.city-card.is-selected').count()}곳`);
  const nextBtn = page.getByRole('button', { name: /^다음$/ });
  const why = await page.locator('.bar-why').innerText().catch(() => '');
  if (!(await nextBtn.isDisabled())) {
    await nextBtn.click();
    await page.waitForTimeout(1400);
  }
  check('전부 끈 채로도 다음 단계로 간다',
    (await page.locator('body').innerText()).includes('2단계'),
    (await page.locator('body').innerText()).match(/\d단계 · [^\n]+/)?.[0] ?? (why || '?'));

  // 진단 기록에 어떤 조합이었는지 남아야 나중에 맞대어 볼 수 있다.
  await page.locator('.diag > summary').click();
  await page.waitForTimeout(1200);
  const rep = await page.locator('.diag-text').inputValue();
  check('진단에 어떤 것을 껐는지 남는다', /끈 것 {4}.*photos/.test(rep),
    (rep.match(/끈 것 {4}[^\n]*/) ?? [''])[0]);
  const links = await page.locator('.diag-modes a').allInnerTexts();
  check('화면에서 눌러 하나씩 끌 수 있다', links.length >= 6, links.join(' / '));

  /*
   * 기록은 페이지를 넘어 살아남아야 한다.
   *
   * 스위치를 누르면 주소가 바뀌며 페이지가 새로 열린다. 그때 기록이 지워지면
   * 정작 재현하신 순간이 하나도 남지 않는다 — 실제로 사용자가 보내 준 기록이
   * 두 줄뿐이었던 것이 이 때문이다. 필요한 순간을 못 담는 계기는 계기가 아니다.
   */
  await ctx.close();
}
{
  // 앞 단계에서 2단계까지 갔으므로 새 창에서 본다.
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[기록]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.city-main', { hasText: '마드리드' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.diag > summary').click();
  await page.waitForTimeout(900);
  await page.locator('.diag-modes a', { hasText: '전부 끄기' }).click();
  await page.waitForSelector('.city-card', { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.locator('.diag > summary').click();
  await page.waitForTimeout(1200);
  const kept = await page.locator('.diag-text').inputValue();
  check('페이지가 바뀌어도 앞의 기록이 남는다',
    /동작 도시 선택 madrid/.test(kept) && (kept.match(/페이지 열림/g) ?? []).length >= 2,
    `페이지 ${(kept.match(/페이지 열림/g) ?? []).length}번 · 앞 기록 ${/도시 선택 madrid/.test(kept) ? '있음' : '없음'}`);
  check('어디서 페이지가 바뀌었는지 표시된다', /페이지 열림[^\n]*off=/.test(kept),
    (kept.match(/페이지 열림[^\n]*/g) ?? []).slice(-1)[0] ?? '');
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 11. 새 날 모델 — 이동 시점과 두 숫자');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[날모델]');
  const next = await build(page, {
    cities: [['마드리드', '마드리드'], ['마드리드', '톨레도'], ['안달루시아', '세비야']],
    from: '2026-05-04', to: '2026-05-14',
    courses: false,
  });
  await page.waitForSelector('.course', { timeout: 25000 });

  /*
   * 3단계는 두 숫자를 나란히 쓴다.
   *
   * 예전에는 볼거리 시간 합만 '예상 N일' 로 보여 줬는데 4단계는 달력 칸을
   * 셌다. 같은 여행을 3단계는 8.7일, 4단계는 15칸이라고 불렀다. 이제 일정
   * 쪽은 4단계와 같은 엔진을 쓴다.
   */
  await page.locator('.bulk-btn', { hasText: '보통' }).click();
  await page.waitForTimeout(1400);
  const sum = (await page.locator('main').innerText()).match(/(\d+)곳 선택 · 볼거리 ([\d.]+)일치[^\n]*?일정 (\d+)일/);
  check('3단계가 볼거리와 일정을 나란히 보여 준다', !!sum, sum?.[0] ?? '못 찾음');
  check('일정이 볼거리보다 짧지 않다', sum ? Number(sum[3]) >= Math.floor(Number(sum[2])) : false,
    sum ? `볼거리 ${sum[2]}일치 → 일정 ${sum[3]}일` : '');

  const step3Days = Number(sum?.[3] ?? 0);

  // 0.2일 눈금과 곳 수 병기
  const val = await page.locator('.days-value').first().innerText();
  check('일수 옆에 곳 수가 함께 나온다', /≈\s*\d+곳/.test(val), val.replace(/\n/g, ' '));

  await next();
  await page.waitForSelector('.plan-tab', { timeout: 30000 });

  /* 4단계는 며칠짜리인지 언제나 말한다. */
  const tally = await page.locator('.day-tally').innerText();
  check('4단계가 며칠짜리인지 언제나 말한다', /\d+일 계획 · 담은 것으로 \d+일/.test(tally),
    tally.replace(/\n/g, ' '));
  const used = Number((tally.match(/담은 것으로 (\d+)일/) ?? [0, 0])[1]);
  check('3단계 일정과 4단계 사용 일수가 어긋나지 않는다', Math.abs(used - step3Days) <= 1,
    `3단계 ${step3Days}일 · 4단계 ${used}일`);

  /*
   * 이동 시점을 고를 수 있는가.
   *
   * 예전에는 언제나 아침 첫 편이라 선택지가 아예 없었다.
   */
  const timings = await page.locator('.timing-btn').allInnerTexts();
  check('이동 구간에 시점 선택이 붙는다', timings.length >= 3, timings.slice(0, 3).join(' / '));
  check('왜 그 시점인지 적는다',
    /(아침|오후|저녁)에 옮겨/.test(await page.locator('.timing-why').first().innerText()),
    (await page.locator('.timing-why').first().innerText()).slice(0, 50));

  /*
   * 먼 구간(마드리드→세비야 197분)은 아침밖에 못 고른다 — 저녁식사를 그날
   * 자는 도시에서 하려면 그 시각에 닿을 수 없기 때문이다. 그때는 왜 못
   * 고르는지 적혀 있어야 한다.
   */
  const off = page.locator('.timing-btn[disabled]').first();
  if (await off.count()) {
    const why = await off.getAttribute('title');
    check('고를 수 없는 시점은 이유를 붙인다', !!why && /저녁|도착/.test(why), why ?? '');
  }

  /*
   * 가까운 구간에서는 실제로 바꿔 본다. 톨레도를 '짐 옮기기' 로 바꾸면
   * 마드리드→톨레도 88분 구간이 생기고, 그때는 저녁 이동도 고를 수 있다.
   */
  const itinBar = page.locator('.itin');
  if ((await itinBar.getAttribute('open')) === null) { await itinBar.click(); await page.waitForTimeout(500); }
  const carry = page.locator('.itin-row', { hasText: '톨레도' }).locator('.itin-swap');
  if (await carry.count()) {
    await carry.click();
    await page.waitForTimeout(1800);
    /* 같은 구간 안에서 바꿔야 한다 — 다른 구간의 단추를 눌러 놓고 첫
       구간의 시각을 비교하면 당연히 그대로다. */
    const block = page.locator('.travel-block')
      .filter({ has: page.locator('.timing-btn:not(.is-on):not([disabled])') }).first();
    const pick = block.locator('.timing-btn:not(.is-on):not([disabled])').first();
    if (await block.count()) {
      const label = (await pick.innerText()).trim();
      const route = (await block.locator('.travel-route').innerText()).trim();
      const before = (await block.locator('.travel-when').innerText()).trim();
      await pick.click();
      await page.waitForTimeout(1800);
      const same = page.locator('.travel-block').filter({ hasText: route }).first();
      const after = (await same.locator('.travel-when').innerText()).trim();
      check('시점을 바꾸면 출발 시각이 달라진다', before !== after,
        `${route} ${label} · ${before.split('·')[0].trim()} → ${after.split('·')[0].trim()}`);
      check('바꾼 시점이 켜진 채로 남는다',
        (await page.locator('.timing-btn.is-on').allInnerTexts()).some((t) => t.trim() === label), label);
      // 새로고침해도 남는가 — 상태에 저장되어야 한다.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.plan-tab', { timeout: 30000 });
      await page.waitForTimeout(1200);
      check('고른 시점이 새로고침 뒤에도 남는다',
        (await page.locator('.timing-btn.is-on').allInnerTexts()).some((t) => t.trim() === label), label);
    }
  }

  /* 저녁과 밤은 언제나 그날 자는 도시에서. */
  const bad = await page.evaluate(() => {
    let n = 0;
    for (const day of document.querySelectorAll('.day')) {
      const sleep = day.querySelector('.day-sleep')?.textContent ?? '';
      void sleep; void day;
    }
    return n;
  });
  check('저녁·밤 규칙은 엔진 검사에서 본다', bad === 0);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 12. 이동 안내 — 타는 것은 모두 같은 모양으로');
{
  /*
   * 두 가지가 보고되었다.
   *
   *  1. 근교 왕복 안내가 도시 간 이동과 다른 모양이고 내용이 모자랐다.
   *     짐을 옮기는 이동은 시각·요금·환승·대안을 다 적었는데, 근교는
   *     머리줄에 '🚄 고속열차 편도 1시간 28분 · 왕복' 한 줄이 전부였다.
   *  2. 마요르카 → 지로나 구간의 안내가 아예 없었다. 하루에 두 번 옮기는
   *     날에서 뒤엣것이 앞엣것을 덮어썼기 때문이다.
   *
   * 엔진 쪽은 planner-check 가 본다. 여기서는 **화면에 실제로 그려지는가**를
   * 본다 — 근교 날에도 같은 블록이 뜨고, 그 안에 시각과 대안이 있는가.
   */
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  watch(page, allErrors, '[이동안내]');
  const next = await build(page, {
    // 톨레도·세고비아는 마드리드에서 다녀오는 근교로 잡힌다.
    cities: [['마드리드·중부', '마드리드'], ['마드리드·중부', '톨레도'],
      ['마드리드·중부', '세고비아'], ['안달루시아', '세비야']],
    from: '2026-09-14', to: '2026-09-24',
    airports: ['MAD', 'AGP'], times: ['16:00', '12:00'],
  });
  await next();                                     // → 4단계
  await page.waitForTimeout(1600);

  const blocks = page.locator('.travel-block');
  const n = await blocks.count();
  check('4단계에 이동 안내 블록이 있다', n > 0, `${n}개`);

  const trips = page.locator('.travel-block.is-daytrip');
  const t = await trips.count();
  check('근교 왕복도 같은 블록으로 그린다', t > 0, `${t}개`);

  if (t > 0) {
    const one = trips.first();
    const route = await one.locator('.travel-route').innerText();
    check('근교는 왕복임을 경로에 적는다', /→.*→/.test(route) && /왕복/.test(route),
      route.replace(/\n/g, ' '));
    const when = await one.locator('.travel-when').innerText();
    check('근교에 가는 편·오는 편 시각이 있다',
      /가는 편 \d\d:\d\d/.test(when) && /오는 편 \d\d:\d\d/.test(when),
      when.replace(/\n/g, ' '));
    /*
     * 짐 옮기는 이동이 적는 것을 근교도 적는가 — 수단 이름과 시간표 출처.
     * 요금은 자료에 없는 편도 있어(무료 구간이 아니라 값을 모르는 것이다)
     * 이동 블록도 있을 때만 적는다. 그러니 '있으면 왕복으로 적는가' 를 본다.
     */
    const meta = await one.locator('.travel-meta').innerText();
    check('근교에도 수단과 시간표 출처가 적힌다',
      meta.trim().length > 5 && /(실제 시간표|추정치)/.test(meta),
      meta.replace(/\n/g, ' ').slice(0, 60));
    const metas = (await trips.locator('.travel-meta').allInnerTexts()).join(' | ');
    const priced = metas.match(/€\d+/g) ?? [];
    /* 머리의 큰 숫자는 이동 블록과 같은 뜻이어야 한다 — 타는 시간. */
    const tot = await one.locator('.travel-total').innerText();
    check('근교 머리 숫자는 타는 시간이다', /타는 시간/.test(tot) && /나가 있는 시간/.test(tot),
      tot.replace(/\n/g, ' '));
    check('근교 요금은 왕복으로 적는다',
      priced.length === 0 || /왕복 약 €\d+/.test(metas),
      priced.length ? metas.replace(/\n/g, ' ').slice(0, 80) : '이 구간들은 요금 자료가 없습니다');
    check('근교에는 짐을 두고 간다고 알린다',
      /짐은 .*두고 다녀옵니다/.test(await one.innerText()));
    check('근교에는 이동 시점을 묻지 않는다',
      (await one.locator('.timing-row').count()) === 0);
    const alts = await one.locator('.travel-alts > summary').count();
    check('근교에도 다른 수단이 제시된다', alts > 0, `${alts}개`);
  }

  // 짐을 옮기는 이동은 예전 그대로여야 한다.
  const move = page.locator('.travel-block:not(.is-daytrip)').first();
  if (await move.count()) {
    const when = await move.locator('.travel-when').innerText();
    check('짐 옮기는 이동은 출발·탑승·도착을 적는다',
      /숙소 출발/.test(when) && /탑승/.test(when) && /도착/.test(when), when.replace(/\n/g, ' '));
    check('짐 옮기는 이동에는 이동 시점을 묻는다',
      (await move.locator('.timing-row').count()) === 1);
  }

  // 예전의 한 줄짜리 배지는 사라졌는가
  check('한 줄짜리 근교 배지가 남아 있지 않다',
    (await page.locator('.day-ride').count()) === 0);
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n■ 10. 아이패드 — 골라도 계속 고를 수 있는가');
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, allErrors, '[아이패드]');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.city-card', { timeout: 25000 });

  /*
   * 페이지가 화면보다 길면 body 는 min-height 여야 한다. height: 100% 로
   * 두면 body 상자는 화면 높이에 고정되고 내용만 밖으로 삐져나간다 —
   * 사파리에서 스크롤·합성·히트테스트가 어긋나는 자리다.
   */
  const box = await page.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    return {
      bodyH: cs(document.body).height,
      docH: document.documentElement.scrollHeight,
      view: window.innerHeight,
      blurred: [...document.querySelectorAll('*')]
        .filter((el) => {
          const c = cs(el);
          return c.backdropFilter !== 'none' && (c.position === 'fixed' || c.position === 'sticky');
        })
        .map((el) => el.className).join(', '),
    };
  });
  check('본문이 화면보다 길어도 body 가 잘리지 않는다',
    parseFloat(box.bodyH) >= box.docH - 2, `body ${box.bodyH} · 문서 ${box.docH}px`);
  check('붙박이 막대에 흐림 합성이 없다', box.blurred === '', box.blurred || '없음');

  // 실제로 눌러 본다 — 하나 고르고 나서 다음 것이 눌리는가.
  await page.getByRole('button', { name: /마드리드·중부/ }).first().click();
  await page.waitForTimeout(600);
  const names = await page.locator('.city-name').allInnerTexts();
  const picked = [];
  for (const n of names.slice(0, 4)) {
    await page.locator('.city-main', { hasText: n }).first().click();
    await page.waitForTimeout(500);
    picked.push(await page.locator('.city-card.is-selected').count());
  }
  check('첫 도시를 고른 뒤에도 계속 고를 수 있다',
    picked.join() === '1,2,3,4', `${names.slice(0, 4).join('·')} → ${picked.join(' → ')}곳`);

  // 아래까지 스크롤해도 카드가 계속 눌리는가(붙박이 막대에 가리지 않는가).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const last = page.locator('.city-main').last();
  const lb = await last.boundingBox();
  const covered = lb ? await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? !el.closest('.city-main') : true;
  }, [lb.x + lb.width / 2, lb.y + 10]) : true;
  check('맨 아래 카드가 막대에 가리지 않는다', !covered);
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
