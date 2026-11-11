// Быстрый просмотр векторной сцены в Chrome рядом с исходником: node tools/svg-peek.js → .shots/svgpeek.png
const puppeteer = require('puppeteer-core'); const sharp = require('sharp'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
(async () => {
  const svg = fs.readFileSync(path.join(ROOT, 'assets/goals/scene.svg'), 'utf8').replace('width="338" height="338"', 'width="627" height="627"');
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 627, height: 627 });
  await p.setContent(`<body style="margin:0;background:#fff">${svg}</body>`);
  const v = await p.screenshot({ type: 'png' }); await b.close();
  const o = await sharp(path.join(ROOT, 'src-assets/goals.png')).resize(627).png().toBuffer();
  await sharp({ create: { width: 1264, height: 627, channels: 3, background: '#fff' } }).composite([{ input: o, left: 0, top: 0 }, { input: v, left: 637, top: 0 }]).png().toFile(path.join(ROOT, '.shots/svgpeek.png'));
})();
