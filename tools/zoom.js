// Крупный план зоны: макет / код / разница. node tools/zoom.js x y w h [имя]  (в pt первого экрана)
const sharp = require('sharp');
const [x, y, w, h, name = 'zoom'] = process.argv.slice(2);
(async () => {
  const cr = { left: x * 3, top: y * 3, width: w * 3, height: h * 3 };
  const a = await sharp('.shots/f3-s1.png').extract(cr).toBuffer(), b = await sharp('.shots/m3-s1.png').extract(cr).toBuffer();
  const big = await sharp('.shots/diff-s1.png').resize(1179).toBuffer();
  const d = await sharp(big).extract(cr).toBuffer();
  const sheet = await sharp({ create: { width: cr.width * 3, height: cr.height, channels: 3, background: '#fff' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: cr.width, top: 0 }, { input: d, left: cr.width * 2, top: 0 }]).png().toBuffer();
  await sharp(sheet).resize({ width: Math.min(1950, cr.width * 3) }).toFile(`.shots/${name}.png`);
})();
