// Фон профиля под шторкой из выгрузки макета. Сама иллюстрация теперь векторная — см. tools/vector-art.js.
// node tools/goals-art.js  →  assets/goals/bg.webp
const sharp = require('sharp');
const path = require('path');

sharp(path.join(__dirname, '..', 'src-assets', 'goals-figma', 'bg.png')).webp({ quality: 90 })
  .toFile(path.join(__dirname, '..', 'assets', 'goals', 'bg.webp'))
  .then(() => console.log('bg.webp'));
