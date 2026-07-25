# STATUS — Battle polish goal (2026-07-25)

## Complete
- Looping melodic BGM via pure `planBgmRearm` (always ≥1 phrase ahead; 2.5s tick) — no pad-only silence; `simulateBgmLoop` asserts maxGap=0 over 60s/180s
- Distinct SFX: move / melee / bow / magic / summon / hit / ui
- Active unit + tile highlight; zoom min `2.5` (was 5)
- ~4.2s “Battle begins” intro (wide → orbit → focus first actor)
- Per-turn camera focus (center + front-facing)
- Command bar Move/Ability/Wait always visible; ability submenu + Calculator CT 2–6
- Range + AoE preview before confirm (hover tiles)
- MP cost floaters suppressed; cast_resolve shows ability name
- Longer holds; melee swing + hurt; bow projectile; MP-scaled magic spectacle
- Formation: equip-colored weapon mesh (Blood Sword); green/red stat deltas
- Tests: 87 pass; Playwright ×2 “Battle begins” + canvas; `docs/` rebuilt

## Evidence
- Scratch: `npm-test.log`, `playwright-battle.log`, `battle-intro.png`
- Unit: `tests/battle-polish.test.js`

## Next
- Optional: push `docs/` to GitHub Pages for live deploy
