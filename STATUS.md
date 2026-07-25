# STATUS — Mobile / FX / BGM goal (2026-07-25)

## Shipped
- Fixed right `battle-action-chrome` (Move/Ability/Wait + Wait/Face) always on-screen
- Auto Wait/Face after Act (`shouldAutoOpenWaitFace`)
- Turn focus zoom `4.2` (was 6.5; still > ZOOM_MIN 2.5)
- KO ash path strengthened; presentation queue + busy depth (no late teleport)
- Target-directed spell/summon creatures + residual/shake when arena-wide
- Formation sticky chip pickers (job/weapon/armor/acc) without scrolling
- Long multi-section BGM (~28s) with early/mid/late intensity from battle progress

## Evidence
- 100 tests green → scratch `npm-test.log`
- Playwright ×2 mobile 390×844 → `mobile-battle-chrome.png`, `playwright-battle.log`, `playwright-mobile.log`
- `docs/` rebuilt; pushed to GitHub Pages

## Tests
- `tests/mobile-polish.test.js`, existing `battle-polish.test.js`
