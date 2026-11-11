// Сверка первого экрана с макетом: node tools/diff.js  → .shots/diff-*.png и числа по зонам
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FIG = path.join(ROOT, '.shots', 'f3-s1.png');

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 844, deviceScaleFactor: 3 });
  await page.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href + '?bare&hold&mock&h=844', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await new Promise((r) => setTimeout(r, 300));
  const mine = path.join(ROOT, '.shots', 'm3-s1.png');
  await page.screenshot({ path: mine });
  await browser.close();

  const A = await sharp(FIG).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(mine).removeAlpha().resize(A.info.width, A.info.height).raw().toBuffer({ resolveWithObject: true });
  const W = A.info.width, H = A.info.height, out = Buffer.alloc(W * H * 3);
  const zones = { 'статус-бар 0–54': [0, 54], 'картинка 110–500': [110, 500], 'текст 540–700': [540, 700], 'кнопки 690–800': [690, 800], 'низ 800–844': [800, 844] };
  const sum = Object.fromEntries(Object.keys(zones).map((k) => [k, [0, 0]]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
    const v = Math.min(255, d * 4);
    out[i] = 255; out[i + 1] = 255 - v; out[i + 2] = 255 - v;
    for (const [k, [y0, y1]] of Object.entries(zones)) if (y >= y0 * 3 && y < y1 * 3) { sum[k][0] += d; sum[k][1]++; }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).resize(786).png().toFile(path.join(ROOT, '.shots', 'diff-s1.png'));
  for (const [k, [s, n]] of Object.entries(sum)) console.log(k.padEnd(22), (s / n).toFixed(2));
})();
