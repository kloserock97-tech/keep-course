// Сцена из слоёв (tools/layers.mjs): подложка, вуаль проявления, цели и бегун по частям.
// node tools/scene-layers.js  →  assets/goals/scene.svg и вставка в index.html между <!-- scene:start --> и <!-- scene:end -->
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-assets', 'layers', 'layers.json'), 'utf8'));
const hand = fs.readFileSync(path.join(ROOT, 'src-assets', 'hand-scene.svg'), 'utf8');
const groupOf = (id) => {
  const at = hand.indexOf(`id="${id}"`); let i = hand.lastIndexOf('<g', at), depth = 0, j = i;
  const re = /<g[\s>]|<\/g>/g; re.lastIndex = i;
  for (let m; (m = re.exec(hand));) { depth += m[0] === '</g>' ? -1 : 1; if (depth === 0) { j = m.index + 4; break; } }
  return hand.slice(i, j);
};

// путь волны проявления: от бегуна вдоль дороги к флажку
const ROUTE = [[470, 980], [600, 900], [700, 780], [700, 620], [800, 500], [900, 420], [870, 320], [900, 250], [952, 196]];
const rl = [0]; for (let i = 1; i < ROUTE.length; i++) rl.push(rl[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
const tOf = (x, y) => { let best = 1e9, bt = 0; for (let i = 0; i < ROUTE.length - 1; i++) { const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) { best = d; bt = (rl[i] + Math.sqrt(l2) * t) / rl[rl.length - 1]; } } return Math.min(1, bt * 0.92 + best / 2600); };
let circles = '';
for (let y = -40; y <= 1300; y += 150) for (let x = -40; x <= 1300; x += 150) circles += `<circle class="bloom-c" cx="${x}" cy="${y}" r="240" data-t="${tOf(x, y).toFixed(3)}" fill="url(#bloom-g)"/>`;

const img = (n) => { const b = L[n]; return `<image href="assets/goals/l-${n}.webp" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`; };
const goal = (name, key, inner) => { const b = L[name]; const t = tOf(b.x + b.w / 2, b.y + b.h / 2); return `<g class="goal" id="goal-${name}" data-name="${name}"${key ? ` data-goal="${key}"` : ''} data-t="${t.toFixed(3)}" data-o="${Math.round(b.x + b.w / 2)},${b.y + b.h}">${inner || img(name)}</g>`; };
const part = (id, pivot) => `<g class="part" id="${id}" data-p="${pivot}">${img(id)}</g>`;
const moonGrad = (hand.match(/<linearGradient id="moon"[\s\S]*?<\/linearGradient>/) || [''])[0];
const head = (cls) => `<svg class="vec ${cls}" viewBox="0 0 1254 1254" width="338" height="338" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;

const svg = `${head('vec-bg')}<g id="bg"><image href="assets/goals/plate.webp" width="1254" height="1254"/></g></svg>
${head('vec-veil')}<defs><radialGradient id="bloom-g"><stop offset=".5" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<mask id="bloom" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1654" height="1654"><rect x="-200" y="-200" width="1654" height="1654" fill="#fff"/>${circles}</mask></defs><rect x="-200" y="-200" width="1654" height="1654" fill="#fff" mask="url(#bloom)"/></svg>
${head('vec-fg')}<defs>${moonGrad}</defs>
<g class="layer" id="goals">${goal('scale', 'scales')}${goal('bars', 'fire')}${goal('shoe', 'walk')}${goal('bottle', 'water')}${goal('bowl', 'meal')}${goal('flag', '', img('flag') + `<g class="flag-cloth">${img('flag-cloth')}</g>`)}${groupOf('goal-moon').replace(/data-t="[^"]*"/, 'data-t="0.985"')}</g>
<g class="layer" id="runner">${part('r-back', '600,640')}${part('r-body', '480,620')}${part('r-front', '470,660')}${part('r-head', '495,425')}${part('r-arm', '372,452')}</g></svg>`;

fs.writeFileSync(path.join(ROOT, 'assets', 'goals', 'scene.svg'), svg);
const html = path.join(ROOT, 'index.html');
let s = fs.readFileSync(html, 'utf8');
const a = s.indexOf('<!-- scene:start -->'), b = s.indexOf('<!-- scene:end -->');
s = s.slice(0, a + '<!-- scene:start -->'.length) + '\n' + svg + '\n' + s.slice(b);
fs.writeFileSync(html, s);
console.log('сцена из слоёв:', Object.keys(L).length, 'слоёв');
