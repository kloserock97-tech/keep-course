// Раскадровка первого экрана на своих часах: вход, нажатие, полёт в медали.
// node tools/frames.js [--down=5.4 --up=6.0] [--at=0.3,0.5,…] [--q=?bare]  →  .shots/frames-goals.png
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const FPS = 60;
const DOWN = +arg('down', 2.2), UP = +arg('up', 2.6);
const AT = arg('at', '0.2,0.35,0.5,0.65,0.8,1.0,1.4,2.25,2.6,2.7,2.8,2.9,3.0,3.2,3.5,4.0').split(',').map(Number);
const Q = arg('q', '?bare');
const OUT = arg('out', path.join(ROOT, '.shots', 'frames-goals.png'));

const clock = () => {
  let now = 0, id = 0; const timers = new Map(); let rafs = [];
  window.setTimeout = (fn, ms = 0) => { timers.set(++id, { fn, at: now + ms }); return id; };
  window.clearTimeout = (i) => timers.delete(i);
  window.requestAnimationFrame = (fn) => { rafs.push(fn); return ++id; };
  const seen = new WeakSet();
  window.__tick = (dt) => {
    now += dt;
    for (let pass = 0; pass < 3; pass++) {
      const r = rafs; rafs = []; r.forEach((fn) => fn(now));
      for (const [i, t] of [...timers]) if (t.at <= now) { timers.delete(i); t.fn(); }
    }
    for (const an of document.getAnimations()) {
      if (!seen.has(an)) { seen.add(an); an.pause(); an.currentTime = 0; }
      an.currentTime += dt;
    }
  };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(clock);
  await page.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href + Q, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const finger = (type) => page.evaluate((ty) => {
    const el = document.getElementById('go'), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }, type);
  const want = AT.map((t) => Math.round(t * FPS)), shots = [], last = Math.max(...want);
  for (let f = 0; f <= last; f++) {
    if (f === Math.round(DOWN * FPS)) await finger('pointerdown');
    if (f === Math.round(UP * FPS)) await finger('pointerup');
    await page.evaluate((dt) => window.__tick(dt), 1000 / FPS);
    if (want.includes(f)) shots.push(await page.screenshot({ type: 'png' }));
  }
  await browser.close();
  if (errors.length) console.log('ошибки:', errors);
  const cols = Math.min(8, shots.length), rows = Math.ceil(shots.length / cols), w = 393, h = 852;
  const sheet = await sharp({ create: { width: w * cols, height: h * rows, channels: 3, background: '#fff' } })
    .composite(shots.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toBuffer();
  await sharp(sheet).resize({ width: Math.min(2800, w * cols) }).png().toFile(OUT);
  console.log(OUT, AT.join(' '));
})();
