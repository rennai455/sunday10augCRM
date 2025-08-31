const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const cssFile = path.join(distDir, 'main.css');
if (!fs.existsSync(cssFile)) {
  process.exit(0);
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(cssFile)).digest('hex').slice(0,8);
const hashedName = `main.${hash}.css`;
fs.copyFileSync(cssFile, path.join(distDir, hashedName));

const publicDir = path.join(__dirname, '..', 'public');
for (const file of fs.readdirSync(publicDir)) {
  if (file.endsWith('.html')) {
    const fullPath = path.join(publicDir, file);
    let html = fs.readFileSync(fullPath, 'utf8');
    html = html.replace(/main\.css/g, hashedName);
    fs.writeFileSync(fullPath, html);
  }
}
