// Жетон в руке, его свечение и кончик указательного пальца — отдельными слоями.
// В исходной картинке жетон лежит перед указательным пальцем и за большим:
// чтобы руку можно было увести, палец за жетоном дорисовывается, а жетон под большим пальцем достраивается.
// node tools/cut-held.js  →  assets/art/{token-held,glow,fingertip}.webp + held.json
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src-assets', 'illustration.png');
const OUT = path.join(__dirname, '..', 'assets', 'art');
const DISPLAY = 0.25, EXPORT = 0.75;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const isToken = ([r, g, b]) => r > 180 && b - g > -6;
  const isHand = ([r, , b]) => b - r > 60 && r < 180;

  // 1. круг жетона: центр и радиус сняты по лучам от центра до границы «жетон → свечение»
  const c = [959, 695], R = 111.3;
  const Rt = R - 1;

  const save = async (name, x0, y0, w, h, fn) => {
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fn(x0 + x, y0 + y); if (!v) continue;
      const o = (y * w + x) * 4; out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; out[o + 3] = Math.round(v[3] * 255);
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).resize(Math.round(w * EXPORT)).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(OUT, name + '.webp'));
    return { x: +(x0 * DISPLAY).toFixed(2), y: +(y0 * DISPLAY).toFixed(2), w: +(w * DISPLAY).toFixed(2), h: +(h * DISPLAY).toFixed(2) };
  };

  // 2. жетон: видимая часть как есть, часть под большим пальцем — зеркально от центра
  let mean = [0, 0, 0], n = 0;
  for (let y = c[1] - Rt; y < c[1] + Rt; y += 3) for (let x = c[0] - Rt; x < c[0] + Rt; x += 3) {
    if (Math.hypot(x - c[0], y - c[1]) < Rt - 4) { const p = px(x, y); if (isToken(p)) { mean = mean.map((v, i) => v + p[i]); n++; } }
  }
  mean = mean.map((v) => v / n);
  const tb = Math.ceil(Rt) + 2, tx0 = Math.round(c[0]) - tb, ty0 = Math.round(c[1]) - tb;
  const token = await save('token-held', tx0, ty0, tb * 2, tb * 2, (x, y) => {
    const d = Math.hypot(x - c[0], y - c[1]); if (d > Rt + 1) return null;
    let p = px(x, y);
    if (!isToken(p) || d > Rt - 2.5) {
      const q = px(2 * c[0] - x, 2 * c[1] - y);
      p = isToken(q) && d < Rt - 2.5 ? q : (isToken(p) ? p : mean);
    }
    return [...p, 1 - smooth(Rt - 1.2, Rt + 0.6, d)];
  });

  // 3. свечение: только зелёное, без руки, кольца и самого жетона
  const gb = Math.ceil(R * 1.8), gx0 = Math.round(c[0]) - gb, gy0 = Math.round(c[1]) - gb;
  const glowAt = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const [r, g, b] = px(x, y);
    const a = 1 - Math.min(r, g, b) / 255, w = smooth(-14, 4, g - b);
    if (a * w < 0.01) return null;
    const un = (v) => Math.max(0, Math.min(255, Math.round((v - (1 - a) * 255) / a)));
    return [un(r), un(g), un(b), a * w];
  };
  const glow = await save('glow', gx0, gy0, gb * 2, gb * 2, (x, y) => {
    const dx = x - c[0], dy = y - c[1], d = Math.hypot(dx, dy);
    if (d > gb) return null;
    const v = d < R + 3 ? glowAt(c[0] + (dx / (d || 1)) * (R + 5), c[1] + (dy / (d || 1)) * (R + 5)) : glowAt(x, y);
    if (!v) return null;
    v[3] *= 1 - smooth(R * 1.62, R * 1.8, d);
    return v;
  });

  // 4. кончик указательного пальца, который в картинке спрятан за жетоном.
  // Ось и ширина пальца сняты с картинки чуть выше места, где его перекрывает жетон.
  const dn = Math.hypot(0.48, 0.88), dir = [0.48 / dn, 0.88 / dn], perp = [dir[1], -dir[0]];
  const mid = [966 + perp[0] * 15.5, 587 + perp[1] * 15.5], RAD = 43;
  const A = [mid[0] - dir[0] * 70, mid[1] - dir[1] * 70], B = [mid[0] + dir[0] * 16, mid[1] + dir[1] * 16];
  const tube = (x, y) => {
    const k = Math.max(0, Math.min(1, ((x - A[0]) * (B[0] - A[0]) + (y - A[1]) * (B[1] - A[1])) / ((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2)));
    return Math.hypot(x - A[0] - k * (B[0] - A[0]), y - A[1] - k * (B[1] - A[1]));
  };
  const fx0 = Math.round(mid[0] - 90), fy0 = Math.round(mid[1] - 70);
  const finger = await save('fingertip', fx0, fy0, 180, 170, (x, y) => {
    const t = (x - mid[0]) * dir[0] + (y - mid[1]) * dir[1], dist = tube(x, y);
    if (t < -40 || dist > RAD) return null;
    const own = isHand(px(x, y)), inDisk = Math.hypot(x - c[0], y - c[1]) < R + 1;
    if (!own && !inDisk) return null;                       // снаружи жетона рисуем только там, где палец и так был
    let back = own && t < -6 ? 0 : Math.max(12, 2 * t + 12), p, qx, qy;
    for (let i = 0; i < 14; i++, back += 5) { qx = x - dir[0] * back; qy = y - dir[1] * back; p = px(qx, qy); if (isHand(p) && isHand(px(qx - dir[0] * 6, qy - dir[1] * 6))) break; }
    if (!isHand(p)) return null;
    let acc = [0, 0, 0], cnt = 0;                           // гладкий цвет вместо зеркального зерна
    for (let j = -4; j <= 4; j += 2) for (let i2 = -4; i2 <= 4; i2 += 2) { const q = px(qx + i2, qy + j); if (isHand(q)) { acc = acc.map((v, k2) => v + q[k2]); cnt++; } }
    p = acc.map((v) => v / cnt);
    const grain = ((Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) - 0.5) * 12;
    const shade = 1 - 0.1 * smooth(0, 60, t);
    return [...p.map((v) => Math.max(0, Math.min(255, (v + grain) * shade))), (1 - smooth(RAD - 2.5, RAD, dist)) * smooth(-40, -30, t)];
  });

  // 5. большой палец: всё от руки, что в картинке лежит поверх жетона
  const hb = Math.ceil(R) + 12, hx0 = Math.round(c[0]) - hb, hy0 = Math.round(c[1]) - hb;
  const thumb = await save('thumb', hx0, hy0, hb * 2, hb * 2, (x, y) => {
    const d = Math.hypot(x - c[0], y - c[1]); if (d > R + 10) return null;
    const t = (x - mid[0]) * dir[0] + (y - mid[1]) * dir[1];
    if (tube(x, y) < RAD + 4 && t > -40) return null;       // это указательный, он за жетоном
    const [r, g, b2] = px(x, y);
    const al = 1 - Math.min(r, g, b2) / 255, a2 = Math.min(1, al * (1 + 0.6 * smooth(0.3, 0.62, al)));
    const m = smooth(12, 42, b2 - g) * (1 - smooth(158, 186, r)) * (1 - smooth(R + 4, R + 10, d));
    if (a2 * m < 0.01) return null;
    const un = (v) => Math.max(0, Math.min(255, Math.round((v - (1 - a2) * 255) / a2)));
    return [un(r), un(g), un(b2), a2 * m];
  });

  const held = { token, glow, fingertip: finger, thumb, cx: +(c[0] * DISPLAY).toFixed(2), cy: +(c[1] * DISPLAY).toFixed(2), r: +(R * DISPLAY).toFixed(2) };
  fs.writeFileSync(path.join(OUT, 'held.json'), JSON.stringify(held, null, 1));
  console.log(JSON.stringify(held));
})();
