// Картинка «Цели настроены» → слои для анимации. Исходник: src-assets/success/gen-1.png (сгенерирована в Figma AI по образцу экрана продукта).
// ML_DIR=<папка с нейросетями> node tools/success-layers.mjs  →  assets/success/plate.webp, l-*.webp, src-assets/success/layers.json
// Как и для картинки с бегуном: ручные формы → ViTMatte считает край, LaMa дорисовывает фон под предметами.
// Стрелка весов стирается с циферблата: на экране она нарисована вектором, чтобы качаться.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ML = process.env.ML_DIR; if (!ML) throw new Error('нужен ML_DIR');
const req = createRequire(path.join(ML, 'package.json'));
const sharp = req('sharp'), ort = req('onnxruntime-node');
const { AutoProcessor, VitMatteForImageMatting, RawImage } = await import(new URL('file:///' + req.resolve('@huggingface/transformers').replace(/\\/g, '/')).href);

const W = 1024, N = W * W;
const SRC = path.join(ROOT, 'src-assets', 'success', 'gen-1.png'), OUT = path.join(ROOT, 'assets', 'success');
fs.mkdirSync(OUT, { recursive: true });
const rgb = Buffer.from(await sharp(SRC).removeAlpha().raw().toBuffer());

// ручные формы предметов, в пикселях исходника
const SHAPES = {
  leaf: [[166, 154], [206, 158], [242, 188], [266, 240], [224, 240], [188, 216], [170, 190]],
  bottle: [[480, 52], [548, 52], [550, 90], [565, 100], [576, 140], [578, 370], [568, 388], [460, 388], [450, 370], [450, 140], [462, 100], [478, 90]],
  bowl: [[100, 478], [108, 445], [140, 420], [165, 392], [205, 378], [240, 372], [280, 380], [320, 393], [345, 412], [372, 428], [392, 445], [398, 470], [410, 490], [412, 520], [398, 565], [360, 610], [300, 636], [225, 637], [165, 615], [125, 575], [112, 530], [108, 500]],
  avocado: [[300, 445], [330, 428], [365, 428], [388, 445], [394, 480], [390, 512], [372, 528], [300, 530], [284, 505], [286, 470]],
  scale: [[702, 416], [900, 446], [908, 470], [866, 649], [845, 655], [648, 604], [643, 590], [690, 425]],   // чуть внутри края: снаружи — фон и пьедестал
  dumbbell: [[370, 705], [400, 697], [440, 700], [462, 712], [535, 690], [545, 675], [580, 668], [615, 675], [632, 700], [630, 750], [610, 775], [570, 782], [545, 765], [462, 770], [455, 800], [420, 812], [380, 805], [362, 770], [360, 740]],
};
const NEEDLE = [[770, 497], [773, 488], [796, 462], [801, 465], [783, 497]];   // стрелка весов: от оси вверх-вправо
const poly = async (pts) => {
  const svg = `<svg width="${W}" height="${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${W}" fill="#000"/><polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="#fff" stroke="none"/></svg>`;
  const b = await sharp(Buffer.from(svg)).removeAlpha().toColourspace('b-w').raw().toBuffer();
  const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = b[i] > 127 ? 1 : 0; return m;
};
// edge — чем считать точки за краем кадра: для сжатия маски это «пусто», для расширения (сжатие инверсии) — «заполнено»
const erode = (m, r, edge = 0) => { const o = new Uint8Array(N); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { let ok = 1; for (let d = -r; d <= r && ok; d++) { const xx = x + d, yy = y + d; if (xx < 0 || xx >= W ? !edge : !m[y * W + xx]) ok = 0; if (yy < 0 || yy >= W ? !edge : !m[yy * W + x]) ok = 0; } o[y * W + x] = ok; } return o; };
const not = (m) => m.map((v) => 1 - v);
const dilate = (m, r) => not(erode(not(m), r, 1));
const union = (...ms) => { const o = new Uint8Array(N); for (const m of ms) for (let i = 0; i < N; i++) o[i] |= m[i]; return o; };
const bbox = (m, pad = 0) => { let x0 = W, y0 = W, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(W - 1, y1 + pad)]; };

