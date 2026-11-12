// Нарезка исходной иллюстрации на слои — как от иллюстратора, но из одной плоской картинки:
//   1) фон без предметов: LaMa дорисовывает то, что было за бегуном и целями;
//   2) бегун и цели с прозрачным фоном: ViTMatte считает край по подсказке из масок (tools/trace-art.js, DUMP=1);
//   3) цвет полупрозрачных краёв очищается от прежнего фона по дорисованной подложке.
// Нейросети локальные и бесплатные. Зависимости ставятся во временную папку, путь к ней — ML_DIR:
//   npm i @huggingface/transformers onnxruntime-node sharp   +   lama_fp32.onnx (huggingface.co/Carve/LaMa-ONNX)
// ML_DIR=<папка> node tools/layers.mjs  →  assets/goals/plate.webp, assets/goals/l-*.webp, сцена в index.html
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ML = process.env.ML_DIR; if (!ML) throw new Error('нужен ML_DIR');
const req = createRequire(path.join(ML, 'package.json'));
const sharp = req('sharp'), ort = req('onnxruntime-node');
const { AutoProcessor, VitMatteForImageMatting, RawImage } = await import(new URL('file:///' + req.resolve('@huggingface/transformers').replace(/\\/g, '/')).href);

const W = 1254, N = W * W;
const SRC = path.join(ROOT, 'src-assets', 'goals.png'), MASKS = path.join(ROOT, 'src-assets', 'layers', 'masks'), OUT = path.join(ROOT, 'assets', 'goals');
const rgb = await sharp(SRC).removeAlpha().raw().toBuffer();
const dilate = (m, r) => not(erode(not(m), r, 1));
const largest = (m, minShare = 1) => {                                          // связные пятна; оставляем самое большое (и те, что не меньше minShare от него)
  const lab = new Int32Array(N), sizes = [0]; let n = 0;
  for (let i = 0; i < N; i++) if (m[i] && !lab[i]) { n++; let size = 0; const st = [i]; lab[i] = n; while (st.length) { const j = st.pop(); size++; const x = j % W; for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) if (k >= 0 && k < N && m[k] && !lab[k]) { lab[k] = n; st.push(k); } } sizes.push(size); }
  const big = Math.max(...sizes); const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (lab[i] && sizes[lab[i]] >= big * minShare) o[i] = 1; return o;
};
// рамки, где лежит каждый предмет: маски из векторизатора иногда тянут полосы по краю кадра
const BOX = { bowl: [570, 90, 890, 360], bottle: [900, 220, 1240, 530], bars: [820, 520, 1010, 780], shoe: [860, 560, 1140, 780], scale: [0, 370, 260, 600], flag: [905, 35, 1080, 220], runner: [40, 240, 760, 1230] };
const inBox = (id, i) => { const k = id.startsWith('r-') ? 'runner' : id.slice(5), [x0, y0, x1, y1] = BOX[k], x = i % W, y = (i / W) | 0; return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
const mask = async (id) => { const b = await sharp(path.join(MASKS, id + '.png')).toColourspace('b-w').raw().toBuffer(); const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = b[i] > 127 && inBox(id, i) ? 1 : 0; const r = id === 'goal-flag' ? 2 : id.startsWith('r-') ? 3 : 7; return largest(dilate(erode(m, r), r), id === 'goal-bottle' ? 0.02 : 1); };   // размыкание срезает тонкие полосы-ошибки

// ---------- морфология по квадрату ----------
const erode = (m, r, edge = 0) => {
  const t = new Uint8Array(N), o = new Uint8Array(N), BIG = edge ? 1e9 : 0, line = new Int32Array(W);
  for (let y = 0; y < W; y++) { const row = y * W; let run = BIG; for (let x = 0; x < W; x++) { run = m[row + x] ? run + 1 : 0; line[x] = run; } run = BIG; for (let x = W - 1; x >= 0; x--) { run = m[row + x] ? run + 1 : 0; t[row + x] = Math.min(line[x], run) > r ? 1 : 0; } }
  for (let x = 0; x < W; x++) { let run = BIG; for (let y = 0; y < W; y++) { run = t[y * W + x] ? run + 1 : 0; line[y] = run; } run = BIG; for (let y = W - 1; y >= 0; y--) { run = t[y * W + x] ? run + 1 : 0; o[y * W + x] = Math.min(line[y], run) > r ? 1 : 0; } }
  return o;
};
const not = (m) => m.map((v) => 1 - v);
const bbox = (m, pad = 0) => { let x0 = W, y0 = W, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(W - 1, y1 + pad)]; };

