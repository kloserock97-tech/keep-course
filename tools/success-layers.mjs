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
// ViTMatte по подсказке: inner — «точно предмет», outer — «посчитай сам», остальное — фон
const matteOf = async (img, inner, outer) => {
  const [x0, y0, x1, y1] = bbox(outer, 4), w = x1 - x0 + 1, h = y1 - y0 + 1;
  const im = new Uint8ClampedArray(w * h * 3), tri = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x, j = y * w + x; for (let c = 0; c < 3; c++) im[j * 3 + c] = img[i * 3 + c]; tri[j] = inner[i] ? 255 : outer[i] ? 128 : 0; }
  const { alphas } = await matte(await processor(new RawImage(im, w, h, 3), new RawImage(tri, w, h, 1)));
  const A = alphas.tolist()[0][0], a = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x; a[i] = tri[y * w + x] === 255 ? 1 : tri[y * w + x] === 0 ? 0 : Math.min(1, Math.max(0, A[y][x])); }
  return a;
};
// дыры внутри маски заливаются: всё, до чего нельзя дойти от края рамки по пустому, — внутри
const fillHoles = (m, [x0, y0, x1, y1]) => {
  const out = new Uint8Array(N), seen = new Uint8Array(N), st = [];
  for (let x = x0; x <= x1; x++) st.push(y0 * W + x, y1 * W + x); for (let y = y0; y <= y1; y++) st.push(y * W + x0, y * W + x1);
  while (st.length) { const i = st.pop(); if (seen[i] || m[i]) continue; seen[i] = 1; const x = i % W, y = (i / W) | 0; if (x > x0) st.push(i - 1); if (x < x1) st.push(i + 1); if (y > y0) st.push(i - W); if (y < y1) st.push(i + W); }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; out[i] = seen[i] ? 0 : 1; }
  return out;
};
const largest = (m) => { const lab = new Int32Array(N), sizes = [0]; for (let s = 0; s < N; s++) { if (!m[s] || lab[s]) continue; const id = sizes.length, st = [s]; let n = 0; lab[s] = id; while (st.length) { const i = st.pop(); n++; const x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || (j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue; if (m[j] && !lab[j]) { lab[j] = id; st.push(j); } } } sizes.push(n); } let best = 1; for (let k = 2; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k; return lab.map((v) => (v === best ? 1 : 0)); };
for (const k of Object.keys(SHAPES)) H[k] = await poly(SHAPES[k]);
// весы — по цвету: насыщенный синий в рамке весов, циферблат внутри заливается. Ручная форма теряла нижний край
{
  const box = [622, 392, 935, 675], m = new Uint8Array(N);
  const around = dilate(await poly([[695, 406], [906, 436], [919, 462], [876, 658], [848, 666], [640, 614], [632, 594], [672, 418]]), 5);   // соседний пьедестал того же синего — за контуром не берём
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const i = y * W + x, r = src[i * 3], b = src[i * 3 + 2]; m[i] = around[i] && r < 118 && b > 150 && b - r > 85 ? 1 : 0; }
  H.scale = fillHoles(largest(dilate(erode(dilate(m, 2), 5), 3)), box);   // размыкание срезает тонкие полоски и хвосты
}
for (const k of Object.keys(SHAPES)) {
  const R = k === 'scale' ? { in: 3, band: 7 } : k === 'leaf' ? { in: 4, band: 10 } : k === 'avocado' ? { in: 5, band: 6 } : { in: 7, band: 14 };
  alpha[k] = await matteOf(src, erode(H[k], R.in), dilate(H[k], R.band)); console.log('вырезан', k);
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
}
// Фон прозрачный: экран успеха — градиент, белый квадрат картинки на нём был бы виден.
// Пьедесталы — сплошные: их край считает ViTMatte по ручным формам. Пятна за ними и тени на полу — «цвет в прозрачность»
// относительно белого фона: светлое пастельное становится полупрозрачным, белое — прозрачным.
{
  const PED = [
    [[110, 612], [135, 592], [268, 584], [400, 592], [427, 612], [427, 842], [400, 862], [268, 874], [135, 862], [110, 842]],
    [[379, 372], [405, 355], [512, 348], [620, 355], [645, 372], [645, 790], [379, 790]],
    [[600, 628], [630, 606], [758, 598], [890, 606], [917, 628], [917, 848], [890, 868], [758, 877], [630, 868], [600, 848]],
    [[320, 790], [350, 752], [505, 740], [660, 752], [690, 790], [690, 933], [660, 952], [505, 962], [350, 952], [320, 933]],
  ];
  const ped0 = union(...(await Promise.all(PED.map(poly))));
  const ink = new Uint8Array(N); for (let i = 0; i < N; i++) ink[i] = 255 * 3 - plate[i * 3] - plate[i * 3 + 1] - plate[i * 3 + 2] > 60 ? 1 : 0;
  // ручные формы чуть шире настоящих краёв у нижних углов: почти белое внутри формы — это фон, не пьедестал
  const ped = new Uint8Array(N); for (let i = 0; i < N; i++) ped[i] = ped0[i] && (((i / W) | 0) < 800 || 765 - plate[i * 3] - plate[i * 3 + 1] - plate[i * 3 + 2] > 28) ? 1 : 0;   // только внизу: светлая верхушка лавандового — пьедестал
  const near = dilate(ped0, 10);
  const inner = erode(ped, 7), outer = new Uint8Array(N); for (let i = 0; i < N; i++) outer[i] = near[i] && (ink[i] || ped[i]) ? 1 : 0;
  const aP = await matteOf(plate, inner, dilate(outer, 4));
  for (let i = 0; i < N; i++) { if (((i / W) | 0) < 780) continue; const p = [plate[i * 3], plate[i * 3 + 1], plate[i * 3 + 2]], ch = Math.max(...p) - Math.min(...p), t = Math.min(1, Math.max(0, (ch - 12) / 22)); aP[i] *= t * t * (3 - 2 * t); }   // у ножек серое — это пол и тень на нём, не пьедестал: у пьедесталов цвет
  const bg = [0, 1, 2].map((c) => { let s = 0; for (let y = 4; y < 24; y++) for (let x = 4; x < 24; x++) s += plate[(y * W + x) * 3 + c]; return s / 400; });
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const p = [plate[i * 3], plate[i * 3 + 1], plate[i * 3 + 2]];
    let aC = 0; for (let c = 0; c < 3; c++) aC = Math.max(aC, (bg[c] - p[c]) / bg[c]);
    aC = Math.max(0, Math.min(1, (aC - 0.015) * 1.15));                       // у самого белого — ровно ноль, без серой вуали
    const a = aP[i] + (1 - aP[i]) * aC;
    for (let c = 0; c < 3; c++) {
      const cP = aP[i] > 0.02 ? (p[c] - (1 - aP[i]) * bg[c]) / Math.max(aP[i], 0.3) : 0, cC = aC > 0.01 ? bg[c] - (bg[c] - p[c]) / aC : 0;
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(a > 0.001 ? (aP[i] * cP + (1 - aP[i]) * aC * cC) / a : 0)));
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }
  await sharp(out, { raw: { width: W, height: W, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(OUT, 'plate.webp'));
  await sharp(out, { raw: { width: W, height: W, channels: 4 } }).png().toFile(path.join(ROOT, '.shots', 'success-plate.png'));
  console.log('фон прозрачный');
}

// 3. слои: цвет полупрозрачного края очищен от прежнего фона
const layers = {};
for (const k of ORDER.filter((k) => k !== 'bowl' && k !== 'avocado')) {      // миска собирается из листа с продуктами
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

// 4. Миска по частям. Продукты взяты с отдельного листа (src-assets/success/food.png, та же генерация по стилю):
// у каждого целая форма, поэтому их можно двигать по отдельности. У миски отдельно передняя стенка —
// она ложится поверх продуктов и прячет их низ, как будто они лежат внутри.
{
  const food = Buffer.from(await sharp(path.join(ROOT, 'src-assets', 'success', 'food.png')).removeAlpha().resize(W, W).raw().toBuffer());
  const BOX = { bowl: [62, 94, 492, 340], lettuce: [556, 34, 960, 404], salmon: [60, 406, 498, 656], chickpeas: [582, 432, 956, 686], avocado: [342, 686, 642, 976] };
  const fa = {};
  for (const [k, box] of Object.entries(BOX)) {
    const m = new Uint8Array(N);
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const i = y * W + x; m[i] = 765 - food[i * 3] - food[i * 3 + 1] - food[i * 3 + 2] > (k === 'bowl' ? 14 : 40) ? 1 : 0; }
    const mk = fillHoles(largest(erode(dilate(m, 2), 2)), box);
    fa[k] = await matteOf(food, erode(mk, k === 'bowl' ? 5 : 3), dilate(mk, 6));
    console.log('продукт', k);
  }
  const save = async (name, a) => {
    const [x0, y0, x1, y1] = bbox(a.map((v) => (v > 0.01 ? 1 : 0)), 2), w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y0 + y) * W + x0 + x, j = (y * w + x) * 4, al = a[i];
      for (let c = 0; c < 3; c++) { let v = food[i * 3 + c]; if (al > 0.02 && al < 0.98) v = (v - (1 - al) * 255) / Math.max(al, 0.3); buf[j + c] = Math.max(0, Math.min(255, Math.round(v))); }
      buf[j + 3] = Math.round(al * 255);
    }
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, 'l-' + name + '.webp'));
    layers[name] = { x: x0, y: y0, w, h };
  };
  for (const k of Object.keys(BOX)) await save(k, fa[k]);
  // передняя стенка: всё, что ниже переднего края ободка (нижняя дуга эллипса ободка), с растушёвкой в 3 px
  const R = { cx: 277, cy: 162, rx: 208, ry: 60 }, front = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!fa.bowl[i]) continue; const x = i % W, y = (i / W) | 0, u = (x - R.cx) / R.rx; const lip = Math.abs(u) < 1 ? R.cy + R.ry * Math.sqrt(1 - u * u) : R.cy; const t = Math.min(1, Math.max(0, (y - lip + 1) / 3)); front[i] = fa.bowl[i] * t; }
  await save('bowl-front', front);
  layers.rim = R;
}
fs.writeFileSync(path.join(ROOT, 'src-assets', 'success', 'layers.json'), JSON.stringify(layers, null, 1));
console.log('слои', JSON.stringify(layers));
