// Режет плоскую иллюстрацию (белый фон) на слои с прозрачностью.
// node tools/cut.js  →  assets/art/*.webp + assets/art/layers.json
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src-assets', 'illustration.png');
const OUT = path.join(__dirname, '..', 'assets', 'art');
const P = 1.56;          // координаты ниже сняты с превью шириной 1000
const DISPLAY = 0.25;    // 1560 px исходника = 390 pt на экране
const EXPORT = 0.75;     // выгружаем в 3x

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// circle: [cx, cy, r] — мягкая круглая маска; k — усиление плотности
const LAYERS = [
  { name: 'cloud-a', box: [40, 300, 380, 490], cloud: true },
  { name: 'cloud-b', box: [600, 80, 920, 270], cloud: true },
  { name: 'cloud-c', box: [250, 770, 520, 910], cloud: true },
  { name: 'cloud-d', box: [600, 740, 880, 900], cloud: true },
  { name: 'dot-1', circle: [131, 245, 24] },
  { name: 'dot-2', circle: [722, 250, 24] },
  { name: 'dot-3', circle: [905, 399, 24] },
  { name: 'dot-4', circle: [881, 798, 24] },
  { name: 'dot-5', circle: [148, 860, 24] },
  { name: 'token-1', circle: [168, 680, 96], k: 1.6 },
  { name: 'token-2', circle: [343, 652, 96], k: 1.6 },
  { name: 'token-3', circle: [517, 625, 93], k: 1.6 },
  { name: 'ring-4', circle: [688, 605, 86], noGreen: true },
  { name: 'ring-5', circle: [863, 583, 86] },
  { name: 'hand', box: [120, 30, 705, 475], k: 1.6, hand: true,
    poly: [[120, 30], [340, 30], [705, 290], [705, 475], [418, 475], [405, 372], [300, 275], [120, 140]] },
];
const DOTS = LAYERS.filter((l) => l.name.startsWith('dot')).map((l) => l.circle);
const HAND_POLY = LAYERS.find((l) => l.hand).poly.map(([x, y]) => [x * P, y * P]);
const HELD = [615, 447, 73]; // жетон в руке (превью-координаты)

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const manifest = {};

  for (const L of LAYERS) {
    let x0, y0, x1, y1;
    if (L.circle) { const [cx, cy, r] = L.circle; x0 = cx - r; y0 = cy - r; x1 = cx + r; y1 = cy + r; }
    else [x0, y0, x1, y1] = L.box;
    x0 = Math.round(x0 * P); y0 = Math.round(y0 * P); x1 = Math.min(W, Math.round(x1 * P)); y1 = Math.min(H, Math.round(y1 * P));
    const w = x1 - x0, h = y1 - y0;
    const out = Buffer.alloc(w * h * 4);
    const k = L.k || 1;
    const poly = L.poly && L.poly.map(([x, y]) => [x * P, y * P]);

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y, i = (sy * W + sx) * 3, o = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let a = 1 - Math.min(r, g, b) / 255;          // «цвет в прозрачность» от белого
      let a2 = Math.min(1, a * k);
      let m = 1;                                     // маска слоя
      if (L.circle) {
        const [cx, cy, R] = L.circle;
        const d = Math.hypot(sx - cx * P, sy - cy * P) / (R * P);
        m *= 1 - smooth(0.9, 1, d);
      }
      if (poly && !inPoly(sx, sy, poly)) m = 0;
      if (L.hand) {
        m *= smooth(12, 42, b - g);                  // убираем зелёное свечение и бледные облака
        const d = Math.hypot(sx - HELD[0] * P, sy - HELD[1] * P) / (HELD[2] * P);
        if (d < 1.06) m *= 1 - smooth(120, 165, r);  // убираем сам жетон — он отдельный слой
      }
      if (L.cloud) {                                 // в рамку облака попадают точки и край руки
        m *= 1 - smooth(0.26, 0.4, a);
        if (inPoly(sx, sy, HAND_POLY)) m = 0;
        for (const [dx, dy] of DOTS) if (Math.hypot(sx - dx * P, sy - dy * P) < 22 * P) m = 0;
      }
      if (L.noGreen) m *= smooth(-6, 6, b - g);      // на кольце 4 запечён край свечения
      if (a2 < 0.004 || m === 0) { out[o + 3] = 0; continue; }
      const un = (c) => Math.max(0, Math.min(255, Math.round((c - (1 - a2) * 255) / a2)));
      out[o] = un(r); out[o + 1] = un(g); out[o + 2] = un(b);
      out[o + 3] = Math.round(a2 * m * 255);
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .resize(Math.round(w * EXPORT))
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(path.join(OUT, L.name + '.webp'));
    manifest[L.name] = {
      x: +(x0 * DISPLAY).toFixed(2), y: +(y0 * DISPLAY).toFixed(2),
      w: +(w * DISPLAY).toFixed(2), h: +(h * DISPLAY).toFixed(2),
    };
  }
  manifest.held = { cx: +(HELD[0] * P * DISPLAY).toFixed(2), cy: +(HELD[1] * P * DISPLAY).toFixed(2), r: +(HELD[2] * P * DISPLAY).toFixed(2) };
  fs.writeFileSync(path.join(OUT, 'layers.json'), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify(manifest));
})();
