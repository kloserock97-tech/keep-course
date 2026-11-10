// Вторая иллюстрация: целая картинка + мягкие «заплатки» поверх предметов,
// которые можно слегка покачивать. node tools/cut-goals.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src-assets', 'goals.png');
const OUT = path.join(__dirname, '..', 'assets', 'goals');
const SIDE = 338;                 // размер на экране, pt
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// центр и полуоси в координатах превью 1000×1000
const PATCHES = [
  { name: 'bowl', c: [580, 180], r: [125, 95] },
  { name: 'bottle', c: [850, 300], r: [120, 120] },
  { name: 'shoe', c: [790, 515], r: [125, 95] },
  { name: 'scale', c: [105, 385], r: [95, 80] },
  { name: 'flag', c: [785, 100], r: [70, 68] },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = await sharp(SRC).metadata();
  const K = meta.width / 1000;
  const { data } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await sharp(SRC).resize(SIDE * 3).webp({ quality: 90 }).toFile(path.join(OUT, 'scene.webp'));
  const manifest = {};
  for (const p of PATCHES) {
    const x0 = Math.max(0, Math.round((p.c[0] - p.r[0]) * K)), y0 = Math.max(0, Math.round((p.c[1] - p.r[1]) * K));
    const x1 = Math.min(meta.width, Math.round((p.c[0] + p.r[0]) * K)), y1 = Math.min(meta.height, Math.round((p.c[1] + p.r[1]) * K));
    const w = x1 - x0, h = y1 - y0, out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * meta.width + x0 + x) * 3, o = (y * w + x) * 4;
      const d = Math.hypot((x0 + x - p.c[0] * K) / (p.r[0] * K), (y0 + y - p.c[1] * K) / (p.r[1] * K));
      out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
      out[o + 3] = Math.round(255 * (1 - smooth(0.72, 1, d)));
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).resize(Math.round(w * 0.8))
      .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(OUT, p.name + '.webp'));
    const s = SIDE / meta.width;
    manifest[p.name] = { x: +(x0 * s).toFixed(2), y: +(y0 * s).toFixed(2), w: +(w * s).toFixed(2), h: +(h * s).toFixed(2) };
  }
  fs.writeFileSync(path.join(OUT, 'layers.json'), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify(manifest));
})();
