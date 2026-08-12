import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(root, '../public/product-scan');
const manifestPath = path.join(folder, 'manifest.json');
const imageExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

if (!fs.existsSync(folder)) {
  fs.mkdirSync(folder, { recursive: true });
}

const images = fs
  .readdirSync(folder)
  .filter((file) => imageExt.has(path.extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

fs.writeFileSync(manifestPath, `${JSON.stringify({ images }, null, 2)}\n`);
console.log(`product-scan: ${images.length} image(s) in manifest`);
