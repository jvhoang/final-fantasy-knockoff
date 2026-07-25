# Final Fantasy Knockoff

Browser-playable **4v4** FFT-style **Charge Time (CT)** tactical battle arena — castle, river, bridges, multi-height map. Fight **vs AI** or **online** vs a human who joins by room code.

**Not affiliated with Square Enix.** Original/parody job names and procedural audio only — no commercial game assets.

## Stack decision

**Best web stack wins:** ES modules + **Three.js** (isometric 3D) + **Node** HTTP/WebSocket server.

See [docs/STACK_DECISION.md](docs/STACK_DECISION.md).

## Requirements

- Node.js 18+

## Install

```bash
cd final-fantasy-knockoff
npm install
```

## Run (client + multiplayer server)

```bash
npm start
```

Open **http://localhost:8787**

This serves:

- Static web client (`public/`)
- Game logic modules (`/src/...`)
- WebSocket multiplayer + REST room helpers

## Tests

```bash
npm test
```

Uses Node’s built-in test runner against shipped CT, grid, loadout, AI, and multiplayer modules.

## Deploy — GitHub Pages

Static build (vs AI works in the browser; multiplayer needs a separate Node host):

```bash
npm install
npm run build:pages   # writes docs/ with base /final-fantasy-knockoff/
```

1. Push this repo to GitHub (e.g. `jvhoang/final-fantasy-knockoff`).
2. **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** · folder: **`/docs`**
3. Site: **https://jvhoang.github.io/final-fantasy-knockoff/**

Local server with multiplayer:

```bash
npm start              # http://localhost:8787
PORT=8080 npm start    # optional port
```

## How to play

1. **Formation (Gil Shop)** — **12,000 gil**/team. Sticky **top** 3D preview + attributes (always visible); gear/skills scroll below. Distinct item icons (e.g. Blood Sword vs Diamond Sword).
2. **vs AI / Online** — Each battle picks a **random map** from **20+** FFT-inspired arenas.
3. **Battle (slow sequential)**
   - Allies **and AI** walk tile-by-tile (~650ms/step) with gaps between actions — not batch teleports.
   - Attacks show wind-up then **target** hit; CT magic has long cast pose then resolve spectacle on the charge clock.
   - **Bottom panel** under the arena shows the **active** (or selected) unit: portrait, name, ally/foe, HP/MP, stats, gear. **Right rail** = Move / Ability / Wait, CT list, log.
   - KO turns the body to **ash**. Floaters: red −HP, green +HP, white −MP.
4. **Camera** — Drag orbit · Shift pan · scroll/pinch zoom.

### Water (FFT-like fords)
Shallow **2 Move**, deep **3 Move** (Jump ≥ 2), bridges **1 Move**.

### Jobs
Squire, Knight, Archer, Black/White Mage, Thief, Monk, Time Mage, Summoner, Ninja, Samurai, Dancer, Calculator, Geomancer, Orator, Lancer, Chemist, Mystic — original homage names, deep skill lists.

Win by KOing all 4 foes. CT: Move+Act −100, partial −80, Wait −60.

## Project layout

```
final-fantasy-knockoff/
  docs/STACK_DECISION.md
  public/           # index.html, main.js, styles
  src/core/         # CT, grid, combat, match, loadout, AI
  src/content/      # jobs, abilities, items, castle map
  src/client/       # Three.js arena, UI, audio
  src/net/          # protocol, rooms, server
  tests/
```

## Legal

Homage / knockoff title only. Do not add ripped Square Enix models, music, or trademarks as logos.
