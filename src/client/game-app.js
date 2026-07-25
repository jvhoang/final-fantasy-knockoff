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
import { abilityRangeTiles } from '../core/grid.js';
import { TEAMS } from '../core/constants.js';
import { WATER_RULES } from '../content/map-castle.js';
import { resolveIcon, portraitIcon } from '../content/icons.js';
import { itemIconUrl } from '../content/items.js';
import { ArenaRenderer } from './arena.js';
import { BattlePresentation } from './battle-presentation.js';
import { WALK_MS_PER_STEP, ATTACK_HOLD_MS } from './presentation-timing.js';
import { audio } from './audio.js';
import { MSG } from '../net/protocol.js';
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
    this.clientId = null;
    this.room = null;
    this.onlineTeam = 'player';
    this.inspectId = null;
    this._waitFacing = 'N';
    this._buildShell();
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

    this.screens.innerHTML = `
      <section class="panel loadout-panel wide fft-panel loadout-sticky-layout" id="loadout-screen">
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
          <div class="loadout-sticky-preview-row">
            <div id="loadout-preview" class="loadout-preview" aria-label="Character preview"></div>
            <div class="loadout-stats" id="loadout-stats">
              <h3>Attributes · ${escapeHtml(preview.name)}</h3>
              <table class="stat-table">
                <tr><td>HP</td><td id="st-hp">${s.hp}</td><td>MP</td><td id="st-mp">${s.mp}</td></tr>
                <tr><td>Speed</td><td id="st-speed">${s.speed}</td><td>Move</td><td id="st-move">${s.move}</td></tr>
                <tr><td>Jump</td><td id="st-jump">${s.jump}</td><td>Def</td><td id="st-def">${s.def}</td></tr>
                <tr><td>PA</td><td id="st-pa">${s.pa}</td><td>MA</td><td id="st-ma">${s.ma}</td></tr>
                <tr><td>Wpn ATK</td><td id="st-watk">${s.weaponAtk}</td><td>Wpn Rng</td><td id="st-wrng">${escapeHtml(s.weaponRange)}</td></tr>
              </table>
              <p class="hint">Kit: ${escapeHtml(preview.visual.silhouette)} · ${escapeHtml(preview.visual.weaponAttach)} · <strong id="unit-gil">${preview.gilCost}g</strong></p>
            </div>
          </div>
        </div>

        <div class="loadout-scroll-body">
          <div class="loadout-grid two">
            <div class="loadout-form">
              <label>Name <input id="lo-name" value="${escapeHtml(slot.name)}" /></label>
              <label>Gender
                <select id="lo-gender">
                  <option value="m" ${slot.gender !== 'f' ? 'selected' : ''}>Male</option>
                  <option value="f" ${slot.gender === 'f' ? 'selected' : ''}>Female</option>
                </select>
              </label>
              <label>Job <select id="lo-job">${jobOpts}</select></label>
              <p class="job-desc">${escapeHtml(preview.jobDescription)}</p>
              <label>Secondary skillset <select id="lo-sec">${secOpts}</select></label>
              <label>
                <span class="with-icon"><img class="item-icon" src="${preview.icons.weapon}" alt="" width="36" height="36"/> Weapon</span>
                <select id="lo-wep">${wOpts}</select>
              </label>
              <p class="eq-desc">${escapeHtml(preview.equipmentNotes.weapon)} · <strong>${preview.weapon?.gilCost ?? 0}g</strong></p>
              <label>
                <span class="with-icon"><img class="item-icon" src="${preview.icons.armor}" alt="" width="36" height="36"/> Armor</span>
                <select id="lo-arm">${aOpts}</select>
              </label>
              <p class="eq-desc">${escapeHtml(preview.equipmentNotes.armor)} · <strong>${preview.armor?.gilCost ?? 0}g</strong></p>
              <label>
                <span class="with-icon"><img class="item-icon" src="${preview.icons.accessory}" alt="" width="36" height="36"/> Accessory</span>
                <select id="lo-acc">${xOpts}</select>
              </label>
              <p class="eq-desc">${escapeHtml(preview.equipmentNotes.accessory)} · <strong>${preview.accessory?.gilCost ?? 0}g</strong></p>
            </div>
            <div class="skill-panel" id="skill-panel">
              <h3>Skills &amp; Magic (${preview.abilities.length})</h3>
              <div class="skill-list">${skillCards}</div>
            </div>
          </div>
          <div class="row">
            <button type="button" id="lo-save" class="btn primary">Save unit</button>
            <button type="button" id="lo-done" class="btn" ${budget.ok ? '' : 'disabled'}>${
              this._loadoutNext === 'ai' ? 'Start vs AI' : this._loadoutNext === 'online' ? 'Continue Online' : 'Back'
            }</button>
          </div>
        </div>
      </section>
    `;

    this._mountLoadoutPreview(preview);

    const refresh = () => {
      this._commitLoadoutForm();
      this.renderLoadout();
    };
    this.screens.querySelectorAll('.tab').forEach((btn) => {
      btn.onclick = () => {
        this._commitLoadoutForm();
        this.selectedUnitIdx = Number(btn.dataset.i);
        this.renderLoadout();
      };
    });
    ['lo-job', 'lo-sec', 'lo-wep', 'lo-arm', 'lo-acc', 'lo-gender'].forEach((id) => {
      this.screens.querySelector('#' + id)?.addEventListener('change', refresh);
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
    this.renderBattle();
    // Snapshot units at spawn positions, then AI may move — walk those paths
    this.pres?.resetEvents(this.match);
    const ev0 = this.match.events?.length || 0;
    playEnemyTurns(this.match, this.difficulty);
    // Interleaved walks + cast resolve floaters/VFX (no teleport)
    if (this.pres) {
      this.pres._eventCursor = ev0;
      await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
    }
    this.refreshBattle();
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
          </div>
          <div id="bottom-unit-panel" class="bottom-unit-panel" aria-label="Unit status">
            <em>Active / selected unit status appears here</em>
          </div>
        </div>
        <aside class="hud action-rail">
          <div id="hud-turn" class="hud-block"></div>
          <div id="hud-ct" class="hud-block ct-list"></div>
          <div id="hud-actions" class="hud-block actions"></div>
          <div id="hud-wait-face" class="hud-block hidden"></div>
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
    window.addEventListener('keydown', this._onBattleKey);
    // Immediate bottom panel for active unit (before slow AI playback finishes)
    this._renderBottomUnitPanel(this.match.activeUnitId);
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
    this.arena.clearRanges();

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
    const actEl = this.screens.querySelector('#hud-actions');
    const logEl = this.screens.querySelector('#hud-log');

    const active = getUnit(this.match, this.match.activeUnitId);
    if (this.match.phase === 'battle' && active) {
      const ch = active.charging
        ? `<br/><span class="casting">Casting ${escapeHtml(getAbility(active.charging.abilityId).name)}… (${active.charging.chargeLeft}/${active.charging.castTime})</span>`
        : '';
      turnEl.innerHTML = `<strong>${escapeHtml(active.name)}</strong> (${active.team === 'player' ? 'Ally' : 'Foe'})<br/>HP ${active.hp}/${active.maxHp} · MP ${active.mp}/${active.maxMp} · CT ${active.ct}${ch}`;
    } else if (this.match.phase === 'victory') {
      turnEl.innerHTML = '<strong>Victory!</strong>';
    } else if (this.match.phase === 'defeat') {
      turnEl.innerHTML = '<strong>Defeat…</strong>';
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

    actEl.innerHTML = '';
    const waitFace = this.screens.querySelector('#hud-wait-face');
    waitFace?.classList.add('hidden');

    if (this.uiMode === 'wait-face') {
      this._renderWaitFaceUi();
      return;
    }

    if (this.match.phase === 'battle' && active && this._canControl(active) && !this.pres?.busy) {
      actEl.innerHTML = `
        <button type="button" id="act-move" class="btn small" ${this.match.turn.moved ? 'disabled' : ''}>Move</button>
        <button type="button" id="act-act" class="btn small" ${this.match.turn.acted ? 'disabled' : ''}>Ability</button>
        <button type="button" id="act-wait" class="btn small primary">Wait / Face</button>
        <div id="ability-list"></div>
      `;
      actEl.querySelector('#act-move').onclick = () => this.enterMoveMode();
      actEl.querySelector('#act-act').onclick = () => this.enterActMode();
      actEl.querySelector('#act-wait').onclick = () => this.enterWaitFace();
    } else if (this.match.phase === 'battle' && active?.team === TEAMS.ENEMY && this.match.mode === 'ai') {
      actEl.innerHTML = `<em>Enemy phase…</em>`;
    }
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
    const data = getUnitInspect(this.match, id);
    if (!data) return;
    const unit = getUnit(this.match, id);
    const portrait = portraitIcon(data.jobId, unit?.gender || 'm', data.team);
    const isActive = id === this.match.activeUnitId;
    el.innerHTML = `
      <div class="bottom-unit-inner">
        <img class="unit-portrait" src="${portrait}" width="72" height="72" alt="portrait"/>
        <div class="bottom-unit-main">
          <div class="inspect-head">
            <strong>${escapeHtml(data.name)}</strong>
            <span class="badge ${data.team}">${escapeHtml(data.teamLabel)}</span>
            ${isActive ? '<span class="badge active-turn">ACTIVE</span>' : ''}
          </div>
          <div class="inspect-job">${escapeHtml(data.jobName)} · Face ${escapeHtml(data.facing)} ${data.alive ? '' : '· KO'}</div>
          <div class="inspect-bars">
            <div>HP <b>${data.hp}</b>/${data.maxHp}</div>
            <div>MP <b>${data.mp}</b>/${data.maxMp}</div>
            <div>CT <b>${data.ct}</b></div>
            <div>Spd ${data.speed} · Mv ${data.move} · Jmp ${data.jump}</div>
            <div>PA ${data.pa} · MA ${data.ma} · Def ${data.def}</div>
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
    const range = getMoveRange(this.match, active);
    const tiles = [...range.values()].map((n) => ({ x: n.x, y: n.y }));
    this.arena.clearRanges();
    this.arena.showRange(tiles, 0x3b82f6, this.match.map);
    this.toast('Select destination (walk path animated)');
  }

  enterActMode() {
    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || this.match.turn.acted) return;
    this.uiMode = 'pick-ability';
    const list = this.screens.querySelector('#ability-list');
    if (!list) return;
    list.innerHTML = active.abilities
      .map((id) => {
        const a = formatAbilityDetail(id);
        return `<button type="button" class="btn tiny ab" data-id="${id}" title="${escapeHtml(a.description)}">${escapeHtml(a.name)} (${a.mpCost} MP${a.castTime ? ' · CT' + a.castTime : ''})</button>`;
      })
      .join('');
    list.querySelectorAll('.ab').forEach((btn) => {
      btn.onclick = () => {
        this.selectedAbility = btn.dataset.id;
        this.uiMode = 'act';
        const ab = getAbility(this.selectedAbility);
        let tiles =
          ab.maxRange === 0
            ? [{ x: active.x, y: active.y }]
            : abilityRangeTiles(this.match.map, active, ab.minRange, ab.maxRange);
        if (ab.minRange === 0 && ab.maxRange > 0) tiles.push({ x: active.x, y: active.y });
        this.arena.clearRanges();
        this.arena.showRange(tiles, 0xef4444, this.match.map);
        this.toast(`Target for ${ab.name}`);
      };
    });
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
    if (this.pres?.busy) return;
    const tile = this.arena.pickTile(e);
    if (!tile) return;

    // Inspect unit on tile if not in action targeting
    if (this.uiMode === 'idle' || this.uiMode === 'pick-ability') {
      const u = this.match.units.find((x) => x.alive && x.x === tile.x && x.y === tile.y);
      if (u) this.openInspect(u.id);
    }

    const active = getUnit(this.match, this.match.activeUnitId);
    if (!active || !this._canControl(active)) return;

    if (this.uiMode === 'wait-face') {
      // Click relative facing toward tile
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
      return;
    }
    if (this.uiMode === 'act' && this.selectedAbility) {
      await this.submitAction({
        type: 'act',
        unitId: active.id,
        abilityId: this.selectedAbility,
        target: { x: tile.x, y: tile.y },
      });
      this.uiMode = 'idle';
      this.selectedAbility = null;
      this.arena.clearRanges();
    }
  }

  async submitAction(action) {
    if (this.match.mode === 'online' && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: MSG.ACTION, action }));
      return;
    }
    const evBefore = this.match.events?.length || 0;
    const r = applyAction(this.match, action);
    if (!r.ok) {
      this.toast(r.error || 'Illegal');
      return;
    }

    // All presentation (including attacker swing) comes from match events via playEventsSinceCursor
    // so AI/online/player share the same sequential attack → hit path. No fire-and-forget playAnim.
    if (this.pres) {
      this.pres._eventCursor = evBefore;
      await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
    }

    if (this.match.mode === 'ai') {
      const ev0 = this.match.events?.length || 0;
      playEnemyTurns(this.match, this.difficulty);
      if (this.pres) {
        this.pres._eventCursor = ev0;
        await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
      }
    }

    this.refreshBattle();
  }

  /* Online — simplified */
  showOnline() {
    this.mode = 'online';
    this.screens.innerHTML = `
      <section class="panel fft-panel">
        <h2>Online</h2>
        <label>Name <input id="on-name" value="Tactician"/></label>
        <button type="button" id="on-create" class="btn primary">Create Room</button>
        <label>Code <input id="on-code" maxlength="6"/></label>
        <button type="button" id="on-join" class="btn">Join</button>
        <button type="button" id="on-back" class="btn">Back</button>
      </section>`;
    this.screens.querySelector('#on-create').onclick = () => this.onlineCreate();
    this.screens.querySelector('#on-join').onclick = () => this.onlineJoin();
    this.screens.querySelector('#on-back').onclick = () => this.showMenu();
  }

  _wsUrl() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  }

  connectWs() {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === 1) return resolve(this.ws);
      const ws = new WebSocket(this._wsUrl());
      ws.onopen = () => {
        this.ws = ws;
        resolve(ws);
      };
      ws.onerror = reject;
      ws.onmessage = (ev) => this.onWsMessage(JSON.parse(ev.data));
    });
  }

  async onWsMessage(msg) {
    if (msg.type === 'welcome') {
      this.clientId = msg.clientId;
      return;
    }
    if (msg.type === MSG.ERROR) {
      this.toast(msg.error);
      return;
    }
    if (msg.room) {
      this.room = msg.room;
      const seat = msg.room.seats.find((s) => s.id === this.clientId);
      if (seat) this.onlineTeam = seat.team;
      if (msg.room.match) {
        const prevEventLen = this.match?.events?.length || 0;
        const prevMatchId = this.match?.id;
        this.match = msg.room.match;
        if (this.mode !== 'battle') {
          this.mode = 'battle';
          audio.startBgm();
          this.renderBattle();
          // Fresh battle: play all events so far (includes walks)
          if (this.pres) {
            this.pres.resetEvents({ events: [] });
            await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
          }
        } else if (this.pres) {
          // Same match update: walk multi-tile moves (do not use consumeEvents — skips paths)
          if (this.match.id === prevMatchId) {
            this.pres._eventCursor = Math.min(prevEventLen, this.match.events?.length || 0);
          } else {
            this.pres.resetEvents({ events: [] });
          }
          await this.pres.playEventsSinceCursor(this.match, WALK_MS_PER_STEP);
        }
        this.refreshBattle();
      } else this.renderOnlineLobby();
    }
  }

  async onlineCreate() {
    try {
      await this.connectWs();
      this.ws.send(JSON.stringify({ type: MSG.CREATE_ROOM, name: this.screens.querySelector('#on-name')?.value || 'Host' }));
    } catch {
      this.toast('WS failed');
    }
  }
  async onlineJoin() {
    try {
      await this.connectWs();
      this.ws.send(
        JSON.stringify({
          type: MSG.JOIN_ROOM,
          code: this.screens.querySelector('#on-code')?.value || '',
          name: this.screens.querySelector('#on-name')?.value || 'Guest',
        })
      );
    } catch {
      this.toast('WS failed');
    }
  }

  renderOnlineLobby() {
    if (!this.room) return;
    this.screens.innerHTML = `
      <section class="panel fft-panel">
        <h2>Room ${escapeHtml(this.room.code)}</h2>
        <ul>${this.room.seats.map((s) => `<li>${escapeHtml(s.name)} (${s.team}) ${s.ready ? '✓' : '…'}</li>`).join('')}</ul>
        <button type="button" id="ol-loadout" class="btn">Push loadout</button>
        <button type="button" id="ol-ready" class="btn primary">Ready</button>
        <button type="button" id="ol-start" class="btn">Start</button>
        <button type="button" id="ol-back" class="btn">Leave</button>
      </section>`;
    this.screens.querySelector('#ol-loadout').onclick = () =>
      this.ws.send(JSON.stringify({ type: MSG.SET_LOADOUT, loadouts: this.loadouts }));
    this.screens.querySelector('#ol-ready').onclick = () => this.ws.send(JSON.stringify({ type: MSG.READY, ready: true }));
    this.screens.querySelector('#ol-start').onclick = () => this.ws.send(JSON.stringify({ type: MSG.START }));
    this.screens.querySelector('#ol-back').onclick = () => {
      this.ws?.close();
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
