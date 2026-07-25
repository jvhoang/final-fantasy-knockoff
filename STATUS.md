# STATUS — Slow presentation + maps + bottom panel + materia theme

## Done
- **Slow sequential battle:** 650ms/walk step, 450ms event gaps, long cast/attack holds (exported in `presentation-timing.js`)
- **AI + player:** `playEventsSinceCursor` one event at a time (no batch teleport)
- **Bottom unit panel** under arena with portrait + full stats; actions on right rail
- **24 random FFT-inspired maps** (`maps-pool.js`)
- **Ash KO** dissolve particles
- **Sticky loadout top** (3D preview + attributes); gear scrolls below
- **Distinct item icons** (blood vs diamond swords, etc.)
- **Materia/lifestream theme** background + teal/violet UI chrome

## Tests
**68/68 pass**

## Run
```bash
cd final-fantasy-knockoff && npm install && npm start
```
