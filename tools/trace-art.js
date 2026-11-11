// Векторная копия исходной иллюстрации: палитра + гладкие контуры каждой цветовой области.
// Подвижные части (цели, бегун по частям) выделяются масками; под ними фон достраивается заливкой,
// поэтому, когда часть двигается или улетает, дыры нет.
// node tools/trace-art.js  →  assets/goals/scene.svg и вставка в index.html между <!-- scene:start --> и <!-- scene:end -->
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const W = +(process.env.W || 1254), S = 1254 / W, R = W / 627;   // R — во сколько раз рабочее разрешение больше половинного                    // рабочее разрешение и множитель в координаты исходника
const K = +(process.env.K || 56);               // цветов в палитре
const N = W * W;

// ---------- растровые помощники ----------
const boxBlur = (src, r) => {                    // разделимое размытие «коробкой»; три прохода ≈ гаусс
  const tmp = new Float32Array(N), out = new Float32Array(N), d = 2 * r + 1;
  for (let y = 0; y < W; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = acc / d; acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(W - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < W; y++) { out[y * W + x] = acc / d; acc += tmp[Math.min(W - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
};
const blur = (m, r) => { let a = m; for (let i = 0; i < 3; i++) a = boxBlur(a, r); return a; };
const thr = (m, t) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = m[i] > t ? 1 : 0; return o; };
const dilate = (m, r) => thr(blur(m, Math.max(1, Math.round(r / 2))), 0.08);
const erode = (m, r) => thr(blur(m, Math.max(1, Math.round(r / 2))), 0.92);
const and = (a, b) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = a[i] * b[i]; return o; };
const or = (a, b) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = Math.max(a[i], b[i]); return o; };
const not = (a) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = 1 - a[i]; return o; };
const flood = (seed, allowed) => {               // всё, что связано с seed через allowed
  const out = new Float32Array(N), st = [];
  for (let i = 0; i < N; i++) if (seed[i] && allowed[i]) { out[i] = 1; st.push(i); }
  while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < W - 1 ? i + W : -1]) if (j >= 0 && !out[j] && allowed[j]) { out[j] = 1; st.push(j); } }
  return out;
};

// заливка дыр «пирамидой»: среднее по соседям на всё более грубых уровнях, потом обратно с плавным подмешиванием
const inpaint = (rgb, hole) => {
  const levels = [{ w: W, c: new Float32Array(N * 3), a: new Float32Array(N) }];
  for (let i = 0; i < N; i++) { const a = 1 - hole[i]; levels[0].a[i] = a; for (let k = 0; k < 3; k++) levels[0].c[i * 3 + k] = rgb[i * 3 + k] * a; }
  while (levels[levels.length - 1].w > 2) {
    const p = levels[levels.length - 1], w = Math.ceil(p.w / 2), c = new Float32Array(w * w * 3), a = new Float32Array(w * w);
    for (let y = 0; y < p.w; y++) for (let x = 0; x < p.w; x++) { const j = (y >> 1) * w + (x >> 1), i = y * p.w + x; a[j] += p.a[i] / 4; for (let k = 0; k < 3; k++) c[j * 3 + k] += p.c[i * 3 + k] / 4; }
    levels.push({ w, c, a });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const p = levels[l], q = levels[l + 1];
    for (let y = 0; y < p.w; y++) for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x, fx = Math.min(q.w - 1.001, Math.max(0, x / 2 - 0.25)), fy = Math.min(q.w - 1.001, Math.max(0, y / 2 - 0.25)), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const at = (xx, yy, k) => { const j = Math.min(q.w - 1, yy) * q.w + Math.min(q.w - 1, xx); return q.a[j] > 1e-6 ? q.c[j * 3 + k] / q.a[j] : 255; };
      const aa = Math.min(1, p.a[i]);
      for (let k = 0; k < 3; k++) {
        const up = (at(x0, y0, k) * (1 - tx) + at(x0 + 1, y0, k) * tx) * (1 - ty) + (at(x0, y0 + 1, k) * (1 - tx) + at(x0 + 1, y0 + 1, k) * tx) * ty;
        const own = p.a[i] > 1e-6 ? p.c[i * 3 + k] / p.a[i] : up;
        p.c[i * 3 + k] = (own * aa + up * (1 - aa));
      }
      p.a[i] = 1;
    }
  }
  return levels[0].c;
};

