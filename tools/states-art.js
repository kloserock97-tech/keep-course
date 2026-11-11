// Кадры «включения света» для варианта ?v=states: сцена в сумерках, свет разливается от флажка-цели.
// Каждый кадр — отдельная картинка, как в покадровой анимации; меняются они ступеньками «на двойках».
// node tools/states-art.js  →  assets/goals/plate-s0…s3.webp (s4 — это обычный plate.webp)
const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'goals');
const S = 1014, K = S / 1254;                     // размер кадра: 338 pt × 3
const FLAG = [952 * K, 196 * K];
const RADII = [0, 360, 720, 1080].map((r) => r * K), SOFT = 260 * K;

(async () => {
  const day = await sharp(path.join(OUT, 'plate.webp')).resize(S, S).removeAlpha().raw().toBuffer();
  // сумерки: темнее, почти без цвета, с холодным синим подтоном — «свет выключен»
  const dusk = Buffer.alloc(day.length);
  for (let i = 0; i < S * S; i++) {
    const r = day[i * 3], g = day[i * 3 + 1], b = day[i * 3 + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
    const mix = (c, t) => c * 0.22 + l * 0.78;      // 78 % серого
    dusk[i * 3] = Math.round(mix(r) * 0.62 + 18); dusk[i * 3 + 1] = Math.round(mix(g) * 0.64 + 24); dusk[i * 3 + 2] = Math.round(mix(b) * 0.7 + 52);
  }
  for (let k = 0; k < RADII.length; k++) {
    const out = Buffer.alloc(day.length), R = RADII[k];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, d = Math.hypot(x - FLAG[0], y - FLAG[1]);
      let t = R === 0 ? 0 : Math.min(1, Math.max(0, (R - d) / SOFT + 0.5)); t = t * t * (3 - 2 * t);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(dusk[i * 3 + c] * (1 - t) + day[i * 3 + c] * t);
    }
    await sharp(out, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 78 }).toFile(path.join(OUT, `plate-s${k}.webp`));
    console.log('кадр', k);
  }
})();
