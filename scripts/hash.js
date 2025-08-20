const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cssPath = path.join(__dirname, '..', 'dist', 'main.css');
if (fs.existsSync(cssPath)) {
  const data = fs.readFileSync(cssPath);
  const hash = crypto.createHash('md5').update(data).digest('hex').slice(0, 8);
  const outPath = path.join(__dirname, '..', 'dist', `main.${hash}.css`);
  fs.writeFileSync(outPath, data);
  console.log(`Hashed CSS written to ${outPath}`);
} else {
  console.warn('CSS file not found for hashing');
}