// ---------- контуры: «марширующие квадраты» по размытой маске, упрощение, сглаживание ----------
const trace = (field, iso, bbox) => {
  const [bx0, by0, bx1, by1] = bbox, F = (x, y) => (x < bx0 || y < by0 || x > bx1 || y > by1) ? 0 : field[y * W + x];
  const pts = new Map(), next = new Map();
  const key = (x, y, o) => (o * (W + 2) + (y + 1)) * (W + 2) + (x + 1);
  const ip = (x0, y0, x1, y1) => { const a = F(x0, y0), b = F(x1, y1), t = (iso - a) / (b - a || 1e-6); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; };
  for (let y = by0 - 1; y <= by1; y++) for (let x = bx0 - 1; x <= bx1; x++) {
    const a = F(x, y) > iso, b = F(x + 1, y) > iso, c = F(x + 1, y + 1) > iso, d = F(x, y + 1) > iso;
    const idx = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = key(x, y, 0), B = key(x, y + 1, 0), L = key(x, y, 1), R = key(x + 1, y, 1);
    const P = { [T]: () => ip(x, y, x + 1, y), [B]: () => ip(x, y + 1, x + 1, y + 1), [L]: () => ip(x, y, x, y + 1), [R]: () => ip(x + 1, y, x + 1, y + 1) };
    const seg = (e1, e2) => { if (!pts.has(e1)) pts.set(e1, P[e1]()); if (!pts.has(e2)) pts.set(e2, P[e2]()); next.set(e1, e2); };
    // направление обхода: внутри слева
    const center = (F(x, y) + F(x + 1, y) + F(x + 1, y + 1) + F(x, y + 1)) / 4 > iso;
    switch (idx) {
      case 1: seg(B, L); break; case 2: seg(R, B); break; case 3: seg(R, L); break; case 4: seg(T, R); break;
      case 5: if (center) { seg(T, L); seg(B, R); } else { seg(T, R); seg(B, L); } break;
      case 6: seg(T, B); break; case 7: seg(T, L); break; case 8: seg(L, T); break; case 9: seg(B, T); break;
      case 10: if (center) { seg(L, B); seg(R, T); } else { seg(L, T); seg(R, B); } break;
      case 11: seg(R, T); break; case 12: seg(L, R); break; case 13: seg(B, R); break; case 14: seg(L, B); break;
    }
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let e = start;
    while (e !== undefined && !seen.has(e)) { seen.add(e); loop.push(pts.get(e)); e = next.get(e); }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
};
const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const rdp = (pts, eps) => {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((p, i) => keep[i]);
};
const f1 = (n) => Math.round(n * S);
const pathOf = (loops) => loops.map((raw) => {
  const half = Math.floor(raw.length / 2), l = [...rdp(raw.slice(0, half + 1), 0.75 * R), ...rdp(raw.slice(half), 0.75 * R).slice(1, -1)];
  if (l.length < 3) return '';
  let d = 'M' + f1(l[0][0]) + ' ' + f1(l[0][1]), px = f1(l[0][0]), py = f1(l[0][1]);
  for (let i = 1; i < l.length; i++) { const x = f1(l[i][0]), y = f1(l[i][1]); if (x === px && y === py) continue; d += 'l' + (x - px) + ' ' + (y - py); px = x; py = y; }
  return d.replace(/ -/g, '-') + 'z';
}).join('');

// ---------- маски частей по ручной сцене ----------
const hand = fs.readFileSync(path.join(ROOT, 'src-assets', 'hand-scene.svg'), 'utf8');
const defsHand = hand.slice(hand.indexOf('<defs>'), hand.indexOf('</defs>') + 7);
const groupOf = (id) => {
  const at = hand.indexOf(`id="${id}"`); if (at < 0) throw new Error('нет группы ' + id);
  let i = hand.lastIndexOf('<g', at), depth = 0, j = i;
  const re = /<g[\s>]|<\/g>/g; re.lastIndex = i;
  for (let m; (m = re.exec(hand));) { depth += m[0] === '</g>' ? -1 : 1; if (depth === 0) { j = m.index + 4; break; } }
  return hand.slice(i, j);
};
const raster = async (markup) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="${W}" height="${W}">${defsHand}<style>*{fill:#fff!important;stroke:#fff!important;opacity:1!important}</style><rect width="1254" height="1254" style="fill:#000!important"/>${markup}</svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = data[i * 3] > 127 ? 1 : 0; return m;
};

(async () => {
  const t0 = Date.now();
  const { data: src } = await sharp(path.join(ROOT, 'src-assets', 'goals.png')).resize(W, W).median(+(process.env.MED || 7)).blur(+(process.env.BL || 1.0)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) rgb[i] = src[i];
  // для подвижных частей сглаживание слабее: там важны детали — полосы подошвы, циферблат, лицо
  const { data: srcF } = await sharp(path.join(ROOT, 'src-assets', 'goals.png')).resize(W, W).median(+(process.env.MEDF || 5)).blur(+(process.env.BLF || 0.8)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgbF = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) rgbF[i] = srcF[i];

  // подвижные части: ручные формы как подсказка, точный край — по отличию от достроенного фона
  const PARTS = {
    'goal-bowl': { pad: 18 * R }, 'goal-bottle': { pad: 18 * R }, 'goal-bars': { pad: 14 * R }, 'goal-shoe': { pad: 16 * R }, 'goal-scale': { pad: 16 * R }, 'goal-flag': { pad: 12 * R },
    'r-arm': { pad: 22 * R, runner: 1 }, 'r-head': { pad: 22 * R, runner: 1 }, 'r-body': { pad: 24 * R, runner: 1 }, 'r-front': { pad: 26 * R, runner: 1 }, 'r-back': { pad: 22 * R, runner: 1 },
  };
  for (const [id, p] of Object.entries(PARTS)) { p.core = await raster(groupOf(id)); p.gen = dilate(p.core, p.pad); }
  let anyGen = new Float32Array(N); for (const p of Object.values(PARTS)) anyGen = or(anyGen, p.gen);
  const fill0 = inpaint(rgb, anyGen);
  const diff = new Float32Array(N); for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(rgb[i * 3 + k] - fill0[i * 3 + k])); diff[i] = m; }
  const fgAll = new Float32Array(N);
  for (const [id, p] of Object.entries(PARTS)) {
    let fg = new Float32Array(N); for (let i = 0; i < N; i++) fg[i] = p.gen[i] && (diff[i] > 26) ? 1 : 0;
    fg = or(fg, erode(p.core, 10 * R));
    fg = thr(blur(fg, Math.round(R)), 0.5);
    fg = flood(erode(p.core, 4 * R), or(fg, erode(p.core, 4 * R)));                    // только то, что связано с самой фигурой
    const outside = flood(not(p.gen), not(fg));                                // дыры внутри фигуры — тоже фигура
    fg = and(not(outside), p.gen);
    p.fg = fg;
  }
  // бегун: одна общая фигура, части делят её по ближайшей ручной форме
  let runner = new Float32Array(N); for (const p of Object.values(PARTS)) if (p.runner) runner = or(runner, p.fg);
  const owner = new Int8Array(N).fill(-1), RUN = Object.entries(PARTS).filter(([, p]) => p.runner);
  for (let r = 0; r <= 40 * R && owner.some((o, i) => o < 0 && runner[i]); r += 4 * R) RUN.forEach(([, p], b) => { const g = r ? dilate(p.core, r) : p.core; for (let i = 0; i < N; i++) if (runner[i] && owner[i] < 0 && g[i]) owner[i] = b; });
  RUN.forEach(([, p], b) => { const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = owner[i] === b ? 1 : 0; p.fg = m; });
  for (const p of Object.values(PARTS)) for (let i = 0; i < N; i++) fgAll[i] = Math.max(fgAll[i], p.fg[i]);

  // фон под подвижными частями: достраиваем заново по точной маске (с запасом в 3 px)
  const fill = inpaint(rgb, dilate(fgAll, 3 * R));

  // палитра: k-средних по исходнику
  const sample = []; for (let i = 0; i < N; i += 7) sample.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]);
  let cent = Array.from({ length: K }, (_, k) => sample[Math.floor((k + 0.5) * sample.length / K)].slice());
  sample.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])); cent = Array.from({ length: K }, (_, k) => sample[Math.floor((k + 0.5) * sample.length / K)].slice());
  const nearest = (r, g, b) => { let bi = 0, bd = 1e9; for (let k = 0; k < K; k++) { const c = cent[k], d = (c[0] - r) ** 2 + (c[1] - g) ** 2 * 1.2 + (c[2] - b) ** 2; if (d < bd) { bd = d; bi = k; } } return bi; };
  for (let it = 0; it < 12; it++) {
    const acc = Array.from({ length: K }, () => [0, 0, 0, 0]);
    for (const p of sample) { const k = nearest(...p); acc[k][0] += p[0]; acc[k][1] += p[1]; acc[k][2] += p[2]; acc[k][3]++; }
    cent = cent.map((c, k) => acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : c);
  }
  cent = cent.map((c) => (Math.min(...c) > 238 ? [255, 255, 255] : c));   // почти белое — белое: фон картинки чистый, как в исходнике
  const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const labels = (img) => { const L = new Uint8Array(N); for (let i = 0; i < N; i++) L[i] = nearest(img[i * 3], img[i * 3 + 1], img[i * 3 + 2]); return L; };
  const mode = (L) => { let A = L; for (let pass = 0; pass < 1; pass++) { const B = new Uint8Array(N); const cnt = new Uint16Array(K); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const touched = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(W - 1, Math.max(0, y + dy)), k = A[yy * W + xx]; if (!cnt[k]) touched.push(k); cnt[k]++; } let bk = A[y * W + x], bc = 0; for (const k of touched) { if (cnt[k] > bc) { bc = cnt[k]; bk = k; } cnt[k] = 0; } B[y * W + x] = bk; } A = B; } return A; };
  const Lo = mode(labels(rgbF)), Lf = mode(labels(fill));
  const KC = 12; let coarse = Array.from({ length: KC }, (_, k) => cent[Math.floor((k + 0.5) * K / KC)].slice());
  const nc = (c) => { let bi = 0, bd = 1e9; coarse.forEach((q, k) => { const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = k; } }); return bi; };
  for (let it = 0; it < 10; it++) { const acc = Array.from({ length: KC }, () => [0, 0, 0, 0]); cent.forEach((c) => { const k = nc(c); acc[k][0] += c[0]; acc[k][1] += c[1]; acc[k][2] += c[2]; acc[k][3]++; }); coarse = coarse.map((q, k) => acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : q); }
  const toCoarse = cent.map(nc);

  // слой: каждая цветовая область — путь; большие снизу, мелкие сверху, с небольшим нахлёстом против щелей
  const layer = (L, region) => {
    let x0 = W, y0 = W, x1 = 0, y1 = 0;
    for (let i = 0; i < N; i++) if (region[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 < x0) return '';
    const bbox = [Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(W - 1, x1 + 2), Math.min(W - 1, y1 + 2)];
    const counts = new Array(K).fill(0); for (let i = 0; i < N; i++) if (region[i]) counts[L[i]]++;
    const order = counts.map((c, k) => [c, k]).filter(([c]) => c > 3).sort((a, b) => b[0] - a[0]);
    let out = '';
    const ccount = new Array(KC).fill(0); for (let i = 0; i < N; i++) if (region[i]) ccount[toCoarse[L[i]]]++;
    ccount.map((c, k) => [c, k]).filter(([c]) => c > 3).sort((a, b) => b[0] - a[0]).forEach(([, k]) => {
      const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = region[i] && toCoarse[L[i]] === k ? 1 : 0;
      const d = pathOf(trace(blur(m, 2 * Math.round(R)), 0.12, bbox).filter((l) => Math.abs(area(l)) > 30 * R * R));
      if (d) out += `<path fill="${hex(coarse[k])}" d="${d}"/>`;
    });
    order.forEach(([, k], n) => {
      const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = region[i] && L[i] === k ? 1 : 0;
      const loops = trace(blur(m, Math.round(R)), 0.3, bbox).filter((l) => Math.abs(area(l)) > 8 * R * R);
      const d = pathOf(loops); if (d) out += `<path fill="${hex(cent[k])}" d="${d}"/>`;
    });
    return out;
  };
  const ones = new Float32Array(N).fill(1);
  const bgSvg = layer(Lf, ones);
  const soft = (m) => thr(blur(m, Math.round(R)), 0.35);      // края частей чуть шире: перекрывают шов с фоном
  const parts = {};
  for (const [id, p] of Object.entries(PARTS)) {
    if (id === 'goal-flag') {                                                    // флажок: полотнище отдельно, чтобы полоскалось
      const cloth = new Float32Array(N); for (let i = 0; i < N; i++) { const x = (i % W) * S, y = ((i / W) | 0) * S; cloth[i] = p.fg[i] && x > 955 && y < 165 ? 1 : 0; }
      const rest = and(p.fg, not(cloth));
      parts[id] = layer(Lo, soft(rest)) + `<g class="flag-cloth">${layer(Lo, soft(cloth))}</g>`;
    } else parts[id] = layer(Lo, soft(p.fg));
  }

  // волна проявления: мягкие круги вдоль дороги — от бегуна к флажку, остальное по удалённости
  const ROUTE = [[470, 980], [600, 900], [700, 780], [700, 620], [800, 500], [900, 420], [870, 320], [900, 250], [952, 196]];
  const rl = [0]; for (let i = 1; i < ROUTE.length; i++) rl.push(rl[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
  const tOf = (x, y) => { let best = 1e9, bt = 0; for (let i = 0; i < ROUTE.length - 1; i++) { const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)), d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) { best = d; bt = (rl[i] + Math.sqrt(L) * t) / rl[rl.length - 1]; } } return Math.min(1, bt * 0.92 + best / 2600); };
  let circles = '';
  for (let y = -40; y <= 1300; y += 150) for (let x = -40; x <= 1300; x += 150) circles += `<circle class="bloom-c" cx="${x}" cy="${y}" r="240" data-t="${tOf(x, y).toFixed(3)}" fill="url(#bloom-g)"/>`;
  const goalT = (id) => { const b = PARTS[id].fg; let sx = 0, sy = 0, n = 0; for (let i = 0; i < N; i++) if (b[i]) { sx += (i % W) * S; sy += ((i / W) | 0) * S; n++; } return [tOf(sx / n, sy / n), Math.round(sx / n), Math.round(sy / n)]; };
  const box = (id) => { const b = PARTS[id].fg; let x0 = W, y1 = 0, x1 = 0; for (let i = 0; i < N; i++) if (b[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [Math.round((x0 + x1) / 2 * S), Math.round(y1 * S)]; };
  const G = (id, name, key) => { const [t] = goalT(id), [ox, oy] = box(id); return `<g class="goal" id="goal-${name}" data-name="${name}"${key ? ` data-goal="${key}"` : ''} data-t="${t.toFixed(3)}" data-o="${ox},${oy}">${parts[id]}</g>`; };
  const moonMarkup = groupOf('goal-moon').replace(/data-t="[^"]*"/, 'data-t="0.985"');
  const P = (id, pivot) => `<g class="part" id="${id}" data-p="${pivot}">${parts[id]}</g>`;

  const moonGrad = (defsHand.match(/<linearGradient id="moon"[\s\S]*?<\/linearGradient>/) || [''])[0];
  const head = (cls) => `<svg class="vec ${cls}" viewBox="0 0 1254 1254" width="338" height="338" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  const svg = `${head('vec-bg')}<g id="bg">${bgSvg}</g></svg>
${head('vec-veil')}<defs><radialGradient id="bloom-g"><stop offset=".5" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<mask id="bloom" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1654" height="1654"><rect x="-200" y="-200" width="1654" height="1654" fill="#fff"/>${circles}</mask></defs><rect x="-200" y="-200" width="1654" height="1654" fill="#fff" mask="url(#bloom)"/></svg>
${head('vec-fg')}<defs>${moonGrad}</defs>
<g class="layer" id="goals">${G('goal-scale', 'scale', 'scales')}${G('goal-bars', 'bars', 'fire')}${G('goal-shoe', 'shoe', 'walk')}${G('goal-bottle', 'bottle', 'water')}${G('goal-bowl', 'bowl', 'meal')}${G('goal-flag', 'flag', '')}${moonMarkup}</g>
<g class="layer" id="runner">${P('r-back', '600,640')}${P('r-body', '480,620')}${P('r-front', '470,660')}${P('r-head', '495,425')}${P('r-arm', '372,452')}</g></svg>`;
  fs.writeFileSync(path.join(ROOT, 'assets', 'goals', 'scene.svg'), svg);
  const html = path.join(ROOT, 'index.html');
  let s = fs.readFileSync(html, 'utf8');
  const a = s.indexOf('<!-- scene:start -->'), b = s.indexOf('<!-- scene:end -->');
  if (a >= 0 && b > a) { s = s.slice(0, a + '<!-- scene:start -->'.length) + '\n' + svg + '\n' + s.slice(b); fs.writeFileSync(html, s); }
  // контрольные картинки: маски частей и достроенный фон
  const dbg = Buffer.alloc(N * 3); for (let i = 0; i < N; i++) { const v = fgAll[i]; for (let k = 0; k < 3; k++) dbg[i * 3 + k] = v ? rgb[i * 3 + k] : 255 - (255 - rgb[i * 3 + k]) * 0.25; }
  await sharp(dbg, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(ROOT, '.shots', 'trace-fg.png'));
  const fb = Buffer.alloc(N * 3); for (let i = 0; i < N * 3; i++) fb[i] = Math.max(0, Math.min(255, fill[i]));
  await sharp(fb, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(ROOT, '.shots', 'trace-fill.png'));
  console.log('scene.svg', (svg.length / 1024).toFixed(0) + ' КБ', 'цветов', K, 'за', ((Date.now() - t0) / 1000).toFixed(1) + ' с');
})();
