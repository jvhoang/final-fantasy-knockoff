/**
 * Build static site into docs/ for GitHub Pages.
 * Usage: node scripts/build-pages.mjs [basePath]
 * basePath default: /final-fantasy-knockoff/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const BASE = process.argv[2] || '/final-fantasy-knockoff/';
const base = BASE.endsWith('/') ? BASE : BASE + '/';

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}
function copyDir(src, dest) {
  mkdirp(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(OUT);
mkdirp(OUT);
mkdirp(path.join(OUT, 'vendor'));
mkdirp(path.join(OUT, 'src'));

// public assets (except index which we rewrite)
copyDir(path.join(ROOT, 'public'), OUT);

// game source modules
copyDir(path.join(ROOT, 'src'), path.join(OUT, 'src'));

// vendor three
const threeSrc = path.join(ROOT, 'node_modules/three/build/three.module.js');
if (!fs.existsSync(threeSrc)) {
  console.error('Missing three.module.js — run npm install first');
  process.exit(1);
}
fs.copyFileSync(threeSrc, path.join(OUT, 'vendor/three.module.js'));

// Rewrite index.html for Pages base path + CDN/vendor three
const index = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Final Fantasy Knockoff</title>
    <base href="${base}" />
    <link rel="stylesheet" href="styles.css" />
    <script type="importmap">
      {
        "imports": {
          "three": "vendor/three.module.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <noscript>
      <p>Final Fantasy Knockoff requires JavaScript.</p>
    </noscript>
    <script type="module" src="main.js"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), index);

// main.js relative imports
const main = `/**
 * Browser entry — Final Fantasy Knockoff (GitHub Pages static)
 */
import { GameApp, getBrand } from './src/client/game-app.js';

function boot() {
  if (location.protocol === 'file:') {
    document.getElementById('root').innerHTML = \`
      <div style="font-family:system-ui;padding:2rem;max-width:40rem">
        <h1>Final Fantasy Knockoff</h1>
        <p>This build is for GitHub Pages / a static web server.</p>
      </div>\`;
    return;
  }
  const root = document.getElementById('root');
  const app = new GameApp({ root });
  window.FFK = { app, brand: getBrand(), version: '1.0.0', pages: true };
  document.title = getBrand();
}
boot();
`;
fs.writeFileSync(path.join(OUT, 'main.js'), main);

// Fix CSS absolute asset path
let css = fs.readFileSync(path.join(OUT, 'styles.css'), 'utf8');
css = css.replace(/url\(['"]?\/assets\//g, "url('assets/");
css = css.replace(/url\(['"]?\/assets\//g, "url('assets/");
// also handle url('/assets/...')
css = css.replace(/url\(\/assets\//g, 'url(assets/');
fs.writeFileSync(path.join(OUT, 'styles.css'), css);

// .nojekyll so underscore paths work
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`Built GitHub Pages site → docs/ (base href=${base})`);
console.log('Enable Pages: Settings → Pages → Deploy from branch main /docs');
