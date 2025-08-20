const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
const cssFile = path.join(distDir, 'main.css');

if (!fs.existsSync(cssFile)) {
  console.error(`CSS file not found: ${cssFile}`);
  process.exit(1);
}

const css = fs.readFileSync(cssFile);
const hash = crypto.createHash('md5').update(css).digest('hex').slice(0, 10);
const hashedName = `main.${hash}.css`;
const hashedPath = path.join(distDir, hashedName);

fs.renameSync(cssFile, hashedPath);

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, callback);
    } else if (entry.isFile()) {
      callback(full);
    }
  }
}

walk(path.join(__dirname, '..'), file => {
  if (file.endsWith('.html')) {
    let html = fs.readFileSync(file, 'utf8');
    const updated = html.replace(/dist\/main\.css/g, `dist/${hashedName}`);
    if (updated !== html) {
      fs.writeFileSync(file, updated);
    }
  }
});

console.log(`Hashed CSS generated: dist/${hashedName}`);
