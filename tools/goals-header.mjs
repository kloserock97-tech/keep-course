// Шапка экрана «Цели» — та же картинка, что в продукте. Источник — скриншот экрана из продукта
// (src-assets/success/goals-screen.png, 590 × 1280, это 1,5×). С картинки стираются заголовок «Цели», стрелка «Назад»
// и значок «i» — LaMa дорисовывает под ними фон; на экране они свои, поверх. Низ растворяется в фоне страницы.
// ML_DIR=<папка с нейросетями> node tools/goals-header.mjs  →  assets/success/goals-header.webp
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ML = process.env.ML_DIR; if (!ML) throw new Error('нужен ML_DIR');
const req = createRequire(path.join(ML, 'package.json'));
const sharp = req('sharp'), ort = req('onnxruntime-node');

const TOP = 92, BOTTOM = 344, W = 590, H = BOTTOM - TOP;             // полоса скриншота с картинкой, в пикселях
const img = Buffer.from(await sharp(path.join(ROOT, 'src-assets', 'success', 'goals-screen.png')).removeAlpha().extract({ left: 0, top: TOP, width: W, height: H }).raw().toBuffer());
// что стереть: заголовок, стрелка, «i» (координаты скриншота)
const HOLES = [[228, 210, 366, 260], [40, 100, 72, 142], [500, 96, 556, 148]];
const lama = await ort.InferenceSession.create(path.join(ML, 'lama_fp32.onnx'));
for (const [x0, y0, x1, y1] of HOLES) {
  // квадрат вокруг дыры → 512 × 512 → LaMa → обратно, вставляется только в дыру
  const side = Math.min(H, Math.max(160, Math.round(Math.max(x1 - x0, y1 - y0) * 2.2)));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - TOP;
  const sx = Math.round(Math.max(0, Math.min(W - side, cx - side / 2))), sy = Math.round(Math.max(0, Math.min(H - side, cy - side / 2)));
  const crop = Buffer.alloc(side * side * 3), hole = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const X = sx + x, Y = sy + y, i = Y * W + X, j = y * side + x;
    for (let c = 0; c < 3; c++) crop[j * 3 + c] = img[i * 3 + c];
    hole[j] = X >= x0 && X <= x1 && Y + TOP >= y0 && Y + TOP <= y1 ? 1 : 0;
  }
  const im = await sharp(crop, { raw: { width: side, height: side, channels: 3 } }).resize(512, 512, { kernel: 'lanczos3' }).raw().toBuffer();
  const ti = new Float32Array(3 * 512 * 512), tm = new Float32Array(512 * 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = y * 512 + x, h = hole[Math.min(side - 1, Math.floor(y * side / 512)) * side + Math.min(side - 1, Math.floor(x * side / 512))];
    tm[i] = h; for (let c = 0; c < 3; c++) ti[c * 512 * 512 + i] = h ? 0 : im[i * 3 + c] / 255;
  }
  const out = (await lama.run({ image: new ort.Tensor('float32', ti, [1, 3, 512, 512]), mask: new ort.Tensor('float32', tm, [1, 1, 512, 512]) })).output;
  const o = Buffer.alloc(512 * 512 * 3); for (let i = 0; i < 512 * 512; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = Math.max(0, Math.min(255, out.data[c * 512 * 512 + i]));
  const up = await sharp(o, { raw: { width: 512, height: 512, channels: 3 } }).resize(side, side, { kernel: 'lanczos3' }).raw().toBuffer();
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (hole[y * side + x]) { const i = (sy + y) * W + sx + x; for (let c = 0; c < 3; c++) img[i * 3 + c] = up[(y * side + x) * 3 + c]; }
  console.log('стёрто', x0, y0, x1, y1);
}
// прозрачность: белое у верха и растворение к низу — картинка переходит в фон страницы, как в продукте
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, p = [img[i * 3], img[i * 3 + 1], img[i * 3 + 2]];
  let a = 0; for (let c = 0; c < 3; c++) a = Math.max(a, (255 - p[c]) / 255);
  a = Math.min(1, a * 1.25);                                              // почти белое — прозрачное, цветное — сплошное
  const fade = Math.min(1, (H - y) / 34);                                 // нижние 34 px тают
  const A = a * fade;
  for (let c = 0; c < 3; c++) out[i * 4 + c] = a > 0.01 ? Math.max(0, Math.min(255, Math.round(255 - (255 - p[c]) / Math.max(a, 0.05)))) : 255;
  out[i * 4 + 3] = Math.round(A * 255);
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(ROOT, 'assets', 'success', 'goals-header.webp'));
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(ROOT, '.shots', 'goals-header.png'));
console.log('шапка', W + '×' + H, 'сверху', TOP, 'px скриншота');
