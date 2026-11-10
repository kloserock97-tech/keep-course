const sharp = require('sharp');
const L = require('../assets/art/layers.json'), Hd = require('../assets/art/held.json');
(async () => {
  const S = 3, at = (o) => ({ left: Math.round(o.x * S), top: Math.round(o.y * S) });
  const mk = async (layers, file) => {
    const b = await sharp({ create: { width: 390 * S, height: 381 * S, channels: 3, background: '#fff' } }).composite(layers).png().toBuffer();
    await sharp(b).extract({ left: 480, top: 300, width: 420, height: 420 }).resize(840).toFile(file);
  };
  const A = 'assets/art/';
  await mk([{ input: A + 'ring-4.webp', ...at(L['ring-4']) }, { input: A + 'glow.webp', ...at(Hd.glow) }, { input: A + 'hand.webp', ...at(L.hand) }, { input: A + 'fingertip.webp', ...at(Hd.fingertip) }, { input: A + 'token-held.webp', ...at(Hd.token) }, { input: A + 'thumb.webp', ...at(Hd.thumb) }], '.shots/held-a.png');
  await mk([{ input: A + 'hand.webp', ...at(L.hand) }, { input: A + 'fingertip.webp', ...at(Hd.fingertip) }], '.shots/held-b.png');
  const o = await sharp('src-assets/illustration.png').resize(1170).toBuffer();
  await sharp(o).extract({ left: 480, top: 300, width: 420, height: 420 }).resize(840).toFile('.shots/held-o.png');
})();
