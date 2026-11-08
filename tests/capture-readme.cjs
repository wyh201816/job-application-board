// Capture the standalone demo in a fresh browser context. Never use a user profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const screenshots = path.join(root, 'docs', 'screenshots');
const appUrl = pathToFileURL(path.join(root, 'index.html')).href;
const viewport = { width: 1520, height: 920 };
const time = new Date('2030-01-15T10:00:00+08:00');

async function openPage(browser, demo) {
  const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.clock.setFixedTime(time);
  await page.goto(appUrl + (demo ? '?demo=1' : ''));
  const data = await page.evaluate(() => ({
    demo: DEMO_MODE,
    rows: state.records.length,
    onlyMock: state.records.every(record => /^demo-\d\d$/.test(record.id) && /^示例公司 \d\d$/.test(record.base.company)),
  }));
  assert.deepEqual(data, { demo, rows: demo ? 50 : 0, onlyMock: true });
  return { page, errors, external };
}

async function shot(page, filename) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: path.join(screenshots, filename), animations: 'disabled', caret: 'hide', scale: 'css' });
}

async function main() {
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) launch.channel = process.env.PLAYWRIGHT_CHANNEL;
  const browser = await chromium.launch(launch);
  await fs.mkdir(screenshots, { recursive: true });
  try {
    const { page, errors, external } = await openPage(browser, true);
    const nav = kind => page.locator(`#nav [data-nav="${kind}"]`).click();
    const close = () => page.keyboard.press('Escape');

    await nav('current');
    const dateColumn = page.locator('#grid th[data-col="when"]');
    await dateColumn.click();
    await dateColumn.click();
    assert.equal(await page.locator('#grid .data-row').count(), 50);
    await shot(page, '01-board.png');

    await page.locator('#nav [data-stage="一面"]:not([data-outcome])').click();
    await page.locator('#grid [data-sub-toggle="一面|pass"]').click();
    assert.equal(await page.locator('#grid .subgroup').count(), 4);
    await shot(page, '02-stage-results.png');

    await nav('current');
    await page.locator('#grid [data-detail="demo-26"]').click();
    assert.equal(await page.locator('.history-card').count(), 4);
    await page.locator('.history-card').last().scrollIntoViewIfNeeded();
    await shot(page, '03-company-detail.png');
    await close();

    await page.locator('#grid [data-r="demo-21"] [data-field="latest"]').click();
    await page.locator('#moveNext').check();
    await page.locator('#nextStage').selectOption('二面');
    await page.locator('#nextWhen').fill('2030-01-20T14:30');
    await page.locator('#nextNote').fill('示例：准备项目复盘与二面问题。');
    assert.equal(await page.locator('#saveTransition').isVisible(), true);
    await shot(page, '04-stage-transition.png');
    await close();

    await nav('bigtech-unicorn');
    await page.locator('#filter').click();
    await page.locator('#filterRows .fkey').selectOption('preference');
    await page.locator('#filterRows .fop').selectOption('eq');
    await page.locator('#filterRows .fval').selectOption('理想');
    await page.locator('#applyFilters').click();
    const filtered = await page.evaluate(() => pairs().map(({ r }) => r.base.preference));
    assert(filtered.length > 0 && filtered.every(preference => preference === '理想'));
    await shot(page, '05-specialty-filter.png');

    await nav('distribution');
    assert.equal(await page.locator('.insight-total strong').textContent(), '50');
    await page.locator('.distribution-card .pie-chart').scrollIntoViewIfNeeded();
    await shot(page, '06-status-distribution.png');

    await page.locator('#distribution-tab-ideal').click();
    assert.equal(await page.locator('.ideal-company-total strong').textContent(), '25');
    await shot(page, '07-ideal-companies.png');

    await nav('schedule');
    await page.locator('[data-jump="upcoming"]').click();
    await page.waitForFunction(() => {
      const upcoming = document.querySelector('#schedule-upcoming');
      return upcoming && upcoming.getBoundingClientRect().top < innerHeight / 2;
    });
    await shot(page, '08-schedule.png');

    await nav('current');
    await page.locator('#fields').click();
    assert.equal(await page.locator('#fieldList .field-row').count(), 14);
    await page.locator('#doneFields').scrollIntoViewIfNeeded();
    await shot(page, '09-field-settings.png');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);

    const personal = await openPage(browser, false);
    await personal.page.locator('#import').click();
    assert.equal(await personal.page.locator('#csvTemplate').isVisible(), true);
    await shot(personal.page, '10-import.png');
    assert.deepEqual(personal.errors, []);
    assert.deepEqual(personal.external, []);
    console.log('Captured ten README screenshots from the mock demo and a new empty personal board.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
