/**
 * Three.js isometric castle arena — free orbit camera, upgraded materials, job kits.
 */
import * as THREE from 'three';
import { buildUnitMesh, tickUnitAnim, setUnitFacing, resetUnitAnimPose } from './unit-mesh.js';

/**
 * Durable click-suppression for camera gestures (survives pointerup before click).
 * @param {{ _clickSuppressed?: boolean }} state
 * @returns {boolean} true if this click/pick should be ignored
 */
export function consumeClickSuppression(state) {
  if (state._clickSuppressed) {
    state._clickSuppressed = false;
    return true;
  }
  return false;
}

/**
 * Mark that a camera drag/pinch moved enough to suppress the next pick.
 * @param {{ _clickSuppressed?: boolean }} state
 */
export function markClickSuppressed(state) {
  state._clickSuppressed = true;
}

const TERRAIN = {
  floor: { color: 0x5a7a4a, roughness: 0.92, metal: 0.05 },
  elevated: { color: 0x6d8f62, roughness: 0.88, metal: 0.08 },
  ramp: { color: 0x8b7355, roughness: 0.85, metal: 0.05 },
  bridge: { color: 0xa67c3d, roughness: 0.75, metal: 0.15 },
  water: { color: 0x1e5a8a, roughness: 0.2, metal: 0.3 },
  wall: { color: 0x6b6560, roughness: 0.85, metal: 0.1 },
  tower: { color: 0x7a6a5a, roughness: 0.8, metal: 0.12 },
  void: { color: 0x111111, roughness: 1, metal: 0 },
};

