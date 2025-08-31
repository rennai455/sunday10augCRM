const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const cssFile = path.join(distDir, 'main.css');

if (!fs.existsSync(cssFile)) {
  console.error('dist/main.css not found');
  process.exit(1);
}

const cssContent = fs.readFileSync(cssFile);
const hash = crypto.createHash('md5').update(cssContent).digest('hex').slice(0, 10);
const hashedName = `main.${hash}.css`;
const hashedPath = path.join(distDir, hashedName);
fs.copyFileSync(cssFile, hashedPath);

const publicDir = path.join(__dirname, '..', 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(/dist\/main\.css/g, `dist/${hashedName}`);
  fs.writeFileSync(filePath, html);
});

console.log(`Hashed CSS generated: dist/${hashedName}`);
