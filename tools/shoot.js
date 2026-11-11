// Покадровая запись ролика 9:16 с управляемым временем: node tools/shoot.js
// Кадры → .shots/frames, ролик → media/motion.mp4
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FRAMES = path.join(ROOT, '.shots', 'frames');
const URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;
const FPS = 30;
const SECONDS = 8.0;      // профиль → шторка → покой с намёком → палец на «Продолжить» → отпустили → предметы в медалях
const DOWN_AT = 5.3, UP_AT = 5.8;

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--hide-scrollbars', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
  // своё время вместо настоящего: таймеры и все CSS-анимации двигаем вручную, кадр за кадром
  await page.evaluateOnNewDocument(() => {
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
  });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.replay{display:none}' });
  await new Promise((r) => setTimeout(r, 500));

  const total = Math.round(SECONDS * FPS);
  for (let f = 0; f < total; f++) {
    if (f === Math.round(0.2 * FPS)) await page.evaluate(() => document.getElementById('replay').click());
    const finger = (type) => page.evaluate((ty) => {
      const el = document.getElementById('go'), r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }, type);
    if (f === Math.round(DOWN_AT * FPS)) await finger('pointerdown');
    if (f === Math.round(UP_AT * FPS)) await finger('pointerup');
    await page.evaluate((dt) => window.__tick(dt), 1000 / FPS);
    await page.screenshot({ path: path.join(FRAMES, 'f' + String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 95 });
    if (f % 30 === 0) process.stdout.write((f / FPS).toFixed(0) + 's ');
  }
  await browser.close();

  fs.mkdirSync(path.join(ROOT, 'media'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%04d.jpg'),
    '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17',
    '-movflags', '+faststart', path.join(ROOT, 'media', 'motion.mp4')]);
  console.log('\nmedia/motion.mp4');
})();
