const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cssPath = path.join(__dirname, '..', 'public', 'dist', 'main.css');
if (!fs.existsSync(cssPath)) {
  process.exit(0);
}
const css = fs.readFileSync(cssPath);
const hash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 8);
const hashedName = `main.${hash}.css`;
const hashedPath = path.join(path.dirname(cssPath), hashedName);
fs.writeFileSync(hashedPath, css);

const htmlDir = path.join(__dirname, '..', 'public');
for (const file of fs.readdirSync(htmlDir)) {
  if (file.endsWith('.html')) {
    const filePath = path.join(htmlDir, file);
    let contents = fs.readFileSync(filePath, 'utf8');
    contents = contents.replace(/dist\/main\.css/g, `dist/${hashedName}`);
    fs.writeFileSync(filePath, contents);
  }
}