// ---------- маски частей: ручные формы (плотно по предмету) + маски векторизатора (по отличию от фона) ----------
const GOALS = ['bowl', 'bottle', 'bars', 'shoe', 'scale', 'flag'];
const PARTS = ['r-back', 'r-body', 'r-front', 'r-head', 'r-arm'];
const M = {}; for (const g of GOALS) M[g] = await mask('goal-' + g); for (const p of PARTS) M[p] = await mask(p);
const hand = fs.readFileSync(path.join(ROOT, 'src-assets', 'hand-scene.svg'), 'utf8');
const groupOf = (id) => {
  const at = hand.indexOf(`id="${id}"`); let i = hand.lastIndexOf('<g', at), depth = 0, j = i;
  const re = /<g[\s>]|<\/g>/g; re.lastIndex = i;
  for (let m; (m = re.exec(hand));) { depth += m[0] === '</g>' ? -1 : 1; if (depth === 0) { j = m.index + 4; break; } }
  return hand.slice(i, j);
};
const H = {};
for (const id of [...GOALS.map((g) => 'goal-' + g), ...PARTS]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="${W}" height="${W}"><style>*{fill:#fff!important;stroke:#fff!important;opacity:1!important}</style><rect width="1254" height="1254" style="fill:#000!important;stroke:none!important"/>${groupOf(id)}</svg>`;
  const b = await sharp(Buffer.from(svg)).removeAlpha().toColourspace('b-w').raw().toBuffer(); const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = b[i] > 127 ? 1 : 0;
  H[id.replace('goal-', '')] = m;
}
const union = (...ms) => { const o = new Uint8Array(N); for (const m of ms) for (let i = 0; i < N; i++) o[i] |= m[i]; return o; };
const inter = (a, b) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = a[i] & b[i]; return o; };
M.runner = union(...PARTS.map((p) => M[p])); H.runner = union(...PARTS.map((p) => H[p]));

// ---------- 1. вырезка: ViTMatte ----------
// подсказка: «точно предмет» — там, где сходятся ручная форма и маска векторизатора, с запасом внутрь;
// «посчитай сам» — полоса вокруг ручной формы и то, что векторизатор нашёл рядом с ней; остальное — точно фон
const MODEL = 'Xenova/vitmatte-small-distinctions-646';
const processor = await AutoProcessor.from_pretrained(MODEL);
const matte = await VitMatteForImageMatting.from_pretrained(MODEL, { dtype: 'fp32' });
const alpha = {};
for (const k of [...GOALS, 'runner']) {
  const R = k === 'runner' ? { in: 8, band: 18, near: 34 } : k === 'flag' ? { in: 1, band: 8, near: 14 } : { in: 5, band: 14, near: 26 };
  const inner = erode(inter(H[k], M[k]), R.in), outer = union(dilate(H[k], R.band), inter(M[k], dilate(H[k], R.near)));
  const [x0, y0, x1, y1] = bbox(outer, 4), w = x1 - x0 + 1, h = y1 - y0 + 1;
  const im = new Uint8ClampedArray(w * h * 3), tri = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x, j = y * w + x; for (let c = 0; c < 3; c++) im[j * 3 + c] = rgb[i * 3 + c]; tri[j] = inner[i] ? 255 : outer[i] ? 128 : 0; }
  const { alphas } = await matte(await processor(new RawImage(im, w, h, 3), new RawImage(tri, w, h, 1)));
  const A = alphas.tolist()[0][0], a = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x0 + x; a[i] = tri[y * w + x] === 255 ? 1 : tri[y * w + x] === 0 ? 0 : Math.min(1, Math.max(0, A[y][x])); }
  alpha[k] = a; console.log('вырезан', k, w + '×' + h);
}

