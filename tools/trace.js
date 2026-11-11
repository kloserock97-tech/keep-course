// Замер движения руки по кадрам: положение и скорость при одном и том же сценарии нажатия.
// node tools/trace.js [страница …]   →  .shots/trace-<страница>.json и сводка в консоли
// node tools/trace.js --chart        →  media/curves.png: скорость руки «на переходах» и «на пружинах»
// node tools/trace.js --strip        →  .shots/strip-<страница>.png: раскадровка тех же моментов
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const FPS = 60, SECONDS = 3.6;
const DOWN_AT = 1.5, UP_AT = 1.9;          // палец лёг на кнопку и через 0,4 с отпустил
const args = process.argv.slice(2);
const chart = args.includes('--chart'), strip = args.includes('--strip');
const pages = args.filter((a) => !a.startsWith('--'));
const at = (args.find((a) => a.startsWith('--at=')) || '').slice(5).split(',').filter(Boolean).map(Number);   // --at=2.0,2.05 — свои моменты для раскадровки
if (!pages.length) pages.push(...(chart ? ['lead.html', 'index.html'] : ['index.html']));

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

const run = async (browser, file) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(clock);
  await page.goto(require('url').pathToFileURL(path.join(ROOT, file)).href + '?bare&hold&stay', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));
  const finger = (type) => page.evaluate((ty) => {
    const el = document.getElementById('connect'), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: 7, pointerType: 'touch', button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }, type);
  const rows = [], shots = [];
  const want = strip ? (at.length ? at : [0.05, 0.15, 0.3, 0.6, 1.45, 1.55, 1.7, 1.95, 2.05, 2.2, 2.45, 2.7, 3.0, 3.4]).map((t) => Math.round(t * FPS)) : [];
  for (let f = 0; f < SECONDS * FPS; f++) {
    if (f === 0) await page.evaluate(() => document.getElementById('replay').click());
    if (f === Math.round(DOWN_AT * FPS)) await finger('pointerdown');
    if (f === Math.round(UP_AT * FPS)) await finger('pointerup');
    await page.evaluate((dt) => window.__tick(dt), 1000 / FPS);
    rows.push(await page.evaluate(() => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector('.hand-move')).transform);
      const b = new DOMMatrix(getComputedStyle(document.querySelector('.btn-wrap')).transform);
      return { x: m.e, y: m.f, btn: b.a, state: document.querySelector('.art').dataset.state };
    }));
    if (want.includes(f)) shots.push(await page.screenshot({ clip: { x: 0, y: 90, width: 393, height: 420 }, type: 'png' }));
  }
  await page.close();
  if (errors.length) console.log('  ошибки в консоли:', errors);
  if (shots.length) {
    const w = 393 * 2, h = 420 * 2, cols = Math.min(7, shots.length), rowsN = Math.ceil(shots.length / cols);
    const sheet = await sharp({ create: { width: w * cols, height: h * rowsN, channels: 3, background: '#fff' } })
      .composite(shots.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h }))).png().toBuffer();   // сначала склейка, потом уменьшение
    await sharp(sheet).resize({ width: Math.min(2400, w * cols) }).png().toFile(path.join(ROOT, '.shots', 'strip-' + path.basename(file, '.html') + '.png'));
  }
  return rows;
};

const speed = (rows) => rows.map((r, i) => i ? Math.hypot(r.x - rows[i - 1].x, r.y - rows[i - 1].y) : 0);   // pt за кадр

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const out = {};
  for (const file of pages) {
    const rows = await run(browser, file), v = speed(rows);
    out[file] = { rows, v };
    fs.mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.shots', 'trace-' + path.basename(file, '.html') + '.json'), JSON.stringify(rows));
    // рывок — на сколько скорость меняется за один кадр; смотрим только отклик на палец (после входа)
    const from = Math.round((DOWN_AT - 0.05) * FPS), to = Math.round((UP_AT + 0.5) * FPS);
    let jerk = 0, at = 0, peak = 0;
    for (let i = from + 1; i < to; i++) { const d = Math.abs(v[i] - v[i - 1]); if (d > jerk) { jerk = d; at = i; } peak = Math.max(peak, v[i]); }
    const f0 = Math.round(DOWN_AT * FPS), first = rows[f0], landed = rows.findIndex((r, i) => i > f0 && r.state === 'placed');
    console.log(file.padEnd(12), `наибольшая скорость ${peak.toFixed(1)} pt/кадр · наибольший скачок скорости ${jerk.toFixed(1)} pt/кадр на ${(at / FPS).toFixed(2)} с`);
    console.log(' '.repeat(12), 'первые кадры после касания, pt:', v.slice(f0, f0 + 8).map((n) => n.toFixed(1)).join(' → '), `· состояние ${first.state}`);
    console.log(' '.repeat(12), `от отпускания до посадки: ${landed > 0 ? Math.round((landed + 1) / FPS * 1000 - UP_AT * 1000) : '—'} мс`);
  }
  if (chart) {
    const W = 1200, H = 520, L = 70, R = 30, T = 60, B = 60, t0 = DOWN_AT - 0.1, t1 = UP_AT + 0.7;
    const max = Math.max(...Object.values(out).flatMap((o) => o.v.slice(Math.round(t0 * FPS), Math.round(t1 * FPS))));
    const X = (t) => L + (t - t0) / (t1 - t0) * (W - L - R), Y = (n) => H - B - n / (max * 1.08) * (H - T - B);
    const line = (v, color) => `<polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" points="${v.map((n, i) => [i / FPS, n]).filter(([t]) => t >= t0 && t <= t1).map(([t, n]) => X(t).toFixed(1) + ',' + Y(n).toFixed(1)).join(' ')}"/>`;
    const names = Object.keys(out), colors = ['#b6bfd0', '#2b6cfc'], labels = ['на переходах CSS (было)', 'на пружинах (стало)'];
    const mark = (t, text) => `<line x1="${X(t)}" y1="${T}" x2="${X(t)}" y2="${H - B}" stroke="#e3e8f2" stroke-width="2" stroke-dasharray="6 6"/><text x="${X(t) + 8}" y="${T + 16}" font-size="18" fill="#6b7890">${text}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Manrope, Segoe UI, sans-serif">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${L}" y="34" font-size="22" font-weight="600" fill="#020202">Скорость руки, pt за кадр (60 кадров в секунду)</text>
      ${mark(DOWN_AT, 'палец на кнопке')}${mark(UP_AT, 'отпустили')}
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#c9d1e0" stroke-width="2"/>
      ${[0, Math.round(max / 2), Math.round(max)].map((n) => `<text x="${L - 12}" y="${Y(n) + 6}" font-size="16" fill="#6b7890" text-anchor="end">${n}</text>`).join('')}
      ${names.map((n, i) => line(out[n].v, colors[i])).join('')}
      ${names.map((n, i) => `<rect x="${L + i * 330}" y="${H - 34}" width="28" height="4" rx="2" fill="${colors[i]}"/><text x="${L + 38 + i * 330}" y="${H - 26}" font-size="18" fill="#3b4354">${labels[i]}</text>`).join('')}
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(ROOT, 'media', 'curves.png'));
    console.log('media/curves.png');
  }
  await browser.close();
})();
