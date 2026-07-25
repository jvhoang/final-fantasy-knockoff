/**
 * Browser entry — Final Fantasy Knockoff (GitHub Pages static)
 */
import { GameApp, getBrand } from './src/client/game-app.js';

function boot() {
  if (location.protocol === 'file:') {
    document.getElementById('root').innerHTML = `
      <div style="font-family:system-ui;padding:2rem;max-width:40rem">
        <h1>Final Fantasy Knockoff</h1>
        <p>This build is for GitHub Pages / a static web server.</p>
      </div>`;
    return;
  }
  const root = document.getElementById('root');
  const app = new GameApp({ root });
  window.FFK = { app, brand: getBrand(), version: '1.0.0', pages: true };
  document.title = getBrand();
}
boot();