// ---------- 2. фон без предметов: LaMa дорисовывает то, что было под ними ----------
const lama = await ort.InferenceSession.create(path.join(ML, 'lama_fp32.onnx'));
const plate = Float32Array.from(rgb);
const holeOf = (k) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = alpha[k][i] > 0.03 ? 1 : 0; return dilate(m, 8); };
const holeAll = union(...[...GOALS, 'runner'].map(holeOf));
const fill = async (hole, [x0, y0, x1, y1]) => {
  // квадратный кусок вокруг дыры → 512 × 512 → LaMa (дыра обнулена) → обратно, вставляется только в дыру
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, side = Math.min(W, Math.max(512, Math.round(Math.max(x1 - x0, y1 - y0) * 1.35)));
  const sx = Math.round(Math.max(0, Math.min(W - side, cx - side / 2))), sy = Math.round(Math.max(0, Math.min(W - side, cy - side / 2)));
  const crop = Buffer.alloc(side * side * 3), hm = Buffer.alloc(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const i = (sy + y) * W + sx + x, j = y * side + x; for (let c = 0; c < 3; c++) crop[j * 3 + c] = plate[i * 3 + c]; hm[j] = hole[i] ? 255 : 0; }
  const img = await sharp(crop, { raw: { width: side, height: side, channels: 3 } }).resize(512, 512, { kernel: 'lanczos3' }).raw().toBuffer();
  const mm = new Uint8Array(512 * 512); for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { let v = 0; const ya = Math.floor(y * side / 512), yb = Math.ceil((y + 1) * side / 512), xa = Math.floor(x * side / 512), xb = Math.ceil((x + 1) * side / 512); for (let yy = ya; yy < yb && !v; yy++) for (let xx = xa; xx < xb; xx++) if (hm[yy * side + xx]) { v = 255; break; } mm[y * 512 + x] = v; }   // дыра сжимается «с запасом»: любой пиксель дыры делает дырой всю клетку
  const ti = new Float32Array(3 * 512 * 512), tm = new Float32Array(512 * 512);
  for (let i = 0; i < 512 * 512; i++) { const h = mm[i] > 127 ? 1 : 0; tm[i] = h; for (let c = 0; c < 3; c++) ti[c * 512 * 512 + i] = h ? 0 : img[i * 3 + c] / 255; }
  const out = (await lama.run({ image: new ort.Tensor('float32', ti, [1, 3, 512, 512]), mask: new ort.Tensor('float32', tm, [1, 1, 512, 512]) })).output;
  const o = Buffer.alloc(512 * 512 * 3); for (let i = 0; i < 512 * 512; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = Math.max(0, Math.min(255, out.data[c * 512 * 512 + i]));
  const up = await sharp(o, { raw: { width: 512, height: 512, channels: 3 } }).resize(side, side, { kernel: 'lanczos3' }).raw().toBuffer();
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) { const i = (sy + y) * W + sx + x; if (hole[i]) for (let c = 0; c < 3; c++) plate[i * 3 + c] = up[(y * side + x) * 3 + c]; }
  return [sx, sy, side];
};
for (const k of [...GOALS, 'runner']) { const h = holeOf(k); const r = await fill(h, bbox(h)); console.log('фон дорисован под', k, r.join(' ')); }
// шов дорисовки растушёвывается на 4 px, снаружи — пиксели исходника без изменений
{
  const edge = await sharp(Buffer.from(holeAll.map((v) => v * 255)), { raw: { width: W, height: W, channels: 1 } }).blur(2.5).raw().toBuffer();
  const out = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) { const a = holeAll[i] ? 1 : edge[i] / 255; for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[i * 3 + c] * (1 - a) + plate[i * 3 + c] * a); }
  for (let i = 0; i < N * 3; i++) plate[i] = out[i];
  await sharp(out, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, 'plate.webp'));
  await sharp(out, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(ROOT, '.shots', 'plate.png'));
}

// ---------- 3. слои: цвет без прежнего фона, бегун по частям, у флажка отдельно полотнище ----------
const layers = {};
const save = async (name, a) => {
  let x0 = W, y0 = W, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (a[i] > 0.01) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(W - 1, y1 + 2);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y0 + y) * W + x0 + x, j = (y * w + x) * 4;
    // ореол: на краю, где цвет совпадает с фоном под предметом, это фон — прозрачность гасится
    let al = a[i];
    if (al < 0.999 || name.startsWith('flag')) { const d = Math.hypot(rgb[i * 3] - plate[i * 3], rgb[i * 3 + 1] - plate[i * 3 + 1], rgb[i * 3 + 2] - plate[i * 3 + 2]), t = Math.min(1, Math.max(0, (d - 10) / 35)); al *= t * t * (3 - 2 * t); }
    for (let c = 0; c < 3; c++) { let v = rgb[i * 3 + c]; if (al > 0.02 && al < 0.98) v = (v - (1 - al) * plate[i * 3 + c]) / Math.max(al, 0.3); buf[j + c] = Math.max(0, Math.min(255, Math.round(v))); }
    buf[j + 3] = Math.round(al * 255);
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 80, alphaQuality: 85, effort: 6 }).toFile(path.join(OUT, 'l-' + name + '.webp'));
  layers[name] = { x: x0, y: y0, w, h };
};
for (const g of GOALS.filter((g) => g !== 'flag')) await save(g, alpha[g]);
{ // флажок: полотнище справа от древка отдельно, чтобы полоскалось
  const cloth = new Float32Array(N), rest = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, isC = x > 957 && y < 166; cloth[i] = isC ? alpha.flag[i] : 0; rest[i] = isC ? 0 : alpha.flag[i]; }
  await save('flag-cloth', cloth); await save('flag', rest);
}
{ // бегун: каждая точка — части, чья маска к ней ближе; на стыках части слегка заходят друг на друга
  const own = PARTS.map((p) => dilate(H[p], 3));
  const owner = new Int8Array(N).fill(-1);
  for (let r = 0; r <= 60; r += 6) PARTS.forEach((p, b) => { const g = r ? dilate(H[p], r) : H[p]; for (let i = 0; i < N; i++) if (alpha.runner[i] > 0.01 && owner[i] < 0 && g[i]) owner[i] = b; });
  for (let b = 0; b < PARTS.length; b++) { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = (owner[i] === b || own[b][i]) ? alpha.runner[i] : 0; await save(PARTS[b], a); }
}
fs.writeFileSync(path.join(ROOT, 'src-assets', 'layers', 'layers.json'), JSON.stringify(layers, null, 1));
console.log('слои', Object.keys(layers).join(' '));
