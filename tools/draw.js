// Дорисованные слои в манере исходной картинки: светлый шар без галочки, колокольчик и его язычок.
// Рисуются в SVG с зерном и «меловым» краем, снимаются браузером в 3x.
// node tools/draw.js  →  assets/art/{ball,bell,clapper}.webp
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'art');

// меловой край, как у галочек: контур слегка смят шумом, по краю — крупинки
const BLUE = '#176cf5';
const CHALK = `
  <filter id="chalk" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" result="warp"/>
    <feDisplacementMap in="SourceAlpha" in2="warp" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feGaussianBlur in="shape" stdDeviation="0.75" result="soft"/>
    <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="11" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.8 0 0 0 -0.4" result="speck"/>
    <feComposite in="soft" in2="speck" operator="arithmetic" k1="0" k2="2.1" k3="0.9" k4="-1" result="rough"/>
    <feComponentTransfer in="rough" result="mask"><feFuncA type="linear" slope="2.6" intercept="-0.6"/></feComponentTransfer>
    <feFlood flood-color="${BLUE}" result="ink"/>
    <feComposite in="ink" in2="mask" operator="in"/>
  </filter>`;

const LAYERS = {
  // шар: тот же свет, что у шара в исходной картинке, — светлее сверху, голубее снизу, зерно поверх
  ball: { size: 58, svg: `
    <defs>
      <radialGradient id="g" cx="46%" cy="34%" r="72%">
        <stop offset="0" stop-color="#f9fbff"/><stop offset=".55" stop-color="#e6effc"/><stop offset="1" stop-color="#c6e2f6"/>
      </radialGradient>
      <filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="5" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.32" result="w"/>
        <feComposite in="w" in2="SourceAlpha" operator="in" result="wi"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="wi"/></feMerge>
      </filter>
    </defs>
    <circle cx="29" cy="29" r="27.8" fill="url(#g)" filter="url(#grain)"/>` },
  // колокольчик: ось качания — ушко наверху
  bell: { size: 34, svg: `
    <defs>${CHALK}</defs>
    <path transform="translate(2 1)" filter="url(#chalk)" fill="#000" d="M15 2.6c-1.5 0-2.6 1.1-2.6 2.6v.5C8.3 6.9 5.6 10.6 5.6 15.2v4.3c0 1.7-.9 3-2.6 4.3-.5.4-.7.9-.7 1.4 0 .9.7 1.6 1.6 1.6h22.2c.9 0 1.6-.7 1.6-1.6 0-.5-.2-1-.7-1.4-1.7-1.3-2.6-2.6-2.6-4.3v-4.3c0-4.6-2.7-8.3-6.8-9.5v-.5c0-1.5-1.1-2.6-2.6-2.6z"/>` },
  clapper: { size: 34, svg: `
    <defs>${CHALK}</defs>
    <path transform="translate(2 1)" filter="url(#chalk)" fill="#000" d="M11 28.2a4 4 0 0 0 8 0z"/>` },
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  for (const [name, { size, svg }] of Object.entries(LAYERS)) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 3 });
    await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">${svg}</svg>`);
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    await sharp(png).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(OUT, name + '.webp'));
    console.log(name, size * 3);
  }
  await browser.close();
})();
