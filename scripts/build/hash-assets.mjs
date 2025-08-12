import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const distDir = path.join(rootDir, 'dist');
const cssFile = path.join(distDir, 'main.css');

async function fingerprint() {
  const css = await fs.readFile(cssFile);
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 8);
  const hashedName = `main.${hash}.css`;
  await fs.rename(cssFile, path.join(distDir, hashedName));

  const htmlFiles = [
    path.join(rootDir, 'dashboard.html'),
    path.join(rootDir, 'public', 'dashboard.html')
  ];

  await Promise.all(htmlFiles.map(async (file) => {
    try {
      let content = await fs.readFile(file, 'utf8');
      content = content.replace(/dist\/main\.css/g, `dist/${hashedName}`);
      await fs.writeFile(file, content);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }));
}

fingerprint().catch((err) => {
  console.error(err);
  process.exit(1);
});