// ---------- LaMa: дорисовать дыру ----------
const lama = await ort.InferenceSession.create(path.join(ML, 'lama_fp32.onnx'));
const fill = async (img, hole) => {
  const [x0, y0, x1, y1] = bbox(hole);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, side = Math.min(W, Math.max(256, Math.round(Math.max(x1 - x0, y1 - y0) * 1.5)));
  const sx = Math.round(Math.max(0, Math.min(W - side, cx - side / 2))), sy = Math.round(Math.max(0, Math.min(W - side, cy - side / 2)));
  const crop = Buffer.alloc(side * side * 3), hm = Buffer.alloc(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const i = (sy + y) * W + sx + x, j = y * side + x; for (let c = 0; c < 3; c++) crop[j * 3 + c] = img[i * 3 + c]; hm[j] = hole[i] ? 255 : 0; }
  const im = await sharp(crop, { raw: { width: side, height: side, channels: 3 } }).resize(512, 512, { kernel: 'lanczos3' }).raw().toBuffer();
  const mm = new Uint8Array(512 * 512); for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { let v = 0; const ya = Math.floor(y * side / 512), yb = Math.ceil((y + 1) * side / 512), xa = Math.floor(x * side / 512), xb = Math.ceil((x + 1) * side / 512); for (let yy = ya; yy < yb && !v; yy++) for (let xx = xa; xx < xb; xx++) if (hm[yy * side + xx]) { v = 255; break; } mm[y * 512 + x] = v; }
  const ti = new Float32Array(3 * 512 * 512), tm = new Float32Array(512 * 512);
  for (let i = 0; i < 512 * 512; i++) { const h = mm[i] > 127 ? 1 : 0; tm[i] = h; for (let c = 0; c < 3; c++) ti[c * 512 * 512 + i] = h ? 0 : im[i * 3 + c] / 255; }
  const out = (await lama.run({ image: new ort.Tensor('float32', ti, [1, 3, 512, 512]), mask: new ort.Tensor('float32', tm, [1, 1, 512, 512]) })).output;
  const o = Buffer.alloc(512 * 512 * 3); for (let i = 0; i < 512 * 512; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = Math.max(0, Math.min(255, out.data[c * 512 * 512 + i]));
  const up = await sharp(o, { raw: { width: 512, height: 512, channels: 3 } }).resize(side, side, { kernel: 'lanczos3' }).raw().toBuffer();
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const i = (sy + y) * W + sx + x; if (hole[i]) for (let c = 0; c < 3; c++) img[i * 3 + c] = up[(y * side + x) * 3 + c]; }
};

// 0. стрелка весов стирается с циферблата
const src = Buffer.from(rgb);
await fill(src, dilate(await poly(NEEDLE), 6));
console.log('стрелка стёрта');

// 1. вырезка: ViTMatte по подсказке «точно предмет / посчитай сам / точно фон»
const MODEL = 'Xenova/vitmatte-small-distinctions-646';
const processor = await AutoProcessor.from_pretrained(MODEL);
const matte = await VitMatteForImageMatting.from_pretrained(MODEL, { dtype: 'fp32' });
const H = {}, alpha = {};
for (const k of Object.keys(SHAPES)) H[k] = await poly(SHAPES[k]);
for (const k of Object.keys(SHAPES)) {
  const R = k === 'leaf' ? { in: 4, band: 10 } : k === 'avocado' ? { in: 5, band: 6 } : { in: 7, band: 14 };
  const inner = erode(H[k], R.in), outer = dilate(H[k], R.band);
  const [x0, y0, x1, y1] = bbox(outer, 4), w = x1 - x0 + 1, h = y1 - y0 + 1;
  const im = new Uint8ClampedArray(w * h * 3), tri = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x, j = y * w + x; for (let c = 0; c < 3; c++) im[j * 3 + c] = src[i * 3 + c]; tri[j] = inner[i] ? 255 : outer[i] ? 128 : 0; }
  const { alphas } = await matte(await processor(new RawImage(im, w, h, 3), new RawImage(tri, w, h, 1)));
  const A = alphas.tolist()[0][0], a = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x; a[i] = tri[y * w + x] === 255 ? 1 : tri[y * w + x] === 0 ? 0 : Math.min(1, Math.max(0, A[y][x])); }
  alpha[k] = a; console.log('вырезан', k, w + '×' + h);
}
// авокадо лежит в миске: у миски его место вычитается, чтобы он мог качаться отдельно
for (let i = 0; i < N; i++) alpha.bowl[i] = Math.max(0, alpha.bowl[i] - alpha.avocado[i]);

