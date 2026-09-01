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
  const summary = async () => (await page.locator('main').innerText()).match(/(\d+)곳 선택 · 예상 ([\d.]+)일/);
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
  const plus = () => page.getByRole('button', { name: '반나절 늘리기' }).first();
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
    await page.getByRole('button', { name: '반나절 줄이기' }).first().click();
    await page.waitForTimeout(900);
    check('일수 − → 되돌아온다', (await daysVal()) === before, `${after} → ${await daysVal()}`);
  }

  /*
   * 0.5일 단위로 조절되는가.
   *
   * 하루가 한 도시라는 법이 없다. 근교를 다녀오는 날은 낮과 저녁이 다른
   * 도시라 실제로 반나절씩 쪼개진다. '0.5일' 이 아니라 '반나절' 로 읽힌다.
   */
  const base2 = await daysVal();
  await page.getByRole('button', { name: '반나절 줄이기' }).first().click();
  await page.waitForTimeout(900);
  const half = await daysVal();
  const asDays = (t) => (t === '반나절' ? 0.5
    : Number((t.match(/(\d+)/) ?? [0])[1]) + (/반$/.test(t) ? 0.5 : 0));
  check('반나절 단위로 줄어든다',
    Math.abs(asDays(base2) - asDays(half) - 0.5) < 1e-9, `${base2} → ${half}`);
  await page.getByRole('button', { name: '반나절 늘리기' }).first().click();
  await page.waitForTimeout(900);
  check('반나절 단위로 되돌아온다', (await daysVal()) === base2, `${half} → ${await daysVal()}`);

  const allDays = await page.locator('.days-value').allInnerTexts();
  check('3단계 일수가 사람 말로 나온다', allDays.every((t) => /^(반나절|\d+일( 반)?)$/.test(t)),
    allDays.join(' | '));

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
    await box.check(); await page.waitForTimeout(700);
    check('아이템 개별 추가', (await cnt()) === c0 + 1, `${c0} → ${await cnt()}`);
    await page.locator('.item:not(.foodbox .item) input[type=checkbox]:checked').first().uncheck();
    await page.waitForTimeout(700);
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
    const before0 = await onCount();
    await page.locator('.bundle-take').first().click();
    await page.waitForTimeout(900);
    check('묶음을 담으면 통째로 들어간다', (await onCount()) === names.length,
      `${before0}/${names.length} → ${await onCount()}/${names.length}`);
    check('담은 묶음은 빼기로 바뀐다',
      (await page.locator('.bundle-take').first().innerText()).includes('빼기'));
    await page.locator('.bundle-take').first().click();
    await page.waitForTimeout(900);
    check('묶음을 통째로 뺄 수 있다', (await onCount()) === 0, `→ ${await onCount()}/${names.length}`);
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
    cities: [['카탈루냐', '바르셀로나'], ['마요르카', '팔마데마요르카']],
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
  const islandGroups = groupNames.filter((t) => /\(섬\)/.test(t));
  check('섬이 섬마다 한 칸으로 나뉜다', islandGroups.length === 3,
    islandGroups.map((t) => t.split('\n')[0].trim()).join(' · '));

  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^다음$/ }).click(); await page.waitForTimeout(1800);
  await page.waitForSelector('.course', { timeout: 25000 });
  const palmaHead = page.locator('.city-head .theme-head').filter({ hasText: '팔마' }).first();
  if (await palmaHead.count()) {
    if ((await palmaHead.getAttribute('aria-expanded')) !== 'true') {
      await palmaHead.click(); await page.waitForTimeout(800);
    }
    // 해변·자연은 테마 목록 안에 있으므로 그 칸을 열고 본다.
    const nature = page.locator('.city-panel .theme-head').filter({ hasText: '자연' }).first();
    if (await nature.count()) { await nature.click(); await page.waitForTimeout(700); }
    const panel = await page.locator('main').innerText();
    for (const n of ['드라크 동굴', '에스 트렌크']) {
      check(`팔마 후보에 ${n} 이 있다`, panel.includes(n));
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

    // 실제로 바꿔 본다
    const before = await page.locator('.travel-meta').first().innerText();
    await page.locator('.car-take').first().click();
    await page.waitForTimeout(1500);
    const after = await page.locator('.travel-meta').first().innerText();
    check('대안으로 바꾸면 계획에 반영된다', before !== after,
      `${before.split('·')[0].trim()} → ${after.split('·')[0].trim()}`);
  }
  await page.screenshot({ path: new URL('06-car.png', shots).pathname, fullPage: true });
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
