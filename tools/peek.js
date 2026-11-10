// Контрольные снимки экрана статистики: node tools/peek.js → .shots/st-*.png
const puppeteer = require('puppeteer-core');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
  await page.goto(URL + '?bare&screen=stats');
  await sleep(900);
  const shot = (n) => page.screenshot({ path: path.join(ROOT, '.shots', `st-${n}.png`) });
  const scroll = (y) => page.evaluate((v) => { document.querySelector('.st-scroll').scrollTop = v; }, y);
  const tap = (sel) => page.evaluate((q) => document.querySelector(q).click(), sel);
  await shot('1-top');
  await scroll(520); await sleep(200); await shot('2-mid');
  await scroll(2000); await sleep(200); await shot('3-end');
  await scroll(0);
  await tap('[data-do="meal"]'); await sleep(700); await shot('4-sheet');
  await tap('[data-opt="0"]'); await sleep(1200);
  await tap('.pill[data-do="walk"]'); await sleep(300);
  for (let i = 0; i < 3; i++) { await tap('.pill[data-do="water"]'); await sleep(150); }
  await tap('.pill[data-do="sleep"]'); await sleep(1200); await shot('5-done');
  await tap('[data-day="14"]'); await sleep(500); await shot('6-past');
  console.log(errors.length ? 'ошибки: ' + errors.join(' | ') : 'ошибок в консоли нет');
  await browser.close();
})();
