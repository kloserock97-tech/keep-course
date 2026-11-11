// Картинка экрана «Цели»: сцена и фон профиля из выгрузки макета + дорисованная луна (ориентир «сон»).
// node tools/goals-art.js  →  assets/goals/{scene,bg,moon}.webp
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src-assets');
const OUT = path.join(__dirname, '..', 'assets', 'goals');

// Луна в манере картинки: мягкий край, тёплый жёлтый, как пятна за миской, зерно поверх.
const MOON = `
  <defs>
    <radialGradient id="m" cx="38%" cy="34%" r="80%">
      <stop offset="0" stop-color="#fff6cf"/><stop offset=".5" stop-color="#ffe58c"/><stop offset="1" stop-color="#f6c955"/>
    </radialGradient>
    <mask id="cut"><rect width="34" height="34" fill="#fff"/><circle cx="22.4" cy="12.6" r="9.6" fill="#000"/></mask>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" result="b"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.1 0 0 0 -0.42" result="w"/>
      <feComposite in="w" in2="b" operator="in" result="wi"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.9" numOctaves="1" seed="9" result="n2"/>
      <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.66  0 0 0 0 0.2  0.9 0 0 0 -0.45" result="o"/>
      <feComposite in="o" in2="b" operator="in" result="oi"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="oi"/><feMergeNode in="wi"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#soft)"><circle cx="16" cy="17" r="11.5" fill="url(#m)" mask="url(#cut)"/></g>`;

(async () => {
  await sharp(path.join(SRC, 'goals.png')).resize(1014).webp({ quality: 88 }).toFile(path.join(OUT, 'scene.webp'));
  await sharp(path.join(SRC, 'goals-figma', 'bg.png')).webp({ quality: 90 }).toFile(path.join(OUT, 'bg.webp'));
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 34, height: 34, deviceScaleFactor: 3 });
  await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34" style="display:block">${MOON}</svg>`);
  const png = await page.screenshot({ omitBackground: true, type: 'png' });
  await sharp(png).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(OUT, 'moon.webp'));
  await browser.close();
  console.log('scene, bg, moon');
})();
