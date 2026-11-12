// Стикеры для экрана «Цели настроены»: предметы с наших картинок с белой обводкой и мягкой тенью, как наклейки.
// node tools/stickers.mjs  →  assets/stickers/s-*.webp
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(import.meta.url)(path.join(ROOT, 'node_modules', 'sharp'));
const OUT = path.join(ROOT, 'assets', 'stickers');
fs.mkdirSync(OUT, { recursive: true });

// всё про спорт, воду, вес и питание; из картинки успеха и картинки с бегуном
const SRC = {
  bottle: 'success/l-bottle', dumbbell: 'success/l-dumbbell', scale: 'success/l-scale', leaf: 'success/l-leaf',
  avocado: 'success/l-avocado', salmon: 'success/l-salmon', lettuce: 'success/l-lettuce', chickpeas: 'success/l-chickpeas',
  shoe: 'goals/l-shoe',
};
const S = 128, INNER = 100, RIM = 7;                       // холст, место под предмет, толщина белой обводки
for (const [name, file] of Object.entries(SRC)) {
  const obj = await sharp(path.join(ROOT, 'assets', file + '.webp')).ensureAlpha().resize(INNER, INNER, { fit: 'inside' }).toBuffer();
  const { width: w, height: h } = await sharp(obj).metadata();
  const placed = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: obj, left: Math.round((S - w) / 2), top: Math.round((S - h) / 2) }]).png().toBuffer();
  const a = await sharp(placed).extractChannel(3).raw().toBuffer();
  // обводка: альфа размывается и отсекается порогом — получается ровная полоса вокруг силуэта
  const blur = await sharp(a, { raw: { width: S, height: S, channels: 1 } }).blur(RIM / 2).extractChannel(0).raw().toBuffer();   // после размытия sharp отдаёт три канала — берём один
  const rim = Buffer.alloc(S * S * 4), shadow = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = blur[i] > 10 ? 255 : Math.round(blur[i] * 25.5); rim[i * 4] = rim[i * 4 + 1] = rim[i * 4 + 2] = 255; rim[i * 4 + 3] = v; shadow[i * 4] = 20; shadow[i * 4 + 1] = 30; shadow[i * 4 + 2] = 70; shadow[i * 4 + 3] = Math.round(v * 0.22); }
  const sh = await sharp(shadow, { raw: { width: S, height: S, channels: 4 } }).blur(3).png().toBuffer();
  await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sh, left: 0, top: 2 }, { input: await sharp(rim, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer() }, { input: placed }])
    .webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(OUT, `s-${name}.webp`));
}
console.log('стикеры', Object.keys(SRC).join(' '));
