/**
 * Final Fantasy Knockoff client: gil shop formation, inspect, wait-face, walk+VFX presentation.
 */
import {
  createMatch,
  applyAction,
  getUnit,
  getMoveRange,
  getUnitInspect,
} from '../core/match.js';
import { playEnemyTurns } from '../core/ai.js';
import {
  defaultPlayerLoadouts,
  defaultEnemyLoadouts,
  JOBS,
  previewLoadout,
  equipOptionsForJob,
  validatePartyBudget,
  TEAM_GIL_BUDGET,
} from '../core/loadout.js';
import { ABILITIES, getAbility, formatAbilityDetail } from '../content/abilities.js';
import { previewRangeAndAoe } from '../core/range-preview.js';
import { computeStatDeltas, formatStatDelta } from '../core/stat-delta.js';
import { TEAMS } from '../core/constants.js';
import { WATER_RULES } from '../content/map-castle.js';
import { resolveIcon, portraitIcon } from '../content/icons.js';
import { itemIconUrl } from '../content/items.js';
import {
  CALCULATOR_CT_NUMBERS,
  isMathAbility,
  listCalculatorCtNumbers,
} from '../content/calculator.js';
import { ArenaRenderer } from './arena.js';
import { BattlePresentation } from './battle-presentation.js';
import { WALK_MS_PER_STEP, BATTLE_INTRO_MS } from './presentation-timing.js';
import { audio } from './audio.js';
import {
  TURN_FOCUS_ZOOM,
  shouldAutoOpenWaitFace,
  uiModeAfterSuccessfulAct,
  shouldShowActionChrome,
} from './battle-ui.js';
import { teamLabelForViewer } from '../core/team-label.js';
import { MSG } from '../net/protocol.js';
import { MultiplayerClient } from '../net/mp-client.js';
import { resolveMultiplayerEndpoint } from '../net/ws-config.js';
import { buildUnitMesh } from './unit-mesh.js';
import * as THREE from 'three';

const STORAGE_KEY = 'ffk-last-loadout';

export class GameApp {
  /** @param {{ root: HTMLElement }} opts */
  constructor(opts) {
    this.root = opts.root;
    this.mode = 'menu';
    this.match = null;
    this.loadouts = loadLastLoadout() || defaultPlayerLoadouts();
    this.selectedUnitIdx = 0;
    this.uiMode = 'idle';
    this.selectedAbility = null;
    this.arena = null;
    this.pres = null;
    this.difficulty = 'normal';
    this.ws = null;
    /** @type {MultiplayerClient|null} */
    this.mp = null;
    this.clientId = null;
    this.room = null;
    this.onlineTeam = 'player';
    this._mpTransport = null;
    this.inspectId = null;
    this._waitFacing = 'N';
    this._mathCtNumber = 3;
    this._statDeltaFlash = null;
    this._prevLoadoutStats = null;
    this._lastFocusedTurnId = null;
    this._hoverAoeTile = null;
    /** Pending act target awaiting confirm button */
    this._pendingActTarget = null;
    this._buildShell();
  }

  /** Local viewer team for Ally/Foe labels */
  _viewerTeam() {
    if (this.match?.mode === 'online') return this.onlineTeam || TEAMS.PLAYER;
    return TEAMS.PLAYER;
  }

  _buildShell() {
    this.root.innerHTML = `
      <div id="ffk-app" class="ffk">
        <header class="ffk-header">
          <h1 id="ffk-brand">Final Fantasy Knockoff</h1>
          <p class="tag">PS1 Tactics · CT · Gil Formation · 4v4</p>
        </header>
        <div id="ffk-screens"></div>
        <div id="ffk-toast" class="toast hidden"></div>
      </div>
    `;
    this.screens = this.root.querySelector('#ffk-screens');
    this.showMenu();
  }

