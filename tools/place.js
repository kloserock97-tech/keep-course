// Переносит координаты слоёв из assets/art/*.json в разметку index.html.
// Запускать после нарезки: node tools/cut.js && node tools/cut-held.js && node tools/place.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'assets/art/layers.json'));
const H = require(path.join(ROOT, 'assets/art/held.json'));
const file = path.join(ROOT, process.argv[2] || 'hand.html');   // по умолчанию — вариант с рукой, где участвуют все слои
let s = fs.readFileSync(file, 'utf8');
const box = (o) => `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px`;
const css = (o) => `left: ${o.x}px; top: ${o.y}px; width: ${o.w}px; height: ${o.h}px;`;

const byImage = { ...L, 'token-held': H.token, glow: H.glow, fingertip: H.fingertip, thumb: H.thumb };
delete byImage.held; delete byImage.hand; delete byImage['ring-4']; delete byImage['ring-4-lit'];
let n = 0;
for (const [name, o] of Object.entries(byImage)) {
  const re = new RegExp(`(<div class="l[^"]*" style=")left:[^;]+;top:[^;]+;width:[^;]+;height:[^;"]+((?:;[^"]*)?"><img[^>]*src="assets/art/${name}\\.webp")`);
  if (!re.test(s)) { console.log('пропущен слой:', name); continue; }
  s = s.replace(re, (_, a, b) => { n++; return a + box(o) + b; });
}

// рука и четвёртая галочка заданы в стилях
const rule = (sel, o) => {
  const re = new RegExp(`(\\${sel} \\{ )left: [^;]+; top: [^;]+; width: [^;]+; height: [^;]+;`);
  if (!re.test(s)) { console.log('пропущено правило:', sel); return; }
  s = s.replace(re, (_, a) => { n++; return a + css(o); });
};
rule('.hand', L.hand);
// кольцо 4: обёртка по «освещённому» слою, чистое кольцо внутри со сдвигом
const lit = L['ring-4-lit'], ring = L['ring-4'];
rule('.ring-4', lit);
rule('.ring-4 .clean', { x: +(ring.x - lit.x).toFixed(2), y: +(ring.y - lit.y).toFixed(2), w: ring.w, h: ring.h });
// галочка 4 — копия третьей, центр в центре кольца
const P = 1.56 * 0.25, t3 = L['token-3'], c3 = [517 * P, 625 * P], rc = [688 * P, 605 * P];
rule('.token-4', { x: +(rc[0] - (c3[0] - t3.x)).toFixed(2), y: +(rc[1] - (c3[1] - t3.y)).toFixed(2), w: t3.w, h: t3.h });
// путь руки от покоя до кольца
const move = `translate(${(rc[0] - H.cx).toFixed(2)}px, ${(rc[1] - H.cy).toFixed(2)}px)`;
const reMove = /(\.art\[data-state="placing"\] \.hand-move \{ opacity: 1; transform: )translate\([^)]*\)/;
if (reMove.test(s)) s = s.replace(reMove, (_, a) => { n++; return a + move; });

fs.writeFileSync(file, s);
console.log('обновлено мест:', n);