// 2. фон без предметов
const plate = Buffer.from(src);
// под тяжёлыми предметами дыра шире: вместе с ними уходит запечённая тень — на экране тени свои, они живут с предметом
const GROW = { leaf: 6, avocado: 6, bottle: 12, bowl: 12, scale: 12, dumbbell: 18 };
const holeOf = (k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = alpha[k][i] > 0.03 ? 1 : 0; return dilate(m, GROW[k]); };
const ORDER = ['leaf', 'bottle', 'bowl', 'avocado', 'scale', 'dumbbell'];
const holeAll = union(...ORDER.map(holeOf));
for (const k of ['leaf', 'bottle', 'scale', 'dumbbell']) { await fill(plate, holeOf(k)); console.log('фон под', k); }
await fill(plate, union(holeOf('bowl'), holeOf('avocado'))); console.log('фон под миской');
// Верх оранжевого пьедестала под гантелью — ровная поверхность, но дорисовка тащит в неё тень. Заливаем её сами:
// цвет по высоте подбирается по видимой части верха, сверху — зерно той же силы, что у соседних точек.
{
  const E = { cx: 506, cy: 803, rx: 182, ry: 54 }, inE = (x, y) => ((x - E.cx) / E.rx) ** 2 + ((y - E.cy) / E.ry) ** 2 < 1;
  const hole = holeOf('dumbbell'), shadow = await poly([[350, 760], [660, 760], [672, 830], [360, 840]]);
  const known = [], fillPts = [];
  for (let y = E.cy - E.ry; y < E.cy + E.ry; y++) for (let x = E.cx - E.rx; x < E.cx + E.rx; x++) { if (!inE(x, y)) continue; const i = y * W + x; if (hole[i] || shadow[i]) fillPts.push(i); else known.push(i); }
  // освещение — плавная поверхность второй степени по x и y (метод наименьших квадратов)
  const feat = (i) => { const x = (i % W - E.cx) / E.rx, y = (((i / W) | 0) - E.cy) / E.ry; return [1, x, y, x * x, y * y, x * y]; };
  const solve = (A, b) => { const n = b.length; for (let k = 0; k < n; k++) { let p = k; for (let r = k + 1; r < n; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r; [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]]; for (let r = k + 1; r < n; r++) { const f = A[r][k] / A[k][k]; for (let c = k; c < n; c++) A[r][c] -= f * A[k][c]; b[r] -= f * b[k]; } } const x = new Array(n).fill(0); for (let k = n - 1; k >= 0; k--) { let s = b[k]; for (let c = k + 1; c < n; c++) s -= A[k][c] * x[c]; x[k] = s / A[k][k]; } return x; };
  const coef = [0, 1, 2].map((c) => { const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), b = new Array(6).fill(0); for (const i of known) { const f = feat(i), v = src[i * 3 + c]; for (let r = 0; r < 6; r++) { b[r] += f[r] * v; for (let q = 0; q < 6; q++) A[r][q] += f[r] * f[q]; } } return solve(A, b); });
  // зерно — отклонение точки от среднего по соседям 5 × 5, а не от общей поверхности
  const grain = [0, 1, 2].map((c) => { let r = 0, n = 0; for (const i of known) { const x = i % W, y = (i / W) | 0; let s = 0, m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * W + x + dx; if (!hole[j] && !shadow[j]) { s += src[j * 3 + c]; m++; } } if (m > 12) { r += (src[i * 3 + c] - s / m) ** 2; n++; } } return Math.sqrt(r / n); });
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  // к ободу заливка плавно уступает дорисовке: у края поверхность второй степени ошибается
  for (const i of fillPts) {
    const f = feat(i), g = gauss(), rn = Math.hypot(f[1], f[2]), t = Math.min(1, Math.max(0, (rn - 0.78) / 0.18)), w = 1 - t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) plate[i * 3 + c] = Math.max(0, Math.min(255, Math.round(plate[i * 3 + c] * (1 - w) + (f.reduce((s, v, k) => s + v * coef[c][k], 0) + g * grain[c]) * w)));
  }
  console.log('зерно', grain.map((v) => v.toFixed(1)).join(' '));
  for (const i of fillPts) holeAll[i] = 1;
  console.log('верх оранжевого пьедестала залит', fillPts.length);
}
{
  const edge = await sharp(Buffer.from(holeAll.map((v) => v * 255)), { raw: { width: W, height: W, channels: 1 } }).blur(2.5).raw().toBuffer();
  for (let i = 0; i < N; i++) { const a = holeAll[i] ? 1 : edge[i] / 255; for (let c = 0; c < 3; c++) plate[i * 3 + c] = Math.round(src[i * 3 + c] * (1 - a) + plate[i * 3 + c] * a); }
  await sharp(plate, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 90 }).toFile(path.join(OUT, 'plate.webp'));
  await sharp(plate, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(ROOT, '.shots', 'success-plate.png'));
}

// 3. слои: цвет полупрозрачного края очищен от прежнего фона
const layers = {};
for (const k of ORDER) {
  const a = alpha[k], [x0, y0, x1, y1] = bbox(a.map((v) => (v > 0.01 ? 1 : 0)), 2), w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y0 + y) * W + x0 + x, j = (y * w + x) * 4; let al = a[i];
    if (al < 0.999) { const d = Math.hypot(src[i * 3] - plate[i * 3], src[i * 3 + 1] - plate[i * 3 + 1], src[i * 3 + 2] - plate[i * 3 + 2]), t = Math.min(1, Math.max(0, (d - 8) / 30)); al *= t * t * (3 - 2 * t); }
    for (let c = 0; c < 3; c++) { let v = src[i * 3 + c]; if (al > 0.02 && al < 0.98) v = (v - (1 - al) * plate[i * 3 + c]) / Math.max(al, 0.3); buf[j + c] = Math.max(0, Math.min(255, Math.round(v))); }
    buf[j + 3] = Math.round(al * 255);
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, 'l-' + k + '.webp'));
  layers[k] = { x: x0, y: y0, w, h };
}
layers.needle = { pivot: [776, 494], tip: [799, 463] };
fs.writeFileSync(path.join(ROOT, 'src-assets', 'success', 'layers.json'), JSON.stringify(layers, null, 1));
console.log('слои', JSON.stringify(layers));
