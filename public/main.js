/**
 * Browser entry — Final Fantasy Knockoff
 */
import { GameApp, getBrand } from '/src/client/game-app.js';

function boot() {
  if (location.protocol === 'file:') {
    document.getElementById('root').innerHTML = `
      <div style="font-family:system-ui;padding:2rem;max-width:40rem">
        <h1>Final Fantasy Knockoff</h1>
        <p>Open this game through the server, not as a raw file.</p>
        <pre>cd final-fantasy-knockoff && npm install && npm start</pre>
        <p>Then visit <code>http://localhost:8787</code></p>
      </div>`;
    return;
  }

  const root = document.getElementById('root');
  const app = new GameApp({ root });
  window.FFK = { app, brand: getBrand(), version: '1.0.0' };
  document.title = getBrand();
}

boot();
