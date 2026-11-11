// Векторная перерисовка иллюстрации «Путь к цели» по композиции исходника (src-assets/goals.png).
// Координаты — в пикселях исходника 1254 × 1254, на экране картинка 338 × 338 pt.
// node tools/vector-art.js  →  assets/goals/scene.svg и вставка в index.html между <!-- scene:start --> и <!-- scene:end -->
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- геометрия ----------
const f = (n) => +n.toFixed(1);
// гладкий контур через точки (Катмулл — Ром → кубические Безье)
const smooth = (pts, closed = true, k = 0.5) => {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3], c2 = [p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
};
const sampleSpline = (pts, steps) => {
  const out = [], n = pts.length, P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let s = 0; s < n - 1; s++) for (let j = 0; j < steps; j++) {
    const t = j / steps, p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2), t2 = t * t, t3 = t2 * t;
    out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
  }
  out.push(pts[n - 1]);
  return out;
};
const poly = (pts) => 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
const ell = (cx, cy, rx, ry, rot = 0, attrs = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''} ${attrs}/>`;

// ---------- палитра ----------
// Акцент — на целях: фон, дорога и земля приглушены, бегун спокойного синего, цели насыщенные.
const C = {
  ink: '#1d2f86',
  run: ['#86a3f4', '#4f77ea', '#2f55d2'],          // бегун: свет, середина, тень
  hair: ['#4d6fe6', '#2140bf'],
  shirt: ['#ffffff', '#d7e2fb'],
  sole: ['#2a49c9', '#1b3299'],
};
const defs = [];
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => { defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`); return `url(#${id})`; };
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) => { defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`); return `url(#${id})`; };

// ---------- фон: мягкие пятна, растворяются к краям ----------
const blob = (id, c, cx, cy, rx, ry, rot = 0, edge = 0.9) => `<g class="bg-blob" data-c="${cx},${cy}">${ell(cx, cy, rx, ry, rot, `fill="${rad('b-' + id, [[0, c], [edge * 0.7, c, 0.95], [1, c, 0]])}"`)}</g>`;
const bg = [
  blob('sun', '#fdf0bf', 780, 115, 105, 100),
  blob('petal', '#c7d8fa', 300, 255, 175, 95, 38),
  blob('lgreen', '#e3f1cc', 445, 235, 95, 85),
  blob('lyellow', '#fbeec6', 140, 395, 120, 105),
  blob('rblue', '#dbe6fb', 1150, 225, 90, 120),
  blob('lgreen2', '#dcefc7', 120, 650, 150, 130),
  blob('lwhite', '#e3ecfc', 245, 735, 135, 110),
  blob('lblue', '#d3e1fa', 135, 860, 120, 105),
  blob('rorange', '#fcdcc3', 1185, 735, 85, 165),
  blob('bblue', '#d9e5fb', 990, 1010, 175, 120),
  blob('byellow', '#fbefc8', 840, 1100, 110, 85),
  blob('bgreen', '#dff0cb', 700, 880, 95, 75),
  blob('rblue2', '#dbe6fb', 1205, 470, 60, 95),
].join('');
const hills = [
  blob('m1', '#dfe9fb', 760, 420, 230, 120, -8, 1),
  blob('m2', '#e2f1d4', 980, 600, 260, 130, 0, 1),
  blob('m3', '#dde8fb', 600, 600, 140, 120, 0, 1),
  blob('m4', '#e3eefc', 330, 840, 220, 120, 0, 1),
  blob('m5', '#e5f2d8', 470, 380, 90, 80, 0, 1),
  blob('m6', '#fdf3d4', 1100, 330, 110, 90, 0, 1),
  blob('m7', '#dfe9fb', 860, 860, 200, 110, 0, 1),
].join('');

// ---------- дорога: лента от бегуна к флажку, разбита на участки для прорисовки ----------
const ROAD = [[790, 905], [720, 810], [660, 690], [690, 560], [790, 485], [890, 445], [905, 385], [850, 330], [845, 280], [905, 255], [975, 240], [985, 212], [952, 196]];
const line = sampleSpline(ROAD, 24);
const lens = [0]; for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
const LEN = lens[lens.length - 1];
const width = (t) => 128 * Math.pow(1 - t, 1.25) + 12;                 // перспектива: у бегуна широкая, у флажка узкая
const wall = (t) => 34 * Math.pow(1 - t, 1.3) + 5;
const SECTIONS = 9;
const road = [], roadTop = [];
lin('road-top', [[0, '#ffffff'], [1, '#eef3fe']], 0, 0, 1, 0);
lin('road-wall', [[0, '#7fa0ee'], [1, '#4f78e2']]);
for (let s = 0; s < SECTIONS; s++) {
  const t0 = s / SECTIONS, t1 = (s + 1) / SECTIONS, a = Math.max(0, t0 - 0.012), b = Math.min(1, t1 + 0.012);
  const idx = line.map((p, i) => i).filter((i) => lens[i] / LEN >= a - 1e-6 && lens[i] / LEN <= b + 1e-6);
  const L = [], R = [], WL = [], WR = [], mid = [];
  idx.forEach((i, j) => {
    const p = line[i], q = line[Math.min(line.length - 1, i + 1)], o = line[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const t = lens[i] / LEN, w = width(t) / 2, h = wall(t);
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
    WL.push([p[0] - dy * w, p[1] + dx * w + h]); WR.push([p[0] + dy * w, p[1] - dx * w + h]);
    mid.push(p);
  });
  const edges = `M${L.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}M${R.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}`;
  const top = poly([...L, ...R.reverse()]), side = poly([...WL, ...WR.reverse()]);
  const maskW = Math.ceil(Math.max(...idx.map((i) => width(lens[i] / LEN))) + 2 * wall(t0) + 14);
  road.push(`<g class="road-sec" data-t0="${t0.toFixed(3)}" data-t1="${t1.toFixed(3)}" mask="url(#rm${s})"><path d="${side}" fill="url(#road-wall)"/></g>`);
  roadTop.push(`<g class="road-sec" data-t0="${t0.toFixed(3)}" data-t1="${t1.toFixed(3)}" mask="url(#rm${s})"><path d="${top}" fill="url(#road-top)"/><path d="${edges}" fill="none" stroke="#bcd0f7" stroke-width="3" stroke-linejoin="round"/></g>`);
  defs.push(`<mask id="rm${s}" maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254"><path class="road-reveal" d="${smooth(mid, false)}" fill="none" stroke="#fff" stroke-width="${maskW}" stroke-linecap="round"/></mask>`);
}
const tAt = (x, y) => { let best = 0, bd = 1e9; line.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = lens[i] / LEN; } }); return +best.toFixed(3); };

