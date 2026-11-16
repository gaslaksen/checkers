// Copies the game into www/, the folder Capacitor bundles into the app:
// index.html and every local file it links to, and nothing else — no
// tests, node_modules, ios/ or .claude. The repo root stays the website,
// served as it is by GitHub Pages.
//
//   node scripts/copy-web.js   (npm run build does this)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

// Every src="…" and href="…" in the page that points at a file of ours.
function localFiles(html) {
  const files = new Set(['index.html']);
  for (const [, url] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) continue; // another site, or a link within the page
    files.add(url.split(/[?#]/)[0]);
  }
  return [...files];
}

const files = localFiles(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
for (const file of files) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) throw new Error(`index.html links to ${file}, which doesn't exist`);
  const to = path.join(OUT, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
console.log(`Copied ${files.length} files to www/: ${files.join(', ')}`);