export class ArenaRenderer {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth || 800;
    this.height = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6a8aaa);
    this.scene.fog = new THREE.FogExp2(0x8aa8c0, 0.018);

    this.zoom = 14;
    this.rotY = Math.PI / 4;
    this.rotX = Math.PI / 5.2;
    this.lookAt = new THREE.Vector3(8, 0.5, 8);
    this._minPolar = 0.25;
    this._maxPolar = Math.PI / 2.15;

    const aspect = this.width / this.height;
    this.camera = new THREE.OrthographicCamera(
      -this.zoom * aspect,
      this.zoom * aspect,
      this.zoom,
      -this.zoom,
      0.1,
      250
    );
    this._updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // Lighting rig
    this.scene.add(new THREE.AmbientLight(0xb0c4de, 0.45));
    const hemi = new THREE.HemisphereLight(0xc9e0ff, 0x3d4a32, 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
    sun.position.set(25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(-15, 10, -10);
    this.scene.add(fill);

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.unitMeshes = new Map();
    this.rangeMeshes = [];
    this.tileMeshes = new Map();
    this.unitAnims = new Map(); // id -> { anim, until }

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._bindCameraInput();
    window.addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.running = false;
    this._anim = null;
    /** Survives pointerup so the following click does not pick tiles after a drag */
    this._clickSuppressed = false;
  }

  _bindCameraInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    this._drag = null;
    this._pointers = new Map();

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._drag = {
          x: e.clientX,
          y: e.clientY,
          mode: e.button === 2 || e.shiftKey ? 'pan' : e.button === 1 || e.altKey ? 'pan' : 'orbit',
          moved: false,
        };
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch zoom (two pointers)
      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchDist) {
          const delta = (this._pinchDist - dist) * 0.02;
          this.zoomBy(delta);
        }
        this._pinchDist = dist;
        // pinch counts as gesture — suppress next click
        markClickSuppressed(this);
        return;
      }

      if (!this._drag) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        this._drag.moved = true;
        // Persist past pointerup (click fires after up and _drag is cleared)
        markClickSuppressed(this);
      }
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;

      if (this._drag.mode === 'pan') {
        // pan lookAt along camera right / forward-flat
        const right = new THREE.Vector3(Math.cos(this.rotY), 0, -Math.sin(this.rotY));
        const fwd = new THREE.Vector3(Math.sin(this.rotY), 0, Math.cos(this.rotY));
        const scale = this.zoom * 0.0025;
        this.lookAt.addScaledVector(right, -dx * scale);
        this.lookAt.addScaledVector(fwd, -dy * scale);
        this._updateCamera();
      } else {
        // free orbit — not locked to 90°
        this.rotY -= dx * 0.007;
        this.rotX = Math.max(this._minPolar, Math.min(this._maxPolar, this.rotX + dy * 0.005));
        this._updateCamera();
      }
    });
    const end = (e) => {
      if (this._drag?.moved) markClickSuppressed(this);
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = null;
      if (this._pointers.size === 0) this._drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY * 0.01);
      },
      { passive: false }
    );

    // Keyboard: free orbit + pan + zoom (not only 4 snaps)
    this._onKey = (e) => {
      const step = e.shiftKey ? 0.2 : 0.08;
      if (e.key === 'q' || e.key === 'Q') {
        this.rotY += step;
        this._updateCamera();
      }
      if (e.key === 'e' || e.key === 'E') {
        this.rotY -= step;
        this._updateCamera();
      }
      if (e.key === 'r' || e.key === 'R') {
        this.rotX = Math.max(this._minPolar, this.rotX - 0.06);
        this._updateCamera();
      }
      if (e.key === 'f' || e.key === 'F') {
        this.rotX = Math.min(this._maxPolar, this.rotX + 0.06);
        this._updateCamera();
      }
      if (e.key === '=' || e.key === '+') this.zoomBy(-1);
      if (e.key === '-' || e.key === '_') this.zoomBy(1);
      if (e.key === 'ArrowLeft') {
        this.lookAt.x -= 0.5;
        this._updateCamera();
      }
      if (e.key === 'ArrowRight') {
        this.lookAt.x += 0.5;
        this._updateCamera();
      }
      if (e.key === 'ArrowUp') {
        this.lookAt.z -= 0.5;
        this._updateCamera();
      }
      if (e.key === 'ArrowDown') {
        this.lookAt.z += 0.5;
        this._updateCamera();
      }
      // optional snap hotkeys
      if (e.key === '1') {
        this.rotY = Math.PI / 4;
        this._updateCamera();
      }
      if (e.key === '2') {
        this.rotY = Math.PI / 4 + Math.PI / 2;
        this._updateCamera();
      }
      if (e.key === '3') {
        this.rotY = Math.PI / 4 + Math.PI;
        this._updateCamera();
      }
      if (e.key === '4') {
        this.rotY = Math.PI / 4 + (3 * Math.PI) / 2;
        this._updateCamera();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _updateCamera() {
    const dist = 42;
    this.camera.position.set(
      this.lookAt.x + dist * Math.sin(this.rotY) * Math.cos(this.rotX),
      this.lookAt.y + dist * Math.sin(this.rotX),
      this.lookAt.z + dist * Math.cos(this.rotY) * Math.cos(this.rotX)
    );
    this.camera.lookAt(this.lookAt);
    const aspect = this.width / Math.max(1, this.height);
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** Continuous rotate (radians), not quarter-turn only */
  rotate(deltaRad = 0.1) {
    this.rotY += deltaRad;
    this._updateCamera();
  }

  /** Legacy 90° helper still available for buttons */
  rotateSnap(quarters = 1) {
    this.rotY += (Math.PI / 2) * quarters;
    this._updateCamera();
  }

  zoomBy(delta) {
    this.zoom = Math.max(5, Math.min(32, this.zoom + delta));
    this._updateCamera();
  }

  getCameraState() {
    return {
      rotY: this.rotY,
      rotX: this.rotX,
      zoom: this.zoom,
      lookAt: { x: this.lookAt.x, y: this.lookAt.y, z: this.lookAt.z },
    };
  }

  onResize() {
    this.width = this.container.clientWidth || 800;
    this.height = this.container.clientHeight || 600;
    this.renderer.setSize(this.width, this.height);
    this._updateCamera();
  }

  /**
   * @param {import('../core/grid.js').GridMap} map
   */
  buildMap(map) {
    while (this.mapGroup.children.length) {
      const c = this.mapGroup.children[0];
      this.mapGroup.remove(c);
      c.geometry?.dispose?.();
    }
    this.tileMeshes.clear();
    const cell = 1;

    // Ground plane under map
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.width + 8, map.height + 8),
      new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((map.width - 1) / 2, -0.05, (map.height - 1) / 2);
    ground.receiveShadow = true;
    this.mapGroup.add(ground);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[y][x];
        const conf = TERRAIN[t.terrain] || TERRAIN.floor;
        const h =
          t.terrain === 'water'
            ? 0.12 + (t.depth || 1) * 0.04
            : Math.max(0.18, t.height * 0.48 + 0.22);

        let mesh;
        if (t.terrain === 'water') {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cell * 0.98, h, cell * 0.98),
            new THREE.MeshPhysicalMaterial({
              color: conf.color,
              roughness: 0.15,
              metalness: 0.2,
              transmission: 0.35,
              thickness: 0.5,
              transparent: true,
              opacity: 0.82,
            })
          );
        } else if (t.terrain === 'wall') {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cell * 0.98, h * 1.4, cell * 0.98),
            new THREE.MeshStandardMaterial({
              color: conf.color,
              roughness: conf.roughness,
              metalness: conf.metal,
            })
          );
        } else if (t.terrain === 'bridge') {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cell * 0.92, 0.18, cell * 0.92),
            new THREE.MeshStandardMaterial({
              color: conf.color,
              roughness: conf.roughness,
              metalness: conf.metal,
            })
          );
          // posts
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
          );
          post.position.set(-0.35, -0.1, -0.35);
          mesh.add(post);
        } else if (t.terrain === 'tower') {
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.48, h, 8),
            new THREE.MeshStandardMaterial({
              color: conf.color,
              roughness: conf.roughness,
              metalness: conf.metal,
            })
          );
        } else {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cell * 0.96, h, cell * 0.96),
            new THREE.MeshStandardMaterial({
              color: conf.color,
              roughness: conf.roughness,
              metalness: conf.metal,
            })
          );
          // top edge highlight for elevation readability
          if (t.height >= 1 && t.walkable) {
            const lip = new THREE.Mesh(
              new THREE.BoxGeometry(cell * 0.96, 0.03, cell * 0.96),
              new THREE.MeshStandardMaterial({ color: 0xd4c4a0, roughness: 0.7 })
            );
            lip.position.y = h / 2 + 0.01;
            mesh.add(lip);
          }
        }

        mesh.position.set(x * cell, h / 2, y * cell);
        mesh.receiveShadow = true;
        mesh.castShadow = t.terrain === 'wall' || t.terrain === 'tower' || t.height >= 2;
        mesh.userData = { x, y, tile: t };
        this.mapGroup.add(mesh);
        this.tileMeshes.set(`${x},${y}`, mesh);

        if (t.terrain === 'bridge') {
          const water = new THREE.Mesh(
            new THREE.BoxGeometry(cell * 0.98, 0.14, cell * 0.98),
            new THREE.MeshPhysicalMaterial({
              color: 0x1e5a8a,
              transparent: true,
              opacity: 0.7,
              roughness: 0.2,
            })
          );
          water.position.set(x * cell, 0.07, y * cell);
          this.mapGroup.add(water);
        }
      }
    }

    // Simple castle keep decoration
    const keep = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.5, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x7a756c, roughness: 0.85 })
    );
    keep.position.set(2.5, 2.2, 2.5);
    keep.castShadow = true;
    this.mapGroup.add(keep);

    this.lookAt.set((map.width - 1) / 2, 0.5, (map.height - 1) / 2);
    this._updateCamera();
  }

  /**
   * @param {import('../core/ct.js').Unit[]} units
   * @param {import('../core/grid.js').GridMap} map
   */
  syncUnits(units, map) {
    const live = new Set();
    for (const u of units) {
      live.add(u.id);
      let mesh = this.unitMeshes.get(u.id);
      if (!mesh) {
        mesh = buildUnitMesh(u, u.team);
        this.scene.add(mesh);
        this.unitMeshes.set(u.id, mesh);
      }
      // Ash KO: stay hidden forever after dissolve (do not revive corpse on refresh)
      if (mesh.userData.ashed) {
        mesh.visible = false;
        continue;
      }
      // Keep KO meshes visible only while ash animation plays
      const koUntil = mesh.userData.koUntil || 0;
      const koAnimating = !u.alive && performance.now() < koUntil;
      mesh.visible = u.alive || koAnimating;
      if (!u.alive && !koAnimating && koUntil > 0 && !mesh.userData.ashed) {
        // Animation finished without ashed flag — hide permanently
        mesh.visible = false;
        mesh.userData.ashed = true;
      }
      const tile = map.tiles[u.y]?.[u.x];
      let h = tile ? tile.height * 0.48 + 0.22 : 0.22;
      if (tile?.terrain === 'water') h = 0.08;
      if (tile?.terrain === 'bridge') h = 0.35;
      const baseY = h;
      if (!mesh.userData.fallen && !mesh.userData.ashed) mesh.userData.baseY = baseY;
      // Don't snap position while walking/attack/ko anims control mesh
      const animSt = this.unitAnims.get(u.id);
      const walking = animSt && animSt.anim === 'move' && performance.now() < animSt.until;
      const koBusy = mesh.userData.fallen || koAnimating || mesh.userData.ashed;
      if (!walking && !koBusy) {
        if (!animSt || animSt.anim === 'idle' || performance.now() >= (animSt?.until || 0)) {
          mesh.position.set(u.x, baseY, u.y);
        }
      }
      // Always keep logical facing on userData; only snap visual when idle
      if (!mesh.userData.ashed) {
        setUnitFacing(mesh, u.facing, { applyNow: !this.unitAnims.has(u.id) });
      }
      // Charging glow — never reset scale after ash
      if (mesh.userData.ashed) {
        /* leave scale from dissolve */
      } else if (u.charging) {
        mesh.scale.setScalar(1.08);
      } else if (!this.unitAnims.has(u.id) || this.unitAnims.get(u.id).anim !== 'summon') {
        mesh.scale.setScalar(1);
      }
    }
    for (const [id, mesh] of this.unitMeshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.unitMeshes.delete(id);
        this.unitAnims.delete(id);
      }
    }
  }

  /**
   * Play a short presentation anim on a unit.
   * @param {string} unitId
   * @param {'move'|'attack'|'cast'|'summon'|'hit'} anim
   * @param {number} [ms=600]
   */
  playAnim(unitId, anim, ms = 600) {
    this.unitAnims.set(unitId, { anim, until: performance.now() + ms });
    // Cast/summon pose rings only — hit sparks must NOT fire here (would hit attacker).
    // Hit sparks: battle-presentation on hp damage events for the struck unit.
    if (anim === 'cast' || anim === 'summon') {
      this.spawnCastFx(unitId, anim === 'summon');
    }
  }

  /**
   * Walk one grid step with interpolation (FFT-like locomotion).
   * @param {string} unitId
   * @param {{x:number,y:number}} from
   * @param {{x:number,y:number}} to
   * @param {import('../core/grid.js').GridMap} map
   * @param {number} ms
   */
  animateUnitStep(unitId, from, to, map, ms = 280) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return Promise.resolve();
    this.unitAnims.set(unitId, { anim: 'move', until: performance.now() + ms + 50 });
    const tileH = (x, y) => {
      const t = map.tiles[y]?.[x];
      if (!t) return 0.22;
      if (t.terrain === 'water') return 0.08;
      if (t.terrain === 'bridge') return 0.35;
      return t.height * 0.48 + 0.22;
    };
    const y0 = tileH(from.x, from.y);
    const y1 = tileH(to.x, to.y);
    const start = performance.now();
    // Face movement direction
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) mesh.rotation.y = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    else mesh.rotation.y = dy >= 0 ? 0 : Math.PI;
    mesh.userData.baseFacingY = mesh.rotation.y;

    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - start) / ms);
        const s = u * u * (3 - 2 * u); // smoothstep
        mesh.position.x = from.x + (to.x - from.x) * s;
        mesh.position.z = from.y + (to.y - from.y) * s;
        mesh.position.y = y0 + (y1 - y0) * s + Math.sin(u * Math.PI) * 0.08;
        mesh.userData.baseY = mesh.position.y;
        if (u < 1) requestAnimationFrame(step);
        else {
          mesh.position.set(to.x, y1, to.y);
          mesh.userData.baseY = y1;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Project unit world position to screen coords relative to canvas parent.
   * @param {string} unitId
   */
  getUnitScreenPos(unitId) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return null;
    const v = mesh.position.clone();
    v.y += 0.9;
    v.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    // convert to float-layer local if layer is full viewport overlay
    return { x: x - rect.left, y: y - rect.top, world: mesh.position };
  }

  spawnSpellBurst(unitId, abilityId = '') {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return;
    const id = String(abilityId);
    let color = 0x66ccff;
    if (id.includes('fire') || id.includes('ifrit') || id.includes('firaga') || id.includes('magma')) color = 0xff4400;
    if (id.includes('ice') || id.includes('shiva')) color = 0x88ddff;
    if (id.includes('bolt') || id.includes('thund')) color = 0xffee44;
    if (id.includes('cure') || id.includes('moogle') || id.includes('holy')) color = 0xeeffaa;
    if (id.includes('summon')) {
      // multi-ring spectacle
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.3 + i * 0.25, 0.04, 8, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
          );
          ring.position.copy(mesh.position);
          ring.position.y += 0.4;
          ring.rotation.x = Math.PI / 2;
          this.fxGroup.add(ring);
          const t0 = performance.now();
          const anim = () => {
            const u = (performance.now() - t0) / 900;
            if (u >= 1) {
              this.fxGroup.remove(ring);
              return;
            }
            ring.scale.setScalar(1 + u * 2);
            ring.material.opacity = 0.85 * (1 - u);
            ring.position.y = mesh.position.y + 0.4 + u * 1.2;
            requestAnimationFrame(anim);
          };
          anim();
        }, i * 120);
      }
      // pillars
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.35, 2.5, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })
      );
      pillar.position.copy(mesh.position);
      pillar.position.y += 1.2;
      this.fxGroup.add(pillar);
      setTimeout(() => this.fxGroup.remove(pillar), 700);
      return;
    }
    // fireball / spell orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    orb.position.copy(mesh.position);
    orb.position.y += 1.0;
    this.fxGroup.add(orb);
    const t0 = performance.now();
    const anim = () => {
      const u = (performance.now() - t0) / 500;
      if (u >= 1) {
        this.fxGroup.remove(orb);
        // ground flash
        const flash = new THREE.Mesh(
          new THREE.CircleGeometry(0.8, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        flash.rotation.x = -Math.PI / 2;
        flash.position.copy(mesh.position);
        flash.position.y += 0.15;
        this.fxGroup.add(flash);
        setTimeout(() => this.fxGroup.remove(flash), 300);
        return;
      }
      orb.position.y = mesh.position.y + 1.0 + Math.sin(u * Math.PI) * 0.5;
      orb.scale.setScalar(1 + u);
      requestAnimationFrame(anim);
    };
    anim();
  }

  playKo(unitId) {
    return this.playAshKo(unitId, 900);
  }

  /**
   * KO: body crumbles into ash particles (FFT-style death).
   * @param {string} unitId
   * @param {number} [ms=1600]
   */
  playAshKo(unitId, ms = 1600) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return Promise.resolve();
    mesh.visible = true;
    mesh.userData.koUntil = performance.now() + ms + 200;
    mesh.userData.fallen = false;
    this.unitAnims.set(unitId, { anim: 'hit', until: performance.now() + ms });

    // Ash particle cloud
    const particles = [];
    for (let i = 0; i < 28; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.05, 4, 4),
        new THREE.MeshBasicMaterial({
          color: 0x9a9a9a,
          transparent: true,
          opacity: 0.9,
        })
      );
      p.position.copy(mesh.position);
      p.position.y += 0.3 + Math.random() * 0.5;
      p.userData.vx = (Math.random() - 0.5) * 0.02;
      p.userData.vy = 0.01 + Math.random() * 0.025;
      p.userData.vz = (Math.random() - 0.5) * 0.02;
      this.fxGroup.add(p);
      particles.push(p);
    }

    const t0 = performance.now();
    const base = mesh.userData.baseY || 0.4;
    return new Promise((resolve) => {
      const anim = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        mesh.visible = true;
        // collapse + fade body
        mesh.rotation.z = (Math.PI / 2) * Math.min(1, u * 1.2);
        mesh.position.y = base * (1 - u * 0.7);
        mesh.scale.setScalar(Math.max(0.05, 1 - u));
        mesh.traverse((o) => {
          if (o.material && o.material.opacity != null) {
            o.material.transparent = true;
            o.material.opacity = Math.max(0, 1 - u);
          }
        });
        for (const p of particles) {
          p.position.x += p.userData.vx;
          p.position.y += p.userData.vy;
          p.position.z += p.userData.vz;
          p.material.opacity = 0.9 * (1 - u);
        }
        if (u < 1) {
          requestAnimationFrame(anim);
        } else {
          for (const p of particles) this.fxGroup.remove(p);
          mesh.visible = false;
          mesh.userData.fallen = true;
          mesh.userData.ashed = true;
          resolve();
        }
      };
      anim();
    });
  }

  /**
   * Spell burst at a map tile (impact point for CT resolve).
   * @param {number} x
   * @param {number} y
   * @param {string} abilityId
   * @param {import('../core/grid.js').GridMap} map
   */
  spawnSpellBurstAtTile(x, y, abilityId = '', map = null) {
    let h = 0.3;
    if (map?.tiles?.[y]?.[x]) {
      const t = map.tiles[y][x];
      h = t.terrain === 'water' ? 0.12 : t.terrain === 'bridge' ? 0.4 : t.height * 0.48 + 0.3;
    }
    // Temporary unit-less mesh anchor at tile
    const anchorId = `__tile_${x}_${y}`;
    let anchor = this.unitMeshes.get(anchorId);
    if (!anchor) {
      anchor = new THREE.Group();
      this.scene.add(anchor);
      this.unitMeshes.set(anchorId, anchor);
    }
    anchor.position.set(x, h, y);
    this.spawnSpellBurst(anchorId, abilityId);
    setTimeout(() => {
      this.scene.remove(anchor);
      this.unitMeshes.delete(anchorId);
    }, 1200);
  }

  spawnCastFx(unitId, big = false) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return;
    const geo = new THREE.RingGeometry(0.2, big ? 0.7 : 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: big ? 0xff6600 : 0x66ccff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(mesh.position);
    ring.position.y += 0.1;
    this.fxGroup.add(ring);
    const start = performance.now();
    const tick = () => {
      const u = (performance.now() - start) / 800;
      if (u >= 1) {
        this.fxGroup.remove(ring);
        return;
      }
      ring.scale.setScalar(1 + u * (big ? 2.5 : 1.2));
      mat.opacity = 0.7 * (1 - u);
      requestAnimationFrame(tick);
    };
    tick();
  }

  spawnHitFx(unitId) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return;
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffee88 })
    );
    spark.position.copy(mesh.position);
    spark.position.y += 0.6;
    this.fxGroup.add(spark);
    setTimeout(() => this.fxGroup.remove(spark), 200);
  }

  clearRanges() {
    for (const m of this.rangeMeshes) this.scene.remove(m);
    this.rangeMeshes = [];
  }

  /**
   * @param {{x:number,y:number}[]} tiles
   * @param {number} color
   * @param {import('../core/grid.js').GridMap} map
   */
  showRange(tiles, color, map) {
    for (const t of tiles) {
      const tile = map.tiles[t.y]?.[t.x];
      let h = tile ? tile.height * 0.48 + 0.24 : 0.24;
      if (tile?.terrain === 'water') h = 0.16;
      if (tile?.terrain === 'bridge') h = 0.38;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.05, 0.9),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
        })
      );
      mesh.position.set(t.x, h, t.y);
      this.scene.add(mesh);
      this.rangeMeshes.push(mesh);
    }
  }

  /**
   * Consume click-suppression flag (true once after a camera drag/pinch).
   * Pure helper used by pickTile; exported logic also tested via consumeClickSuppression.
   */
  consumeClickSuppression() {
    return consumeClickSuppression(this);
  }

  pickTile(event) {
    // pointerup clears _drag before click — use durable suppression flag
    if (this.consumeClickSuppression()) return null;
    if (this._drag?.moved) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.mapGroup.children, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData?.tile) o = o.parent;
      if (o?.userData?.tile) return { x: o.userData.x, y: o.userData.y };
    }
    return null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._anim = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      const now = performance.now();
      for (const [id, mesh] of this.unitMeshes) {
        const st = this.unitAnims.get(id);
        if (st && now < st.until) {
          tickUnitAnim(mesh, st.anim, dt);
        } else {
          if (st) {
            // Anim ended — restore facing/weapon so attack spin does not stick
            resetUnitAnimPose(mesh);
            this.unitAnims.delete(id);
          }
          tickUnitAnim(mesh, 'idle', dt);
        }
      }
      // gentle water shimmer
      for (const [, mesh] of this.tileMeshes) {
        if (mesh.userData?.tile?.terrain === 'water' && mesh.material?.opacity != null) {
          mesh.material.opacity = 0.75 + Math.sin(now * 0.003 + mesh.position.x) * 0.06;
        }
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this._anim) cancelAnimationFrame(this._anim);
    window.removeEventListener('keydown', this._onKey);
  }

  paintStats() {
    const kits = [...this.unitMeshes.values()].map((m) => m.userData?.kitId).filter(Boolean);
    return {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      children: this.scene.children.length,
      mapChildren: this.mapGroup.children.length,
      unitKits: kits,
      distinctKits: new Set(kits).size,
      camera: this.getCameraState(),
      brand: 'Final Fantasy Knockoff',
    };
  }
}