// стрелка на дороге у ног бегуна
const arrow = `<path d="M610 1080L750 984L900 1092L866 1104L750 1024L644 1094Z" fill="#ffffff" opacity=".6"/>`;

// ---------- платформы под целями (приглушены) ----------
const plat = [
  `<g class="plat" data-t="${tAt(740, 330)}">${ell(712, 330, 158, 52, -4, `fill="${lin('p-orange', [[0, '#ffd8b5'], [1, '#ffc9a0']])}"`)}${ell(712, 322, 150, 40, -4, 'fill="#ffe7d0"')}</g>`,
  `<g class="plat" data-t="${tAt(1000, 470)}"><path d="M845 478C845 455 1155 455 1155 478L1150 545C1150 565 850 565 850 545Z" fill="${lin('p-bottle', [[0, '#c9daf7'], [1, '#e6eefc']])}"/>${ell(1000, 476, 155, 32, 0, 'fill="#e1f0d3"')}</g>`,
  `<g class="plat" data-t="${tAt(985, 750)}"><path d="M790 752C790 720 1180 720 1180 752L1172 880C1172 905 798 905 798 880Z" fill="${lin('p-shoe', [[0, '#bfe4a4'], [1, '#d9efc7']])}"/>${ell(985, 750, 195, 44, 0, 'fill="#e2f3d2"')}</g>`,
  `<g class="plat" data-t="1">${ell(952, 204, 72, 22, 0, 'fill="#dff0cd"')}</g>`,
].join('');

