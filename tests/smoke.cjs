const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) launch.channel = process.env.PLAYWRIGHT_CHANNEL;
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url())) external.push(request.url());
    });
    const appUrl = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
    await page.goto(appUrl);
    assert.equal(await page.evaluate(() => state.records.length), 0, 'personal board starts empty');

    await page.locator('#import').click();
    const templateDownload = page.waitForEvent('download');
    await page.locator('#csvTemplate').click();
    const template = await fs.readFile(await (await templateDownload).path(), 'utf8');
    assert.match(template, /公司名称/);
    assert.match(template, /投递状态/);
    assert.equal(template.trim().split(/\r?\n/).length, 1);
    await page.keyboard.press('Escape');

    const header = '公司名称,投递日期,岗位,投递状态,重要日期,是否处理,意愿,备注';
    const first = '测试投递 A,2030-01-10,测试岗位,一面,2030-01-16 14:30,未处理,理想,"演示, 含逗号"';
    const second = '测试投递 B,2030-01-11,测试岗位,不合适,,已处理,非理想,';
    await page.locator('#fileInput').setInputFiles({
      name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + [header, first, first, second].join('\r\n')),
    });
    await page.locator('#confirmImport').click();
    assert.deepEqual(await page.evaluate(() => state.records.map(record => record.base.company)), ['测试投递 A', '测试投递 B']);
    assert.equal(await page.evaluate(() => current(state.records[0]).when), '2030-01-16T14:30');
    assert.equal(await page.evaluate(() => current(state.records[1]).stage), '不合适', 'preserve imported stages');

    const personalSnapshot = await page.evaluate(() => localStorage.getItem(KEY));
    await Promise.all([page.waitForURL(url => url.searchParams.get('demo') === '1'), page.locator('#demoMode').click()]);
    const demo = await page.evaluate(() => ({
      total: state.records.length,
      companies: new Set(state.records.map(record => record.base.company)).size,
      stages: state.records.reduce((counts, record) => {
        const label = entryStatusStage(current(record));
        counts[label] = (counts[label] || 0) + 1;
        return counts;
      }, {}),
      ideal: state.records.filter(record => record.base.preference === '理想').length,
      personal: localStorage.getItem(KEY),
    }));
    assert.equal(demo.total, 50);
    assert.equal(demo.companies, 50);
    assert.equal(demo.ideal, 25);
    assert.deepEqual(Object.values(demo.stages), Array(10).fill(5));
    assert.equal(demo.personal, personalSnapshot);
    assert.equal(await page.locator('#import').isVisible(), false);
    await page.locator('[data-nav="distribution"]').click();
    assert.equal(await page.locator('.insight-total strong').textContent(), '50');
    await page.locator('#distribution-tab-ideal').click();
    assert.equal(await page.locator('.ideal-company-total strong').textContent(), '25');
    await page.locator('[data-nav="schedule"]').click();
    assert.equal(await page.locator('#scheduleContent').isVisible(), true);
    assert.equal(await page.evaluate(() => mutate(() => { state.records[0].base.company = '临时演示编辑'; })), true);
    assert.equal(await page.evaluate(() => localStorage.getItem(KEY)), personalSnapshot, 'demo cannot write personal storage');

    await Promise.all([page.waitForURL(url => !url.searchParams.has('demo')), page.locator('#demoMode').click()]);
    assert.equal(await page.evaluate(() => state.records.length), 2);
    const backupDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const backup = await fs.readFile(await (await backupDownload).path());
    assert.equal(JSON.parse(backup).records.length, 2);
    await page.locator('#fileInput').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: backup });
    await page.locator('#restore').click();
    await page.reload();
    assert.deepEqual(await page.evaluate(() => state.records.map(record => record.base.company)), ['测试投递 A', '测试投递 B']);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#demoMode').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, [], 'no browser script errors');
    assert.deepEqual(external, [], 'local use makes no external requests');
    console.log('PASS: empty personal mode, template and CSV import, 50 balanced examples, chart and schedule, isolated storage, JSON round-trip, mobile and offline operation');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
