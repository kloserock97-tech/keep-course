// Сверка общих частей статистики с макетом: шапка, календарь, питание, активность, таббар.
// node tools/diff-stats.js → .shots/ds-*.png и числа по зонам
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');
const ROOT = path.join(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3 });
  await page.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href + '?bare&screen=stats&mock', { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await new Promise((r) => setTimeout(r, 900));
  const mine = await page.screenshot();
  await browser.close();

  const fig = await sharp(path.join(ROOT, '.shots', 'f3-st.png')).extract({ left: 72, top: 60, width: 1170, height: 3714 }).toBuffer();   // тень макета 0 4 24: поля 24 по бокам, 20 сверху
  const zones = { 'шапка': [0, 0, 109], 'календарь': [109, 109, 109], 'питание': [234, 234, 182], 'активность': [420, 420, 206], 'таббар': [1154, 768, 84] };
  for (const [name, [fy, my, h]] of Object.entries(zones)) {
    const a = await sharp(fig).extract({ left: 0, top: fy * 3, width: 1170, height: h * 3 }).removeAlpha().raw().toBuffer();
    const b = await sharp(mine).extract({ left: 0, top: my * 3, width: 1170, height: h * 3 }).removeAlpha().raw().toBuffer();
    const d = Buffer.alloc(a.length); let sum = 0;
    for (let i = 0; i < a.length; i += 3) {
      const v = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; sum += v;
      const q = Math.min(255, v * 4); d[i] = 255; d[i + 1] = 255 - q; d[i + 2] = 255 - q;
    }
    const raw = { raw: { width: 1170, height: h * 3, channels: 3 } };
    const sheet = await sharp({ create: { width: 1170 * 3, height: h * 3, channels: 3, background: '#fff' } })
      .composite([{ input: a, ...raw, left: 0, top: 0 }, { input: b, ...raw, left: 1170, top: 0 }, { input: d, ...raw, left: 2340, top: 0 }]).png().toBuffer();
    await sharp(sheet).resize(1950).toFile(path.join(ROOT, '.shots', 'ds-' + name + '.png'));
    console.log(name.padEnd(12), (sum / (a.length / 3)).toFixed(2));
  }
})();