// ---------- цели (насыщенные) ----------
const goal = (name, goalKey, t, origin, body) => `<g class="goal" id="goal-${name}" data-name="${name}"${goalKey ? ` data-goal="${goalKey}"` : ''} data-t="${t}" data-o="${origin}">${body}</g>`;
const bowl = goal('bowl', 'meal', tAt(735, 300), '735,300', [
  ell(662, 178, 20, 42, -22, `fill="${lin('leaf1', [[0, '#5fd36d'], [1, '#1f9a46']])}"`),
  ell(700, 150, 22, 50, -6, 'fill="url(#leaf1)"'),
  ell(738, 148, 19, 44, 12, 'fill="url(#leaf1)"'),
  `<circle cx="770" cy="196" r="40" fill="${lin('tomato', [[0, '#ff7a52'], [1, '#e8402a']])}"/>`,
  ...[[688, 222], [708, 210], [728, 205], [750, 210], [772, 222], [794, 232], [700, 236], [722, 228], [744, 232], [766, 240], [786, 248], [716, 248], [740, 252]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${rad('corn', [[0, '#ffe07a'], [1, '#f7a91f']], 0.4, 0.35, 0.65)}"/>`),
  ell(812, 192, 19, 46, 42, 'fill="url(#leaf1)"'),
  ell(836, 232, 15, 36, 62, `fill="${lin('leaf2', [[0, '#3fbd5c'], [1, '#13814a']])}"`),
  `<path d="M636 212C680 220 780 245 838 262C826 300 790 318 735 314C680 310 646 270 636 212Z" fill="${lin('bowl', [[0, '#ffffff'], [0.45, '#e9effd'], [1, '#9fb8f4']], 0, 0, 0.3, 1)}"/>`,
  `<path d="M636 212C680 220 780 245 838 262C780 252 690 232 636 212Z" fill="#ffffff"/>`,
  `<path d="M616 194l14 12M606 222l14 0M832 150l-10 14M846 168l-14 6" stroke="#ff9a3c" stroke-width="7" stroke-linecap="round"/>`,
].join(''));
const bottle = goal('bottle', 'water', tAt(1040, 420), '1040,500', [
  `<path d="M1040 300C1060 296 1090 302 1104 316L1112 338C1132 352 1146 400 1146 450L1142 500L936 500C930 460 950 380 990 346L1030 330Z" fill="${lin('bottle', [[0, '#bfe6ff'], [0.5, '#7cc4ff'], [1, '#4b97f5']])}"/>`,
  `<path d="M1000 352C1060 340 1110 350 1128 372L1132 392C1100 372 1050 370 996 382Z" fill="#a8dcff" opacity=".8"/>`,
  `<g transform="rotate(22 1086 286)"><rect x="1052" y="262" width="68" height="40" rx="10" fill="${lin('cap', [[0, '#3c64f0'], [1, '#1b3cc6']])}"/><rect x="1056" y="298" width="60" height="12" rx="5" fill="#a9d8ff"/></g>`,
  `<path d="M1030 382C1046 410 1060 428 1060 446C1060 466 1046 478 1030 478C1014 478 1000 466 1000 446C1000 428 1014 410 1030 382Z" fill="#ffffff" opacity=".92"/>`,
  `<path d="M1160 320C1180 330 1188 360 1170 392C1150 384 1140 352 1160 320Z" fill="#5aa8ff"/>`,
  `<path d="M1206 404C1210 422 1196 438 1172 436C1176 418 1190 404 1206 404Z" fill="#5aa8ff"/>`,
].join(''));
const bars = goal('bars', 'fire', tAt(910, 650), '912,730', [
  `<rect x="862" y="628" width="24" height="102" rx="6" fill="${lin('bar', [[0, '#e6f04f'], [1, '#17ad7a']])}"/>`,
  `<rect x="892" y="598" width="30" height="132" rx="7" fill="url(#bar)"/>`,
  `<rect x="928" y="566" width="36" height="164" rx="8" fill="url(#bar)"/>`,
].join(''));
const shoe = goal('shoe', 'walk', tAt(1000, 690), '1000,745', [
  `<path d="M904 742C930 742 990 738 1040 712C1080 690 1100 664 1106 634L1096 618C1086 650 1050 690 990 716C960 728 930 732 908 730Z" fill="${lin('ssole', [[0, '#3b6df2'], [1, '#1d3fc6']])}"/>`,
  `<path d="M896 728C900 708 930 690 968 668C998 650 1024 620 1052 604C1070 594 1090 600 1096 618C1090 650 1060 684 1010 708C970 726 930 734 904 734Z" fill="${lin('supper', [[0, '#ffffff'], [1, '#d6e2fb']])}"/>`,
  `<path d="M960 676l12 -8M976 664l12 -8M992 652l12 -8M1008 640l12 -8" stroke="#8fb0f4" stroke-width="6" stroke-linecap="round"/>`,
  `<path d="M1030 650C1050 640 1070 640 1080 650" stroke="#4f7cf2" stroke-width="8" fill="none" stroke-linecap="round"/>`,
].join(''));
const scale = goal('scale', 'scales', 0.03, '120,545', [
  `<g transform="rotate(-12 120 480)">`,
  `<rect x="28" y="410" width="190" height="150" rx="26" fill="${lin('sbody', [[0, '#3c69ee'], [1, '#2449c8']])}"/>`,
  `<rect x="44" y="404" width="184" height="142" rx="24" fill="${lin('stop', [[0, '#ffffff'], [1, '#e1e9fc']])}"/>`,
  `<path d="M96 470A62 62 0 0 1 220 470L190 492A32 32 0 0 0 126 492Z" fill="#2b6cfc"/>`,
  `<path d="M104 470A54 54 0 0 1 212 470L186 488A28 28 0 0 0 130 488Z" fill="#e9f0ff"/>`,
  ...[-64, -40, -16, 8, 32, 56].map((a) => `<line x1="158" y1="472" x2="158" y2="430" stroke="#2b6cfc" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 30 12 100" transform="rotate(${a} 158 486)"/>`),
  `<line x1="158" y1="486" x2="140" y2="452" stroke="#ff5a3c" stroke-width="7" stroke-linecap="round"/>`,
  `<circle cx="158" cy="486" r="11" fill="#1d3fc6"/>`,
  `</g>`,
].join(''));
const flag = goal('flag', '', 1, '952,200', [
  `<g class="flag-cloth"><path d="M954 122C972 112 990 130 1012 120L1014 158C994 168 974 150 956 158Z" fill="${lin('flag', [[0, '#5584ff'], [1, '#2b5ce8']], 0, 0, 1, 0)}"/></g>`,
  `<rect x="948" y="116" width="8" height="84" rx="4" fill="#1d2f86"/>`,
  ell(952, 199, 16, 6, 0, 'fill="#2b5ce8"'),
  `<g class="rays" stroke="#3a6cf5" stroke-width="7" stroke-linecap="round"><line x1="1002" y1="98" x2="1012" y2="76"/><line x1="1018" y1="110" x2="1042" y2="92"/><line x1="1024" y1="126" x2="1052" y2="124"/></g>`,
].join(''));
const moon = goal('moon', 'sleep', 1, '1160,170', `<path d="M1176 132A40 40 0 1 0 1198 196A32 32 0 1 1 1176 132Z" fill="${lin('moon', [[0, '#ffe680'], [1, '#ffb93a']])}"/>`);

// ---------- земля у ног бегуна ----------
const ground = `<g id="ground" data-c="760,1100"><path d="M-40 1300L-40 1095C120 1010 300 960 440 935C590 905 720 892 840 910C980 932 1090 990 1170 1070L1300 1300Z" fill="${lin('ground', [[0, '#cfdcfa'], [0.35, '#a9bff4'], [1, '#7f9eec']])}"/>${ell(820, 990, 260, 60, -6, `fill="${rad('gl', [[0, '#ffffff', 0.55], [1, '#ffffff', 0]])}"`)}${arrow}</g>`;

// ---------- бегун: части на своих осях ----------
lin('limb', [[0, C.run[0]], [0.55, C.run[1]], [1, C.run[2]]], 0, 0, 1, 1);
lin('limb2', [[0, C.run[1]], [1, C.run[2]]]);
const part = (id, pivot, body) => `<g class="part" id="r-${id}" data-p="${pivot}">${body}</g>`;
const back = part('back', '600,640', [
  `<path d="${smooth([[560, 630], [625, 608], [662, 700], [676, 790], [676, 826], [628, 840], [578, 832], [560, 780], [570, 700]])}" fill="url(#limb2)"/>`,
  `<path d="${smooth([[586, 826], [632, 828], [640, 860], [600, 866]])}" fill="${C.run[0]}"/>`,
  `<path d="${smooth([[576, 860], [618, 846], [668, 868], [702, 890], [700, 914], [640, 920], [580, 918], [570, 890]])}" fill="${lin('bshoe', [[0, '#ffffff'], [1, '#cfdcfa']])}"/>`,
  `<path d="M578 912C620 918 670 916 700 908" stroke="#9db6f2" stroke-width="7" fill="none" stroke-linecap="round"/>`,
].join(''));
const body = part('body', '480,620', [
  `<path d="${smooth([[574, 516], [626, 520], [640, 572], [612, 596], [580, 580]])}" fill="url(#limb2)"/>`,                     // рука за спиной
  `<path d="${smooth([[372, 560], [430, 530], [520, 528], [610, 560], [640, 610], [620, 668], [540, 690], [450, 690], [380, 660], [356, 610]])}" fill="${lin('pants', [[0, '#5d84ee'], [1, C.run[2]]])}"/>`,
  `<path d="M486 560C482 600 488 640 500 680" stroke="#2448c4" stroke-width="6" fill="none" stroke-linecap="round" opacity=".55"/>`,
  `<path d="${smooth([[364, 438], [410, 414], [480, 406], [548, 410], [596, 424], [622, 458], [632, 510], [628, 552], [596, 560], [540, 540], [470, 536], [408, 548], [384, 520], [370, 482]])}" fill="${lin('shirt', [[0, C.shirt[0]], [0.6, '#f1f5ff'], [1, C.shirt[1]]])}"/>`,
  `<path d="M392 540C450 524 540 526 600 554" stroke="#c4d3f8" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>`,
].join(''));
const head = part('head', '495,425', [
  `<path d="${smooth([[488, 412], [530, 412], [536, 440], [496, 446]])}" fill="${C.run[2]}"/>`,
  `<path d="${smooth([[500, 344], [534, 346], [554, 368], [560, 398], [552, 422], [528, 430], [500, 420]])}" fill="${lin('face', [[0, '#8aa6f6'], [1, C.run[1]]], 0, 0, 1, 1)}"/>`,
  `<circle cx="540" cy="400" r="8" fill="#ff8fa0" opacity=".85"/>`,
  ...[[488, 316, 30], [524, 328, 20], [456, 326, 28], [428, 356, 32], [424, 392, 26], [452, 404, 30], [484, 388, 30], [462, 364, 30], [498, 352, 24]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${rad('hair', [[0, C.hair[0]], [1, C.hair[1]]], 0.38, 0.32, 0.7)}"/>`),
  `<path d="${smooth([[506, 382], [520, 378], [526, 396], [512, 404]])}" fill="#5c7fee"/>`,
].join(''));
const arm = part('arm', '372,452', [
  `<path d="M378 452L318 488L302 552" fill="none" stroke="url(#limb)" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>`,
  `<path d="${smooth([[268, 578], [330, 576], [338, 612], [326, 644], [294, 650], [266, 634], [260, 604]])}" fill="${C.run[1]}"/>`,
  `<path d="M282 618C292 614 304 616 312 622M276 636C288 632 300 634 308 640" stroke="${C.run[2]}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>`,
  `<rect x="270" y="552" width="62" height="20" rx="6" fill="${C.ink}"/>`,
].join(''));
const front = part('front', '470,660', [
  `<path d="M500 690L420 800" stroke="${lin('thigh', [[0, '#6c8ff2'], [0.55, C.run[1]], [1, C.run[2]]], 0, 0, 1, 1)}" stroke-width="150" stroke-linecap="round" fill="none"/>`,
  ell(410, 836, 74, 50, -36, `fill="${C.run[2]}"`),
  ell(404, 846, 50, 32, -36, `fill="${C.run[0]}"`),
  // кроссовок: верх и огромная подошва к камере
  `<path d="${smooth([[250, 802], [330, 790], [404, 832], [470, 930], [520, 1046], [532, 1108], [506, 1134], [470, 1064], [418, 962], [356, 882], [296, 836]])}" fill="${lin('fshoe', [[0, '#ffffff'], [1, '#d3defa']])}"/>`,
  `<path d="${smooth([[92, 846], [156, 812], [262, 800], [340, 820], [390, 900], [470, 1040], [506, 1116], [480, 1166], [394, 1180], [282, 1150], [172, 1062], [92, 958], [74, 896]])}" fill="${lin('sole', [[0, '#3c66ee'], [1, C.sole[0]]], 0, 0, 1, 1)}"/>`,
  `<path d="${smooth([[112, 860], [164, 832], [256, 822], [326, 840], [372, 910], [448, 1040], [478, 1110], [460, 1148], [392, 1158], [290, 1132], [190, 1050], [116, 956], [100, 902]])}" fill="${lin('sole2', [[0, C.sole[0]], [1, C.sole[1]]], 0, 0, 1, 1)}"/>`,
  `<g stroke="#2f55d8" stroke-width="12" stroke-linecap="round" opacity=".75">${[[130, 900, 330, 880], [140, 945, 365, 932], [160, 990, 395, 985], [185, 1035, 425, 1038], [215, 1078, 448, 1088], [250, 1116, 462, 1132]].map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join('')}</g>`,
].join(''));

const svg = `<svg class="vec" viewBox="0 0 1254 1254" width="338" height="338" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>${defs.join('')}</defs>
<g class="world">
<g class="layer" id="bg">${bg}${hills}</g>
<g class="layer" id="road">${road.join('')}${roadTop.join('')}</g>
<g class="layer" id="plats">${plat}</g>
<g class="layer" id="goals">${scale}${bars}${shoe}${bottle}${bowl}${flag}${moon}</g>
${ground}
<g class="layer" id="runner">${back}${body}${front}${head}${arm}</g>
</g>
</svg>`;

fs.writeFileSync(path.join(ROOT, 'assets', 'goals', 'scene.svg'), svg);
const html = path.join(ROOT, 'index.html');
let s = fs.readFileSync(html, 'utf8');
const a = s.indexOf('<!-- scene:start -->'), b = s.indexOf('<!-- scene:end -->');
if (a >= 0 && b > a) { s = s.slice(0, a + '<!-- scene:start -->'.length) + '\n' + svg + '\n' + s.slice(b); fs.writeFileSync(html, s); console.log('index.html обновлён'); }
console.log('scene.svg', (svg.length / 1024).toFixed(1) + ' КБ', 'длина дороги', Math.round(LEN));