  toast(msg) {
    const el = this.root.querySelector('#ffk-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  showMenu() {
    this.mode = 'menu';
    this.screens.innerHTML = `
      <section class="panel menu-panel fft-panel materia-panel">
        <h2>Main Menu</h2>
        <button type="button" id="btn-vs-ai" class="btn primary">vs AI Battle</button>
        <button type="button" id="btn-online" class="btn">Online Multiplayer</button>
        <button type="button" id="btn-loadout" class="btn">Formation (Gil Shop)</button>
        <p class="hint">Budget ${TEAM_GIL_BUDGET} gil · Slow sequential battle · 20+ random maps</p>
        <p class="hint water-hint">${escapeHtml(WATER_RULES.description)}</p>
      </section>
    `;
    this.screens.querySelector('#btn-vs-ai').onclick = () => this.showLoadoutThen('ai');
    this.screens.querySelector('#btn-online').onclick = () => this.showOnline();
    this.screens.querySelector('#btn-loadout').onclick = () => this.showLoadoutThen('menu');
  }

  showLoadoutThen(next) {
    this.mode = 'loadout';
    this._loadoutNext = next;
    this.renderLoadout();
  }

  renderLoadout() {
    const slot = this.loadouts[this.selectedUnitIdx];
    const preview = previewLoadout(slot);
    const opts = equipOptionsForJob(slot.jobId);
    const budget = validatePartyBudget(this.loadouts);
    const s = preview.stats;

    const jobOpts = Object.values(JOBS)
      .map((j) => `<option value="${j.id}" ${j.id === slot.jobId ? 'selected' : ''}>${escapeHtml(j.name)}</option>`)
      .join('');
    const secOpts =
      `<option value="">(none)</option>` +
      Object.values(JOBS)
        .map((j) => `<option value="${j.id}" ${j.id === slot.secondaryJobId ? 'selected' : ''}>${escapeHtml(j.name)}</option>`)
        .join('');
    const wOpts = opts.weapons
      .map((w) => `<option value="${w.id}" ${w.id === slot.weaponId ? 'selected' : ''}>${escapeHtml(w.name)} — ${w.gilCost}g · ATK ${w.atk}</option>`)
      .join('');
    const aOpts = opts.armor
      .map((a) => `<option value="${a.id}" ${a.id === slot.armorId ? 'selected' : ''}>${escapeHtml(a.name)} — ${a.gilCost}g · Def ${a.def}</option>`)
      .join('');
    const xOpts = opts.accessories
      .map((a) => `<option value="${a.id}" ${a.id === (slot.accessoryId || 'none') ? 'selected' : ''}>${escapeHtml(a.name)} — ${a.gilCost}g</option>`)
      .join('');

    const skillCards = preview.abilities
      .map(
        (ab) => `
      <div class="skill-card" data-ability="${ab.id}">
        <div class="skill-name">${escapeHtml(ab.name)} <span class="skill-kind">${escapeHtml(ab.kind)}</span></div>
        <div class="skill-summary">${escapeHtml(ab.summary)}</div>
        <div class="skill-desc">${escapeHtml(ab.description)}</div>
      </div>`
      )
      .join('');

    // Gear chip pickers stay in sticky header (Job is meta select above)
    const wepChips = opts.weapons
      .map(
        (w) =>
          `<button type="button" class="chip ${w.id === slot.weaponId ? 'active' : ''}" data-field="wep" data-id="${w.id}" title="${w.gilCost}g">${escapeHtml(w.name)} <small>${w.atk}</small></button>`
      )
      .join('');
    const armChips = opts.armor
      .map(
        (a) =>
          `<button type="button" class="chip ${a.id === slot.armorId ? 'active' : ''}" data-field="arm" data-id="${a.id}" title="${a.gilCost}g">${escapeHtml(a.name)}</button>`
      )
      .join('');
    const accChips = opts.accessories
      .map(
        (a) =>
          `<button type="button" class="chip ${a.id === (slot.accessoryId || 'none') ? 'active' : ''}" data-field="acc" data-id="${a.id}">${escapeHtml(a.name)}</button>`
      )
      .join('');

    this.screens.innerHTML = `
      <section class="panel loadout-panel wide fft-panel loadout-sticky-layout loadout-noscroll" id="loadout-screen">
        <div class="loadout-sticky-top" id="loadout-sticky-top">
          <h2>Formation — Gil Shop</h2>
          <div class="gil-bar ${budget.ok ? '' : 'over'}" id="gil-bar">
            <strong>Party Gil:</strong>
            <span id="gil-spent">${budget.spent}</span> / <span id="gil-budget">${budget.budget}</span>
            · Remaining <span id="gil-remain">${budget.remaining}</span>
            ${budget.ok ? '' : '<em class="err"> OVER BUDGET</em>'}
          </div>
          <div class="unit-tabs">
            ${this.loadouts
              .map((l, i) => {
                const c = previewLoadout(l).gilCost;
                return `<button type="button" class="tab ${i === this.selectedUnitIdx ? 'active' : ''}" data-i="${i}">${i + 1}. ${escapeHtml(l.name)} <small>${c}g</small></button>`;
              })
              .join('')}
          </div>
          <!-- Meta row: Name / Gender / Job / 2nd — Job like Secondary (not gear chips) -->
          <div class="chip-row meta-row loadout-meta-row" id="loadout-meta-row">
            <label class="inline-field">Name <input id="lo-name" value="${escapeHtml(slot.name)}" /></label>
            <label class="inline-field">Gender
              <select id="lo-gender">
                <option value="m" ${slot.gender !== 'f' ? 'selected' : ''}>M</option>
                <option value="f" ${slot.gender === 'f' ? 'selected' : ''}>F</option>
              </select>
            </label>
            <label class="inline-field">Job
              <select id="lo-job">${jobOpts}</select>
            </label>
            <label class="inline-field">2nd
              <select id="lo-sec">${secOpts}</select>
            </label>
          </div>
          <!-- Gear chips only: Weapon / Armor / Acc -->
          <div class="loadout-chip-pickers" id="loadout-chip-pickers">
            <div class="chip-row">
              <span class="chip-label">Weapon</span>
              <div class="chip-scroll" id="chips-wep">${wepChips}</div>
            </div>
            <div class="chip-row">
              <span class="chip-label">Armor</span>
              <div class="chip-scroll" id="chips-arm">${armChips}</div>
            </div>
            <div class="chip-row">
              <span class="chip-label">Acc</span>
              <div class="chip-scroll" id="chips-acc">${accChips}</div>
            </div>
            <!-- Hidden selects kept for chip → select wiring -->
            <select id="lo-wep" class="sr-only" aria-hidden="true">${wOpts}</select>
            <select id="lo-arm" class="sr-only" aria-hidden="true">${aOpts}</select>
            <select id="lo-acc" class="sr-only" aria-hidden="true">${xOpts}</select>
            <div class="row loadout-actions-sticky">
              <button type="button" id="lo-save" class="btn primary">Save</button>
              <button type="button" id="lo-done" class="btn" ${budget.ok ? '' : 'disabled'}>${
                this._loadoutNext === 'ai' ? 'Start vs AI' : this._loadoutNext === 'online' ? 'Continue Online' : 'Back'
              }</button>
            </div>
          </div>
          <div class="loadout-sticky-preview-row">
            <div id="loadout-preview" class="loadout-preview" aria-label="Character preview"></div>
            <div class="loadout-stats" id="loadout-stats">
              <h3>Attributes · ${escapeHtml(preview.name)}</h3>
              <table class="stat-table">
                <tr><td>HP</td><td id="st-hp">${s.hp}${deltaSpan(this._statDeltaFlash, 'hp')}</td><td>MP</td><td id="st-mp">${s.mp}${deltaSpan(this._statDeltaFlash, 'mp')}</td></tr>
                <tr><td>Speed</td><td id="st-speed">${s.speed}${deltaSpan(this._statDeltaFlash, 'speed')}</td><td>Move</td><td id="st-move">${s.move}${deltaSpan(this._statDeltaFlash, 'move')}</td></tr>
                <tr><td>Jump</td><td id="st-jump">${s.jump}${deltaSpan(this._statDeltaFlash, 'jump')}</td><td>Def</td><td id="st-def">${s.def}${deltaSpan(this._statDeltaFlash, 'def')}</td></tr>
                <tr><td>PA</td><td id="st-pa">${s.pa}${deltaSpan(this._statDeltaFlash, 'pa')}</td><td>MA</td><td id="st-ma">${s.ma}${deltaSpan(this._statDeltaFlash, 'ma')}</td></tr>
                <tr><td>Wpn ATK</td><td id="st-watk">${s.weaponAtk}${deltaSpan(this._statDeltaFlash, 'weaponAtk')}</td><td>Wpn Rng</td><td id="st-wrng">${escapeHtml(s.weaponRange)}</td></tr>
              </table>
              <p class="hint">Kit: ${escapeHtml(preview.visual.silhouette)} · ${escapeHtml(preview.weapon?.name || '')} · <strong id="unit-gil">${preview.gilCost}g</strong></p>
            </div>
          </div>
        </div>

        <div class="loadout-scroll-body">
          <p class="job-desc">${escapeHtml(preview.jobDescription)}</p>
          <p class="eq-desc">${escapeHtml(preview.equipmentNotes.weapon)} · ${escapeHtml(preview.equipmentNotes.armor)}</p>
          <div class="skill-panel" id="skill-panel">
            <h3>Skills &amp; Magic (${preview.abilities.length})</h3>
            <div class="skill-list">${skillCards}</div>
          </div>
        </div>
      </section>
    `;

    this._mountLoadoutPreview(preview);
    // Clear flash after brief display
    if (this._statDeltaFlash) {
      clearTimeout(this._deltaFlashT);
      this._deltaFlashT = setTimeout(() => {
        this._statDeltaFlash = null;
        // Soft re-render without wiping form focus if still on loadout
        const cells = this.screens.querySelectorAll('.stat-delta');
        cells.forEach((c) => c.remove());
      }, 2800);
    }

    const refresh = () => {
      const before = previewLoadout(this.loadouts[this.selectedUnitIdx]).stats;
      this._commitLoadoutForm();
      const after = previewLoadout(this.loadouts[this.selectedUnitIdx]).stats;
      const deltas = computeStatDeltas(before, after);
      this._statDeltaFlash = deltas.length ? Object.fromEntries(deltas.map((d) => [d.key, d.delta])) : null;
      this.renderLoadout();
    };
    this.screens.querySelectorAll('.tab').forEach((btn) => {
      btn.onclick = () => {
        this._commitLoadoutForm();
        this.selectedUnitIdx = Number(btn.dataset.i);
        this._statDeltaFlash = null;
        this.renderLoadout();
      };
    });
    ['lo-job', 'lo-sec', 'lo-wep', 'lo-arm', 'lo-acc', 'lo-gender'].forEach((id) => {
      this.screens.querySelector('#' + id)?.addEventListener('change', refresh);
    });
    // Gear chip pickers (weapon/armor/acc only — Job is meta select)
    this.screens.querySelectorAll('.chip[data-field]').forEach((btn) => {
      btn.onclick = () => {
        const field = btn.getAttribute('data-field');
        const id = btn.getAttribute('data-id');
        const map = { wep: 'lo-wep', arm: 'lo-arm', acc: 'lo-acc' };
        const sel = this.screens.querySelector('#' + map[field]);
        if (sel) {
          sel.value = id;
          sel.dispatchEvent(new Event('change'));
        }
        audio.sfx('select');
      };
    });
    this.screens.querySelector('#lo-save').onclick = () => {
      this._commitLoadoutForm();
      const b = validatePartyBudget(this.loadouts);
      if (!b.ok) {
        this.toast(b.error);
        this.renderLoadout();
        return;
      }
      saveLastLoadout(this.loadouts);
      this.toast('Formation saved (loadout-only, local)');
      audio.sfx('ui');
    };
    this.screens.querySelector('#lo-done').onclick = () => {
      this._commitLoadoutForm();
      const b = validatePartyBudget(this.loadouts);
      if (!b.ok) {
        this.toast(b.error);
        this.renderLoadout();
        return;
      }
      saveLastLoadout(this.loadouts);
      if (this._loadoutNext === 'ai') this.startAiBattle();
      else if (this._loadoutNext === 'online') this.showOnline();
      else this.showMenu();
    };
  }

  _mountLoadoutPreview(preview) {
    const host = this.screens.querySelector('#loadout-preview');
    if (!host) return;
    // Mini three.js preview matching battle kit
    const w = 200;
    const h = 220;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(1);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xfff0dd, 0.9);
    dir.position.set(2, 4, 3);
    scene.add(dir);
    const cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 20);
    cam.position.set(1.4, 1.4, 2.2);
    cam.lookAt(0, 0.6, 0);
    const fakeUnit = {
      id: 'preview',
      jobId: preview.jobId,
      weaponId: preview.weapon?.id || 'sword',
      armorId: preview.armor?.id || 'leather',
      gender: preview.visual.gender || 'm',
      team: 'player',
    };
    const mesh = buildUnitMesh(fakeUnit, 'player');
    scene.add(mesh);
    let t = 0;
    const loop = () => {
      if (!host.isConnected) return;
      t += 0.02;
      mesh.rotation.y = t;
      renderer.render(scene, cam);
      requestAnimationFrame(loop);
    };
    loop();
    this._previewRenderer = renderer;
  }

  _commitLoadoutForm() {
    const i = this.selectedUnitIdx;
    if (!this.screens.querySelector('#lo-name')) return;
    let weaponId = this.screens.querySelector('#lo-wep').value;
    let armorId = this.screens.querySelector('#lo-arm').value;
    const jobId = this.screens.querySelector('#lo-job').value;
    // Ensure equip still valid for job
    const opts = equipOptionsForJob(jobId);
    if (!opts.weapons.find((w) => w.id === weaponId)) weaponId = opts.weapons[0]?.id || 'sword';
    if (!opts.armor.find((a) => a.id === armorId)) armorId = opts.armor[0]?.id || 'cloth';
    this.loadouts[i] = {
      name: this.screens.querySelector('#lo-name').value || `Unit ${i + 1}`,
      jobId,
      secondaryJobId: this.screens.querySelector('#lo-sec').value || null,
      weaponId,
      armorId,
      accessoryId: this.screens.querySelector('#lo-acc').value,
      gender: this.screens.querySelector('#lo-gender')?.value || 'm',
    };
  }

  async startAiBattle() {
    audio.ensure();
    audio.startBgm();
    try {
      this.match = createMatch({
        mode: 'ai',
        playerLoadouts: this.loadouts,
        enemyLoadouts: defaultEnemyLoadouts(),
      });
    } catch (e) {
      this.toast(String(e.message || e));
      return;
    }
    this.mode = 'battle';
    this._lastFocusedTurnId = null;
    this.renderBattle();
    // Battle begins intro: wide shot + banner, then zoom to first actor
    await this._playBattleBeginsIntro();
    // Snapshot units at spawn positions, then AI may move — walk those paths
    this.pres?.resetEvents(this.match);
    playEnemyTurns(this.match, this.difficulty);
    // Sequential walks + cast resolve (cursor claimed inside playEventsSinceCursor)
    if (this.pres) {
      await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
    }
    this.refreshBattle();
  }

  /**
   * ~4s "Battle begins" with arena wide view, then zoom/autorotate to first actor.
   */
  async _playBattleBeginsIntro() {
    if (!this.arena || !this.match) return;
    const banner = this.screens.querySelector('#battle-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.textContent = 'Battle begins';
      banner.classList.add('intro');
    }
    const first = getUnit(this.match, this.match.activeUnitId) || this.match.units.find((u) => u.alive);
    const facing = first?.facing || 'S';
    try {
      await this.arena.playBattleIntro(
        this.match.map,
        first?.id || this.match.units[0]?.id,
        facing,
        BATTLE_INTRO_MS
      );
    } catch {
      /* camera optional in headless */
    }
    if (banner && this.match.phase === 'battle') {
      banner.classList.add('hidden');
      banner.classList.remove('intro');
      banner.textContent = '';
    }
    if (first) {
      this.arena.setActiveHighlight(first.id, this.match.map, { x: first.x, y: first.y });
      this._lastFocusedTurnId = first.id;
    }
  }

  renderBattle() {
    this.screens.innerHTML = `
      <section class="battle-layout battle-layout-v2">
        <div class="battle-main">
          <div class="map-title" id="map-title"></div>
          <div class="arena-wrap">
            <div id="arena-host" class="arena-host"></div>
            <div id="float-layer" class="float-layer"></div>
            <div id="battle-banner" class="battle-banner hidden"></div>
            <div id="cast-name-banner" class="cast-name-banner" aria-live="polite"></div>
            <!-- Fixed right chrome: always visible on mobile without scroll -->
            <div id="battle-action-chrome" class="battle-action-chrome" aria-label="Battle actions">
              <div id="hud-actions" class="hud-block actions chrome-actions"></div>
              <div id="hud-wait-face" class="hud-block chrome-wait-face hidden"></div>
            </div>
          </div>
          <div id="bottom-unit-panel" class="bottom-unit-panel" aria-label="Unit status">
            <em>Active / selected unit status appears here</em>
          </div>
        </div>
        <aside class="hud action-rail">
          <div id="hud-turn" class="hud-block"></div>
          <div id="hud-ct" class="hud-block ct-list"></div>
          <div id="hud-actions-rail-mirror" class="hud-block actions desktop-actions-mirror" aria-hidden="true"></div>
          <div id="hud-log" class="hud-block log"></div>
          <div class="cam-controls">
            <p class="hint cam-help">Slow sequential battle · Drag orbit · Wait = face</p>
            <button type="button" id="btn-mute" class="btn small">Mute</button>
            <button type="button" id="btn-menu" class="btn small">Menu</button>
          </div>
        </aside>
      </section>
    `;
    const host = this.screens.querySelector('#arena-host');
    if (this.arena) this.arena.stop();
    this.arena = new ArenaRenderer(host);
    this.arena.buildMap(this.match.map);
    this.arena.syncUnits(this.match.units, this.match.map);
    this.arena.start();
    const mapTitle = this.screens.querySelector('#map-title');
    if (mapTitle) {
      mapTitle.textContent = `${this.match.mapName || this.match.map?.name || 'Battlefield'} · ${this.match.mapTheme || ''}`;
    }
    const floatLayer = this.screens.querySelector('#float-layer');
    this.pres = new BattlePresentation(this.arena, floatLayer);
    this.pres.resetEvents(this.match);
    this.pres.onBusyChange = () => this._syncActionChromeVisibility();

    // Presentation tick
    const tick = () => {
      if (this.mode !== 'battle') return;
      this.pres?.tick();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    this.screens.querySelector('#btn-mute').onclick = () => {
      const m = audio.toggleMute();
      if (!m) audio.startBgm();
    };
    this.screens.querySelector('#btn-menu').onclick = () => {
      audio.stopBgm();
      this.showMenu();
    };
    this.arena.renderer.domElement.addEventListener('click', (e) => this.onArenaClick(e));
    this.arena.renderer.domElement.addEventListener('pointermove', (e) => this.onArenaHover(e));
    window.addEventListener('keydown', this._onBattleKey);
    // Immediate bottom panel for active unit (before slow AI playback finishes)
    this._renderBottomUnitPanel(this.match.activeUnitId);
    this._renderCommandBar();
  }

  _onBattleKey = (e) => {
    if (this.mode !== 'battle') return;
    if (this.uiMode === 'wait-face') {
      const map = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E' };
      if (map[e.key]) {
        e.preventDefault();
        this._waitFacing = map[e.key];
        this._renderWaitFaceUi();
        const active = getUnit(this.match, this.match.activeUnitId);
        if (active) {
          active.facing = this._waitFacing;
          this.arena.syncUnits(this.match.units, this.match.map);
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this._confirmWaitFace();
      }
    }
  };

  refreshBattle() {
    if (!this.match || !this.arena) return;
    this.arena.syncUnits(this.match.units, this.match.map);
    // Preserve range preview while targeting; clear only when idle
    if (this.uiMode === 'idle' || this.uiMode === 'wait-face') {
      this.arena.clearRanges();
    }

    // Phase banners
    const banner = this.screens.querySelector('#battle-banner');
    if (this.match.phase === 'victory') {
      banner?.classList.remove('hidden');
      if (banner) banner.textContent = 'VICTORY';
      audio.sfx('victory');
    } else if (this.match.phase === 'defeat') {
      banner?.classList.remove('hidden');
      if (banner) banner.textContent = 'DEFEATED…';
    }

    const turnEl = this.screens.querySelector('#hud-turn');
    const ctEl = this.screens.querySelector('#hud-ct');
    const logEl = this.screens.querySelector('#hud-log');

    const active = getUnit(this.match, this.match.activeUnitId);
    if (this.match.phase === 'battle' && active) {
      const ch = active.charging
        ? `<br/><span class="casting">Casting ${escapeHtml(getAbility(active.charging.abilityId).name)}… (${active.charging.chargeLeft}/${active.charging.castTime})</span>`
        : '';
      const lab = teamLabelForViewer(this._viewerTeam(), active.team);
      turnEl.innerHTML = `<strong>${escapeHtml(active.name)}</strong> (${lab})<br/>HP ${active.hp}/${active.maxHp} · MP ${active.mp}/${active.maxMp} · CT ${active.ct}${ch}`;
      // Active unit + tile highlight always during their turn
      this.arena.setActiveHighlight(active.id, this.match.map, { x: active.x, y: active.y });
      // Autopan onto whoever is acting (ally or foe); free camera still works after
      if (this._lastFocusedTurnId !== active.id && !this.pres?.busy) {
        this._lastFocusedTurnId = active.id;
        void this.arena.focusOnUnit(active.id, {
          facing: active.facing || 'S',
          zoom: TURN_FOCUS_ZOOM,
          ms: 800,
        });
      }
      // Progressive BGM intensity toward endgame
      audio.setBattleProgress?.(this.match);
    } else if (this.match.phase === 'victory') {
      turnEl.innerHTML = '<strong>Victory!</strong>';
      this.arena.setActiveHighlight(null);
    } else if (this.match.phase === 'defeat') {
      turnEl.innerHTML = '<strong>Defeat…</strong>';
      this.arena.setActiveHighlight(null);
    } else {
      turnEl.innerHTML = 'Advancing CT…';
    }

    const order = [...this.match.units].filter((u) => u.alive).sort((a, b) => b.ct - a.ct || b.speed - a.speed);
    ctEl.innerHTML =
      `<div class="ct-title">CT Order</div>` +
      order
        .map(
          (u) =>
            `<div class="ct-row ${u.id === this.match.activeUnitId ? 'active' : ''} ${u.charging ? 'casting' : ''}" data-uid="${u.id}">
              <span class="dot ${u.team}"></span>${escapeHtml(u.name)}${u.charging ? ' ✦' : ''} <em>${u.ct}</em>
            </div>`
        )
        .join('');
    ctEl.querySelectorAll('[data-uid]').forEach((row) => {
      row.onclick = () => this.openInspect(row.getAttribute('data-uid'));
    });

    logEl.innerHTML = this.match.log
      .slice(-10)
      .map((l) => `<div>${escapeHtml(l)}</div>`)
      .join('');

    // Bottom panel: selected unit, else active turn unit
    this._renderBottomUnitPanel(this.inspectId || this.match.activeUnitId);

    // Command bar when player input needed; hide during presentation
    this._renderCommandBar();
    // After Act only Wait remains → auto-open Wait/Face (visible in fixed chrome)
    this._maybeAutoWaitFace();
    this._syncActionChromeVisibility();
  }

  /**
   * Show/hide stationary action chrome: hidden while anims play; shown when player must act.
   */
  _syncActionChromeVisibility() {
    const chrome = this.screens.querySelector('#battle-action-chrome');
    if (!chrome || !this.match) return;
    const active = getUnit(this.match, this.match.activeUnitId);
    const canControl =
      this.match.phase === 'battle' && !!active && this._canControl(active) && !this.pres?.busy;
    const show = shouldShowActionChrome({
      busy: !!this.pres?.busy,
      canControl,
      phase: this.match.phase,
      uiMode: this.uiMode,
    });
    chrome.classList.toggle('is-hidden', !show);
    chrome.classList.toggle('hidden', !show);
    if (show) chrome.removeAttribute('hidden');
    else chrome.setAttribute('hidden', '');
  }

  /**
   * When Act is done and player can still control, open Wait/Face automatically.
   */
  _maybeAutoWaitFace() {
    if (!this.match) return;
    const active = getUnit(this.match, this.match.activeUnitId);
    const canControl =
      this.match.phase === 'battle' && active && this._canControl(active) && !this.pres?.busy;
    if (
      canControl &&
      this.uiMode !== 'wait-face' &&
      shouldAutoOpenWaitFace(this.match.turn, {
        canControl: true,
        phase: this.match.phase,
        busy: !!this.pres?.busy,
      })
    ) {
      this.enterWaitFace();
    }
  }

  /**
   * Move / Ability / Wait when player can act; mounted in #battle-action-chrome.
   */
  _renderCommandBar() {
    const actEl = this.screens.querySelector('#hud-actions');
    const waitFace = this.screens.querySelector('#hud-wait-face');
    if (!actEl || !this.match) return;

    const active = getUnit(this.match, this.match.activeUnitId);
    const canControl =
      this.match.phase === 'battle' && active && this._canControl(active) && !this.pres?.busy;

    // During presentation or enemy phase: clear chrome content (visibility handled separately)
    if (!canControl) {
      actEl.innerHTML = '';
      waitFace?.classList.add('hidden');
      this._syncActionChromeVisibility();
      return;
    }

    if (this.uiMode === 'wait-face') {
      actEl.innerHTML = `
        <div class="cmd-row">
          <button type="button" id="act-move" class="btn small" disabled>Move</button>
          <button type="button" id="act-act" class="btn small" disabled>Ability</button>
          <button type="button" id="act-wait" class="btn small primary">Wait / Face</button>
        </div>
        <div id="ability-list" class="ability-list"></div>
      `;
      this._renderWaitFaceUi();
      this._syncActionChromeVisibility();
      return;
    }

    waitFace?.classList.add('hidden');

    const moveOn = this.uiMode === 'move' ? 'primary' : '';
    const actOn = this.uiMode === 'pick-ability' || this.uiMode === 'act' ? 'primary' : '';
    actEl.innerHTML = `
      <div class="cmd-row">
        <button type="button" id="act-move" class="btn small ${moveOn}" ${this.match.turn.moved ? 'disabled' : ''}>Move</button>
        <button type="button" id="act-act" class="btn small ${actOn}" ${this.match.turn.acted ? 'disabled' : ''}>Ability</button>
        <button type="button" id="act-wait" class="btn small">Wait / Face</button>
      </div>
      <div id="ability-list" class="ability-list"></div>
      <div id="math-ct-picker" class="math-ct-picker hidden"></div>
    `;
    actEl.querySelector('#act-move').onclick = () => this.enterMoveMode();
    actEl.querySelector('#act-act').onclick = () => this.enterActMode();
    actEl.querySelector('#act-wait').onclick = () => this.enterWaitFace();

    if (this.uiMode === 'pick-ability' || this.uiMode === 'act') {
      this._populateAbilityList(active);
      if (this.uiMode === 'act' && this.selectedAbility) {
        this._showAbilityRange(active, this.selectedAbility);
      }
    }
    this._syncActionChromeVisibility();
  }

  openInspect(unitId) {
    this.inspectId = unitId;
    this._renderBottomUnitPanel(unitId);
  }

  /**
   * Bottom panel under arena — active turn unit or selected unit.
   * @param {string} [unitId]
   */
  _renderBottomUnitPanel(unitId) {
    const el = this.screens.querySelector('#bottom-unit-panel');
    if (!el || !this.match) return;
    const id = unitId || this.inspectId || this.match.activeUnitId;
    if (!id) {
      el.innerHTML = `<em>Waiting for turn…</em>`;
      return;
    }
    const data = getUnitInspect(this.match, id, this._viewerTeam());
    if (!data) return;
    const unit = getUnit(this.match, id);
    const portrait = portraitIcon(data.jobId, unit?.gender || 'm', data.team);
    const isActive = id === this.match.activeUnitId;
    const allyFoe = teamLabelForViewer(this._viewerTeam(), data.team);
    const statusBits = (data.statuses || [])
      .map((s) => `<span class="status-pill">${escapeHtml(s.id)}</span>`)
      .join(' ');
    el.innerHTML = `
      <div class="bottom-unit-inner">
        <img class="unit-portrait" src="${portrait}" width="72" height="72" alt="portrait"/>
        <div class="bottom-unit-main">
          <div class="inspect-head">
            <strong>${escapeHtml(data.name)}</strong>
            <span class="badge ${allyFoe === 'Ally' ? 'player' : 'enemy'}">${escapeHtml(allyFoe)}</span>
            ${isActive ? '<span class="badge active-turn">ACTIVE</span>' : ''}
          </div>
          <div class="inspect-job">${escapeHtml(data.jobName)} · Face ${escapeHtml(data.facing)} ${data.alive ? '' : '· KO'}</div>
          <div class="inspect-bars">
            <div>HP <b>${data.hp}</b>/${data.maxHp}</div>
            <div>MP <b>${data.mp}</b>/${data.maxMp}</div>
            <div>CT <b>${data.ct}</b></div>
            <div>Spd ${data.speed} · Mv ${data.move} · Jmp ${data.jump}</div>
            <div>PA ${data.pa} · MA ${data.ma} · Def ${data.def}</div>
            ${statusBits ? `<div class="inspect-status">Status: ${statusBits}</div>` : ''}
          </div>
          <div class="inspect-gear row-gear">
            <span><img class="item-icon" src="${itemIconUrl({ id: data.weaponId, icon: data.weaponId })}" width="28" height="28" alt=""/> ${escapeHtml(data.weaponId)}</span>
            <span><img class="item-icon" src="${itemIconUrl({ id: data.armorId, icon: data.armorId })}" width="28" height="28" alt=""/> ${escapeHtml(data.armorId)}</span>
            <span><img class="item-icon" src="${itemIconUrl({ id: data.accessoryId, icon: data.accessoryId })}" width="28" height="28" alt=""/> ${escapeHtml(data.accessoryId)}</span>
          </div>
          <div class="inspect-skills"><em>Skills:</em> ${data.abilities.map((a) => escapeHtml(formatAbilityDetail(a)?.name || a)).join(', ')}</div>
          ${data.charging ? `<div class="casting">Charging ${escapeHtml(data.charging.abilityId)} (${data.charging.chargeLeft}/${data.charging.castTime})</div>` : ''}
        </div>
      </div>
    `;
  }

  _canControl(unit) {
    if (this.match.mode === 'ai') return unit.team === TEAMS.PLAYER;
    if (this.match.mode === 'online') return unit.team === this.onlineTeam;
    return false;
  }

  enterMoveMode() {
    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || this.match.turn.moved) return;
    this.uiMode = 'move';
    this.selectedAbility = null;
    this._hoverAoeTile = null;
    audio.sfx('select');
    const range = getMoveRange(this.match, active);
    const tiles = [...range.values()].map((n) => ({ x: n.x, y: n.y }));
    this.arena.clearRanges();
    this.arena.showRange(tiles, 0x3b82f6, this.match.map);
    this._renderCommandBar();
    this.toast('Select destination (walk path animated)');
  }

  enterActMode() {
    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || this.match.turn.acted) return;
    this.uiMode = 'pick-ability';
    this.selectedAbility = null;
    this._hoverAoeTile = null;
    audio.sfx('select');
    this._renderCommandBar();
    this._populateAbilityList(active);
  }

  _populateAbilityList(active) {
    const list = this.screens.querySelector('#ability-list');
    if (!list || !active) return;
    list.innerHTML = active.abilities
      .map((id) => {
        const a = formatAbilityDetail(id);
        const math = isMathAbility(id);
        return `<button type="button" class="btn tiny ab ${this.selectedAbility === id ? 'primary' : ''}" data-id="${id}" title="${escapeHtml(a.description)}">${escapeHtml(a.name)} (${a.mpCost} MP${a.castTime ? ' · CT' + a.castTime : ''}${math ? ' · Math' : ''})</button>`;
      })
      .join('');
    list.querySelectorAll('.ab').forEach((btn) => {
      btn.onclick = () => {
        this.selectedAbility = btn.dataset.id;
        this.uiMode = 'act';
        this._pendingActTarget = null;
        audio.sfx('ui');
        this._showAbilityRange(active, this.selectedAbility);
        this._renderMathCtPicker(this.selectedAbility);
        this._renderConfirmActButton();
        this.toast(`Select target for ${getAbility(this.selectedAbility).name}, then Confirm`);
        list.querySelectorAll('.ab').forEach((b) => b.classList.toggle('primary', b.dataset.id === this.selectedAbility));
      };
    });
  }

  /** Confirm control on action chrome after tile preview */
  _renderConfirmActButton() {
    const list = this.screens.querySelector('#ability-list');
    if (!list) return;
    let row = list.querySelector('#act-confirm-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'act-confirm-row';
      row.className = 'act-confirm-row';
      list.appendChild(row);
    }
    const pending = this._pendingActTarget;
    const abName = this.selectedAbility ? getAbility(this.selectedAbility).name : 'Act';
    row.innerHTML = pending
      ? `<button type="button" id="btn-confirm-act" class="btn primary tiny">Confirm ${escapeHtml(abName)} @ (${pending.x},${pending.y})</button>
         <button type="button" id="btn-cancel-act" class="btn tiny">Cancel</button>`
      : `<em class="hint">Click a cell to preview, then Confirm</em>`;
    row.querySelector('#btn-confirm-act')?.addEventListener('click', () => this._confirmPendingAct());
    row.querySelector('#btn-cancel-act')?.addEventListener('click', () => {
      this._pendingActTarget = null;
      this.selectedAbility = null;
      this.uiMode = 'idle';
      this.arena.clearRanges();
      this._renderCommandBar();
    });
  }

  async _confirmPendingAct() {
    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || !this.selectedAbility || !this._pendingActTarget) return;
    const action = {
      type: 'act',
      unitId: active.id,
      abilityId: this.selectedAbility,
      target: { x: this._pendingActTarget.x, y: this._pendingActTarget.y },
    };
    if (isMathAbility(this.selectedAbility)) action.ctNumber = this._mathCtNumber;
    await this.submitAction(action);
    this.selectedAbility = null;
    this._pendingActTarget = null;
    this._hoverAoeTile = null;
    this.arena.clearRanges();
    if (this.uiMode !== 'wait-face') {
      this.uiMode = 'idle';
      this._maybeAutoWaitFace();
    }
    this._renderCommandBar();
  }

  _renderMathCtPicker(abilityId) {
    const el = this.screens.querySelector('#math-ct-picker');
    if (!el) return;
    if (!isMathAbility(abilityId)) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    const nums = listCalculatorCtNumbers();
    el.innerHTML = `
      <div class="math-ct-label">Calculator CT number</div>
      <div class="math-ct-row">
        ${nums
          .map(
            (n) =>
              `<button type="button" class="btn tiny ct-num ${this._mathCtNumber === n ? 'primary' : ''}" data-ct="${n}">${n}</button>`
          )
          .join('')}
      </div>
    `;
    el.querySelectorAll('.ct-num').forEach((b) => {
      b.onclick = () => {
        this._mathCtNumber = Number(b.dataset.ct);
        this._renderMathCtPicker(abilityId);
        audio.sfx('select');
      };
    });
  }

  _showAbilityRange(active, abilityId, hover = null) {
    if (!active || !abilityId) return;
    const { range, aoe } = previewRangeAndAoe(
      this.match.map,
      { x: active.x, y: active.y },
      abilityId,
      hover
    );
    this.arena.showRangeAndAoe(range, aoe, this.match.map);
  }

  onArenaHover(e) {
    if (!this.match || this.uiMode !== 'act' || !this.selectedAbility) return;
    if (this.pres?.busy) return;
    const t = this.arena.hoverTile?.(e) ?? this._hoverPickTile(e);
    if (!t) return;
    const key = `${t.x},${t.y}`;
    const prev = this._hoverAoeTile ? `${this._hoverAoeTile.x},${this._hoverAoeTile.y}` : '';
    if (key === prev) return;
    this._hoverAoeTile = t;
    const active = getUnit(this.match, this.match.activeUnitId);
    if (active) this._showAbilityRange(active, this.selectedAbility, t);
  }

  /** Raycast without consuming click-suppression (for AoE hover preview). */
  _hoverPickTile(e) {
    if (!this.arena) return null;
    const rect = this.arena.renderer.domElement.getBoundingClientRect();
    this.arena.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.arena.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.arena.raycaster.setFromCamera(this.arena.pointer, this.arena.camera);
    const hits = this.arena.raycaster.intersectObjects(this.arena.mapGroup.children, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData?.tile) o = o.parent;
      if (o?.userData?.tile) return { x: o.userData.x, y: o.userData.y };
    }
    return null;
  }

  enterWaitFace() {
    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active) return;
    this.uiMode = 'wait-face';
    this._waitFacing = active.facing || 'N';
    this._renderWaitFaceUi();
  }

  _renderWaitFaceUi() {
    const el = this.screens.querySelector('#hud-wait-face');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `
      <strong>Set Facing</strong>
      <p>Arrows / click face · Enter to confirm</p>
      <div class="face-pad">
        <button type="button" data-f="N" class="btn small ${this._waitFacing === 'N' ? 'primary' : ''}">N</button>
        <div class="face-mid">
          <button type="button" data-f="W" class="btn small ${this._waitFacing === 'W' ? 'primary' : ''}">W</button>
          <span class="face-cur">${this._waitFacing}</span>
          <button type="button" data-f="E" class="btn small ${this._waitFacing === 'E' ? 'primary' : ''}">E</button>
        </div>
        <button type="button" data-f="S" class="btn small ${this._waitFacing === 'S' ? 'primary' : ''}">S</button>
      </div>
      <button type="button" id="face-confirm" class="btn primary">Confirm Wait</button>
    `;
    el.querySelectorAll('[data-f]').forEach((b) => {
      b.onclick = () => {
        this._waitFacing = b.getAttribute('data-f');
        const active = getUnit(this.match, this.match.activeUnitId);
        if (active) {
          active.facing = this._waitFacing;
          this.arena.syncUnits(this.match.units, this.match.map);
        }
        this._renderWaitFaceUi();
      };
    });
    el.querySelector('#face-confirm').onclick = () => this._confirmWaitFace();
  }

  async _confirmWaitFace() {
    this.uiMode = 'idle';
    await this.submitAction({
      type: 'wait',
      unitId: this.match.activeUnitId,
      facing: this._waitFacing,
    });
  }

  async onArenaClick(e) {
    if (!this.match || this.match.phase !== 'battle') return;
    // Allow inspect even while presentation busy? Prefer after anims
    if (this.pres?.busy) return;
    const tile = this.arena.pickTile(e);
    if (!tile) return;

    // Always allow inspect of any unit (own or foe) when not mid-command targeting commit
    const unitOnTile = this.match.units.find((x) => x.alive && x.x === tile.x && x.y === tile.y);
    if (unitOnTile && (this.uiMode === 'idle' || this.uiMode === 'pick-ability' || !this._canControl(getUnit(this.match, this.match.activeUnitId)))) {
      this.openInspect(unitOnTile.id);
      // Off-turn: only inspect, no commands
      if (!this._canControl(getUnit(this.match, this.match.activeUnitId))) return;
    }

    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || !this._canControl(active)) return;

    if (this.uiMode === 'wait-face') {
      const dx = tile.x - active.x;
      const dy = tile.y - active.y;
      if (dx === 0 && dy === 0) return;
      this._waitFacing =
        Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'E' : 'W') : dy >= 0 ? 'S' : 'N';
      active.facing = this._waitFacing;
      this.arena.syncUnits(this.match.units, this.match.map);
      this._renderWaitFaceUi();
      return;
    }

    if (this.uiMode === 'move') {
      await this.submitAction({ type: 'move', unitId: active.id, x: tile.x, y: tile.y });
      this.uiMode = 'idle';
      this.arena.clearRanges();
      this._maybeAutoWaitFace();
      this._renderCommandBar();
      return;
    }
    if (this.uiMode === 'act' && this.selectedAbility) {
      // First click: preview only — require Confirm on action chrome
      if (unitOnTile) this.openInspect(unitOnTile.id);
      this._pendingActTarget = { x: tile.x, y: tile.y };
      this._showAbilityRange(active, this.selectedAbility, tile);
      this._renderConfirmActButton();
      this._syncActionChromeVisibility();
      audio.sfx('select');
      this.toast('Preview set — press Confirm to cast/attack');
    }
  }

  async submitAction(action) {
    if (this.match.mode === 'online' && this.mp) {
      try {
        this.mp.send({ type: MSG.ACTION, action });
      } catch (e) {
        this.toast(String(e.message || e) || 'Multiplayer send failed');
      }
      return;
    }
    // Always wait for prior presentation before applying the next action
    if (this.pres) {
      await this.pres.waitUntilIdle();
    }
    this._syncActionChromeVisibility();

    const r = applyAction(this.match, action);
    if (!r.ok) {
      this.toast(r.error || 'Illegal');
      return;
    }

    // playEventsSinceCursor claims its event slice immediately — do not rewind cursor
    if (this.pres) {
      this._syncActionChromeVisibility();
      await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
    }

    if (this.match.mode === 'ai') {
      if (this.pres) await this.pres.waitUntilIdle();
      playEnemyTurns(this.match, this.difficulty);
      if (this.pres) {
        this._syncActionChromeVisibility();
        await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
      }
    }

    // After act: auto Wait/Face if only Wait left; else stay idle for residual Move
    if (action.type === 'act') {
      const active = getUnit(this.match, this.match.activeUnitId);
      const canControl = !!(active && this._canControl(active) && this.match.phase === 'battle');
      this.uiMode = uiModeAfterSuccessfulAct(this.match.turn, {
        canControl,
        phase: this.match.phase,
        unitEnded: !active || this.match.activeUnitId !== action.unitId,
      });
    } else if (action.type === 'move') {
      // After move, if already acted, auto Wait/Face
      this._maybeAutoWaitFace();
    }

    this.refreshBattle();
  }

  /* Online — WebSocket (npm start) or P2P (GitHub Pages) */
  showOnline() {
    this.mode = 'online';
    const ep = resolveMultiplayerEndpoint();
    const modeHint =
      ep.mode === 'pages'
        ? 'Browser P2P mode (works on GitHub Pages). Share the room code with a friend on another device.'
        : ep.mode === 'custom'
          ? `Custom server: ${escapeHtml(ep.url || '')}`
          : 'Connecting to game server on this host (npm start).';
    this.screens.innerHTML = `
      <section class="panel fft-panel">
        <h2>Online Multiplayer</h2>
        <p class="hint" id="on-mode-hint">${modeHint}</p>
        <label>Name <input id="on-name" value="Tactician"/></label>
        <button type="button" id="on-create" class="btn primary">Create Room</button>
        <label>Code <input id="on-code" maxlength="8" placeholder="ABC123" autocomplete="off"/></label>
        <button type="button" id="on-join" class="btn">Join Room</button>
        <p class="hint">Optional: set custom server with <code>?ws=wss://your-host</code> or localStorage <code>ffk_ws_url</code>.</p>
        <button type="button" id="on-back" class="btn">Back</button>
        <p class="hint" id="on-status"></p>
      </section>`;
    this.screens.querySelector('#on-create').onclick = () => this.onlineCreate();
    this.screens.querySelector('#on-join').onclick = () => this.onlineJoin();
    this.screens.querySelector('#on-back').onclick = () => {
      this.mp?.close();
      this.mp = null;
      this.showMenu();
    };
  }

  _setOnlineStatus(text) {
    const el = this.screens.querySelector('#on-status');
    if (el) el.textContent = text || '';
  }

  _ensureMpClient() {
    if (this.mp && !this.mp._destroyed) return this.mp;
    this.mp = new MultiplayerClient({
      onMessage: (msg) => {
        void this.onWsMessage(msg);
      },
      onStatus: (s) => {
        const map = {
          'p2p-loading': 'Loading peer network…',
          'p2p-host-open': 'Room open — waiting for opponent…',
          'p2p-guest-connected': 'Opponent connected',
          'p2p-connected': 'Connected to host',
          'ws-open': 'Connected to server',
          'ws-close': 'Disconnected',
        };
        this._setOnlineStatus(map[s] || s);
      },
    });
    return this.mp;
  }

  async onWsMessage(msg) {
    if (msg.type === 'welcome') {
      this.clientId = msg.clientId;
      if (msg.transport) this._mpTransport = msg.transport;
      return;
    }
    if (msg.type === MSG.ERROR) {
      this.toast(msg.error);
      this._setOnlineStatus(msg.error);
      return;
    }
    if (msg.room) {
      this.room = msg.room;
      const seat = msg.room.seats.find((s) => s.id === this.clientId);
      if (seat) this.onlineTeam = seat.team;
      if (msg.room.match) {
        const prevMatchId = this.match?.id;
        const prevSeq = this.pres?._lastPlayedSeq ?? 0;
        this.match = msg.room.match;
        if (this.mode !== 'battle') {
          this.mode = 'battle';
          audio.startBgm();
          this.renderBattle();
          if (this.pres) {
            this.pres.resetEvents({ events: [] });
            await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
          }
        } else if (this.pres) {
          await this.pres.waitUntilIdle();
          if (this.match.id !== prevMatchId) {
            this.pres.resetEvents({ events: [] });
          } else {
            // Never rewind seq — claimEventsAfterSeq uses monotonic event.seq
            this.pres._lastPlayedSeq = Math.max(prevSeq, this.pres._lastPlayedSeq || 0);
          }
          await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
        }
        this.refreshBattle();
      } else this.renderOnlineLobby();
    }
  }

  async onlineCreate() {
    const name = this.screens.querySelector('#on-name')?.value || 'Host';
    const btn = this.screens.querySelector('#on-create');
    if (btn) btn.disabled = true;
    this._setOnlineStatus('Creating room…');
    try {
      this.mp?.close();
      const mp = this._ensureMpClient();
      const info = await mp.createRoom(name);
      this._mpTransport = info.transport;
      if (info.code) {
        this._setOnlineStatus(`Room ${info.code} (${info.transport}) — share this code`);
      } else {
        this._setOnlineStatus(`Connected (${info.transport})`);
      }
    } catch (e) {
      console.error(e);
      this.toast(String(e?.message || e) || 'Multiplayer failed');
      this._setOnlineStatus(String(e?.message || e));
      this.mp?.close();
      this.mp = null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async onlineJoin() {
    const name = this.screens.querySelector('#on-name')?.value || 'Guest';
    const code = (this.screens.querySelector('#on-code')?.value || '').trim().toUpperCase();
    if (!code) {
      this.toast('Enter a room code');
      return;
    }
    const btn = this.screens.querySelector('#on-join');
    if (btn) btn.disabled = true;
    this._setOnlineStatus(`Joining ${code}…`);
    try {
      this.mp?.close();
      const mp = this._ensureMpClient();
      await mp.joinRoom(code, name);
      this._setOnlineStatus(`Joined ${code}`);
    } catch (e) {
      console.error(e);
      this.toast(String(e?.message || e) || 'Join failed');
      this._setOnlineStatus(String(e?.message || e));
      this.mp?.close();
      this.mp = null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  renderOnlineLobby() {
    if (!this.room) return;
    const transport = this._mpTransport || this.mp?.transport || 'online';
    this.screens.innerHTML = `
      <section class="panel fft-panel">
        <h2>Room ${escapeHtml(this.room.code)}</h2>
        <p class="hint">Transport: ${escapeHtml(transport)} · Share code <strong>${escapeHtml(this.room.code)}</strong></p>
        <ul>${this.room.seats.map((s) => `<li>${escapeHtml(s.name || '…')} (${s.team}) ${s.ready ? '✓ ready' : '…'} ${s.hasLoadout ? '· loadout' : ''}</li>`).join('')}</ul>
        <button type="button" id="ol-loadout" class="btn">Push loadout</button>
        <button type="button" id="ol-ready" class="btn primary">Ready</button>
        <button type="button" id="ol-start" class="btn">Start</button>
        <button type="button" id="ol-back" class="btn">Leave</button>
        <p class="hint" id="on-status"></p>
      </section>`;
    this.screens.querySelector('#ol-loadout').onclick = () => {
      try {
        this.mp?.send({ type: MSG.SET_LOADOUT, loadouts: this.loadouts });
        this.toast('Loadout pushed');
      } catch (e) {
        this.toast(String(e.message || e));
      }
    };
    this.screens.querySelector('#ol-ready').onclick = () => {
      try {
        this.mp?.send({ type: MSG.READY, ready: true });
      } catch (e) {
        this.toast(String(e.message || e));
      }
    };
    this.screens.querySelector('#ol-start').onclick = () => {
      try {
        this.mp?.send({ type: MSG.START });
      } catch (e) {
        this.toast(String(e.message || e));
      }
    };
    this.screens.querySelector('#ol-back').onclick = () => {
      this.mp?.close();
      this.mp = null;
      this.room = null;
      this.showMenu();
    };
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Green/red signed delta next to a stat value.
 * @param {Record<string, number>|null} flash
 * @param {string} key
 */
function deltaSpan(flash, key) {
  if (!flash || flash[key] == null || flash[key] === 0) return '';
  const d = flash[key];
  const cls = d > 0 ? 'stat-delta up' : 'stat-delta down';
  return ` <span class="${cls}">${formatStatDelta(d)}</span>`;
}

function loadLastLoadout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length === 4) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function saveLastLoadout(loadouts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadouts));
  } catch {
    /* ignore */
  }
}

export function getBrand() {
  return 'Final Fantasy Knockoff';
}
