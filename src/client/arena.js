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

/** Prior zoom min was 5; closer zoom allowed for turn focus */
export const ZOOM_MIN = 2.5;
export const ZOOM_MAX = 36;
export const ZOOM_DEFAULT = 14;
export const ZOOM_INTRO_WIDE = 26;

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

    this.zoom = ZOOM_DEFAULT;
    this.rotY = Math.PI / 4;
    this.rotX = Math.PI / 5.2;
    this.lookAt = new THREE.Vector3(8, 0.5, 8);
    this._minPolar = 0.25;
    this._maxPolar = Math.PI / 2.15;
    this._cameraTween = null;
    this._activeHighlight = null;
    this._activeTileMesh = null;
    this._castBannerEl = null;

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
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom + delta));
    this._updateCamera();
  }

  /**
   * Smoothly animate camera lookAt / angles / zoom.
   * @param {{ lookAt?: {x:number,y:number,z:number}, rotY?: number, rotX?: number, zoom?: number }} target
   * @param {number} [ms=900]
   */
  animateCameraTo(target, ms = 900) {
    const from = {
      lookAt: this.lookAt.clone(),
      rotY: this.rotY,
      rotX: this.rotX,
      zoom: this.zoom,
    };
    const to = {
      lookAt: target.lookAt
        ? new THREE.Vector3(target.lookAt.x, target.lookAt.y ?? 0.5, target.lookAt.z)
        : from.lookAt.clone(),
      rotY: target.rotY ?? from.rotY,
      rotX: target.rotX ?? from.rotX,
      zoom: target.zoom ?? from.zoom,
    };
    // Shortest angle delta for rotY
    let dY = to.rotY - from.rotY;
    while (dY > Math.PI) dY -= Math.PI * 2;
    while (dY < -Math.PI) dY += Math.PI * 2;
    const t0 = performance.now();
    this._cameraTween = { from, to, dY, t0, ms };
    return new Promise((resolve) => {
      const step = () => {
        if (!this._cameraTween || this._cameraTween.t0 !== t0) {
          resolve();
          return;
        }
        const u = Math.min(1, (performance.now() - t0) / ms);
        const s = u * u * (3 - 2 * u);
        this.lookAt.lerpVectors(from.lookAt, to.lookAt, s);
        this.rotY = from.rotY + dY * s;
        this.rotX = from.rotX + (to.rotX - from.rotX) * s;
        this.zoom = from.zoom + (to.zoom - from.zoom) * s;
        this._updateCamera();
        if (u < 1) requestAnimationFrame(step);
        else {
          this._cameraTween = null;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Center camera on unit, front-facing (camera looks at unit from their facing direction).
   * @param {string} unitId
   * @param {{ facing?: string, zoom?: number, ms?: number }} [opts]
   */
  focusOnUnit(unitId, opts = {}) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return Promise.resolve();
    const facing = opts.facing || mesh.userData?.facing || 'S';
    // Place camera opposite to facing so unit appears front-facing in view
    const faceYaw = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 };
    const unitYaw = faceYaw[facing] ?? 0;
    // Camera azimuth so we look toward the unit's face
    const rotY = unitYaw + Math.PI; // look from in front
    // Closer than prior 6.5 default, still above ZOOM_MIN
    const zoom = opts.zoom ?? 4.2;
    return this.animateCameraTo(
      {
        lookAt: { x: mesh.position.x, y: (mesh.userData.baseY || mesh.position.y) + 0.4, z: mesh.position.z },
        rotY,
        rotX: Math.PI / 5.5,
        zoom,
      },
      opts.ms ?? 850
    );
  }

  /**
   * Wide arena shot → zoom/autorotate onto first actor (~battle intro).
   * @param {{ width: number, height: number }} map
   * @param {string} firstUnitId
   * @param {string} [facing]
   * @param {number} [ms]
   */
  async playBattleIntro(map, firstUnitId, facing = 'S', ms = 4200) {
    const cx = (map.width - 1) / 2;
    const cz = (map.height - 1) / 2;
    this.lookAt.set(cx, 0.5, cz);
    this.rotY = Math.PI / 4;
    this.rotX = Math.PI / 4.2;
    this.zoom = ZOOM_INTRO_WIDE;
    this._updateCamera();
    // Slow orbit while still wide
    const orbitMs = Math.floor(ms * 0.45);
    const t0 = performance.now();
    await new Promise((resolve) => {
      const spin = () => {
        const u = Math.min(1, (performance.now() - t0) / orbitMs);
        this.rotY = Math.PI / 4 + u * 0.55;
        this._updateCamera();
        if (u < 1) requestAnimationFrame(spin);
        else resolve();
      };
      requestAnimationFrame(spin);
    });
    await this.focusOnUnit(firstUnitId, { facing, zoom: 5.5, ms: Math.floor(ms * 0.5) });
  }

  /**
   * Highlight active unit mesh + tile underfoot.
   * @param {string|null} unitId
   * @param {import('../core/grid.js').GridMap} [map]
   * @param {{x:number,y:number}|null} [tile]
   */
  setActiveHighlight(unitId, map = null, tile = null) {
    // Clear previous
    if (this._activeHighlight) {
      this.scene.remove(this._activeHighlight);
      this._activeHighlight = null;
    }
    if (this._activeTileMesh) {
      this.scene.remove(this._activeTileMesh);
      this._activeTileMesh = null;
    }
    // Restore ring opacity on units
    for (const [, mesh] of this.unitMeshes) {
      if (mesh.userData?._teamRing) {
        mesh.userData._teamRing.material.opacity = 0.55;
        mesh.userData._teamRing.scale.setScalar(1);
      }
    }
    if (!unitId) return;
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return;

    // Pulsing gold ring around unit
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(mesh.position);
    ring.position.y = (mesh.userData.baseY || mesh.position.y) + 0.06;
    this.scene.add(ring);
    this._activeHighlight = ring;
    mesh.userData._activeRing = ring;

    // Bright tile under unit
    const tx = tile?.x ?? Math.round(mesh.position.x);
    const ty = tile?.y ?? Math.round(mesh.position.z);
    let h = 0.28;
    if (map?.tiles?.[ty]?.[tx]) {
      const t = map.tiles[ty][tx];
      h = t.terrain === 'water' ? 0.18 : t.terrain === 'bridge' ? 0.42 : t.height * 0.48 + 0.28;
    }
    const tileMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.98, 0.08, 0.98),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    tileMesh.position.set(tx, h, ty);
    this.scene.add(tileMesh);
    this._activeTileMesh = tileMesh;
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

  _spellColor(abilityId = '') {
    const id = String(abilityId);
    if (id.includes('fire') || id.includes('ifrit') || id.includes('firaga') || id.includes('magma')) return 0xff4400;
    if (id.includes('ice') || id.includes('shiva')) return 0x88ddff;
    if (id.includes('bolt') || id.includes('thund')) return 0xffee44;
    if (id.includes('cure') || id.includes('moogle') || id.includes('holy')) return 0xeeffaa;
    return 0x66ccff;
  }

  /**
   * @param {string} unitId
   * @param {string} [abilityId]
   * @param {{ intensity?: number, arenaWide?: boolean, rings?: number }|null} [spectacle]
   */
  spawnSpellBurst(unitId, abilityId = '', spectacle = null) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh) return;
    const color = this._spellColor(abilityId);
    const intensity = spectacle?.intensity ?? 1;
    const rings = spectacle?.rings ?? (String(abilityId).includes('summon') ? 4 : 2);
    const arenaWide = spectacle?.arenaWide || String(abilityId).includes('summon');

    if (arenaWide || String(abilityId).includes('summon') || rings >= 4) {
      for (let i = 0; i < rings; i++) {
        setTimeout(() => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.35 + i * 0.28 * intensity, 0.05, 8, 28),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
          );
          ring.position.copy(mesh.position);
          ring.position.y += 0.4;
          ring.rotation.x = Math.PI / 2;
          this.fxGroup.add(ring);
          const t0 = performance.now();
          const anim = () => {
            const u = (performance.now() - t0) / (1000 + intensity * 200);
            if (u >= 1) {
              this.fxGroup.remove(ring);
              return;
            }
            ring.scale.setScalar(1 + u * (2.5 + intensity));
            ring.material.opacity = 0.9 * (1 - u);
            ring.position.y = mesh.position.y + 0.4 + u * 1.5 * intensity;
            requestAnimationFrame(anim);
          };
          anim();
        }, i * 100);
      }
      const pillarH = 2.2 + intensity * 1.2;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * intensity, 0.4 * intensity, pillarH, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
      );
      pillar.position.copy(mesh.position);
      pillar.position.y += pillarH * 0.45;
      this.fxGroup.add(pillar);
      setTimeout(() => this.fxGroup.remove(pillar), 900 + intensity * 200);
      if (arenaWide) {
        // Arena-wide ground wave
        const wave = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 1.2, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        );
        wave.rotation.x = -Math.PI / 2;
        wave.position.copy(mesh.position);
        wave.position.y += 0.12;
        this.fxGroup.add(wave);
        const t0 = performance.now();
        const anim = () => {
          const u = (performance.now() - t0) / 1400;
          if (u >= 1) {
            this.fxGroup.remove(wave);
            return;
          }
          wave.scale.setScalar(1 + u * 14);
          wave.material.opacity = 0.55 * (1 - u);
          requestAnimationFrame(anim);
        };
        anim();
      }
      return;
    }
    // Standard spell orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + 0.06 * intensity, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    orb.position.copy(mesh.position);
    orb.position.y += 1.0;
    this.fxGroup.add(orb);
    const t0 = performance.now();
    const anim = () => {
      const u = (performance.now() - t0) / (550 + intensity * 120);
      if (u >= 1) {
        this.fxGroup.remove(orb);
        const flash = new THREE.Mesh(
          new THREE.CircleGeometry(0.7 + intensity * 0.35, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        flash.rotation.x = -Math.PI / 2;
        flash.position.copy(mesh.position);
        flash.position.y += 0.15;
        this.fxGroup.add(flash);
        setTimeout(() => this.fxGroup.remove(flash), 350 + intensity * 80);
        return;
      }
      orb.position.y = mesh.position.y + 1.0 + Math.sin(u * Math.PI) * 0.55 * intensity;
      orb.scale.setScalar(1 + u * intensity);
      requestAnimationFrame(anim);
    };
    anim();
  }

  /**
   * Grander magic / summon FX scaled by spectacle (MP cost).
   * @param {string} casterId
   * @param {string} abilityId
   * @param {{ intensity: number, arenaWide: boolean, rings: number }} spectacle
   * @param {import('../core/grid.js').GridMap} map
   * @param {{x:number,y:number}|null} [target]
   */
  spawnMagicSpectacle(casterId, abilityId, spectacle, map, target = null) {
    if (!spectacle) return;
    const mesh = this.unitMeshes.get(casterId);
    if (mesh) this.spawnSpellBurst(casterId, abilityId, spectacle);
    if (target) this.spawnSpellBurstAtTile(target.x, target.y, abilityId, map, spectacle);
    if (spectacle.arenaWide && map) {
      // Sky beam over map center
      const cx = (map.width - 1) / 2;
      const cz = (map.height - 1) / 2;
      const color = this._spellColor(abilityId);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 1.2, 8, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
      );
      beam.position.set(cx, 4, cz);
      this.fxGroup.add(beam);
      const t0 = performance.now();
      const anim = () => {
        const u = (performance.now() - t0) / 1600;
        if (u >= 1) {
          this.fxGroup.remove(beam);
          return;
        }
        beam.material.opacity = 0.4 * (1 - u);
        beam.scale.y = 1 + u * 0.4;
        requestAnimationFrame(anim);
      };
      anim();
    }
  }

  /**
   * Bow & arrow projectile along arc from unit to tile.
   * @param {string} unitId
   * @param {{x:number,y:number}} target
   * @param {import('../core/grid.js').GridMap} map
   * @param {number} [ms=1200]
   */
  spawnArrowProjectile(unitId, target, map, ms = 1200) {
    const mesh = this.unitMeshes.get(unitId);
    if (!mesh || !target) return Promise.resolve();
    let h1 = 0.5;
    if (map?.tiles?.[target.y]?.[target.x]) {
      const t = map.tiles[target.y][target.x];
      h1 = t.terrain === 'water' ? 0.2 : t.terrain === 'bridge' ? 0.45 : t.height * 0.48 + 0.35;
    }
    const start = mesh.position.clone();
    start.y += 0.7;
    const end = new THREE.Vector3(target.x, h1 + 0.4, target.y);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.28, 6),
      new THREE.MeshBasicMaterial({ color: 0xe8d5a3 })
    );
    arrow.position.copy(start);
    this.fxGroup.add(arrow);
    // Trail dots
    const trails = [];
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.7 })
      );
      this.fxGroup.add(d);
      trails.push(d);
    }
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        const s = u;
        const x = start.x + (end.x - start.x) * s;
        const z = start.z + (end.z - start.z) * s;
        const y = start.y + (end.y - start.y) * s + Math.sin(s * Math.PI) * 1.1;
        arrow.position.set(x, y, z);
        // Point along velocity approx
        const nx = end.x - start.x;
        const nz = end.z - start.z;
        arrow.rotation.y = Math.atan2(nx, nz);
        arrow.rotation.x = -Math.PI / 2 + Math.cos(s * Math.PI) * 0.5;
        for (let i = 0; i < trails.length; i++) {
          const tu = Math.max(0, s - (i + 1) * 0.06);
          trails[i].position.set(
            start.x + (end.x - start.x) * tu,
            start.y + (end.y - start.y) * tu + Math.sin(tu * Math.PI) * 1.1,
            start.z + (end.z - start.z) * tu
          );
          trails[i].material.opacity = 0.7 * (1 - i / trails.length) * (1 - s);
        }
        if (u < 1) requestAnimationFrame(step);
        else {
          this.fxGroup.remove(arrow);
          for (const d of trails) this.fxGroup.remove(d);
          // Impact spark
          const spark = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffee88 })
          );
          spark.position.copy(end);
          this.fxGroup.add(spark);
          setTimeout(() => this.fxGroup.remove(spark), 220);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Optional DOM banner for cast name (parent may provide float layer via container).
   * @param {string} name
   * @param {number} [ms=2000]
   */
  showCastBanner(name, ms = 2000) {
    const host = this.container?.parentElement;
    if (!host || !name) return;
    let el = host.querySelector('.cast-name-banner');
    if (!el) {
      el = document.createElement('div');
      el.className = 'cast-name-banner';
      host.appendChild(el);
    }
    el.textContent = name;
    el.classList.add('show');
    clearTimeout(this._castBannerT);
    this._castBannerT = setTimeout(() => el.classList.remove('show'), ms);
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
    // Revive visibility if a prior refresh hid the corpse early
    mesh.visible = true;
    mesh.userData.ashed = false;
    mesh.userData.fallen = false;
    mesh.userData.koUntil = performance.now() + ms + 400;
    mesh.scale.setScalar(1);
    this.unitAnims.set(unitId, { anim: 'hit', until: performance.now() + ms });

    // Clone materials so fade does not break other units sharing mats
    mesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
      }
    });

    // Dense ash particle cloud
    const particles = [];
    for (let i = 0; i < 42; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.035 + Math.random() * 0.06, 4, 4),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x666666 : 0xaaaaaa,
          transparent: true,
          opacity: 0.95,
        })
      );
      p.position.copy(mesh.position);
      p.position.y += 0.2 + Math.random() * 0.7;
      p.position.x += (Math.random() - 0.5) * 0.25;
      p.position.z += (Math.random() - 0.5) * 0.25;
      p.userData.vx = (Math.random() - 0.5) * 0.03;
      p.userData.vy = 0.012 + Math.random() * 0.03;
      p.userData.vz = (Math.random() - 0.5) * 0.03;
      this.fxGroup.add(p);
      particles.push(p);
    }

    const t0 = performance.now();
    const base = mesh.userData.baseY || mesh.position.y || 0.4;
    return new Promise((resolve) => {
      const anim = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        mesh.visible = true;
        mesh.rotation.z = (Math.PI / 2) * Math.min(1, u * 1.25);
        mesh.position.y = base * (1 - u * 0.75);
        mesh.scale.setScalar(Math.max(0.04, 1 - u));
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
          p.material.opacity = 0.95 * (1 - u);
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
   * Screen/board shake for arena-wide residual FX.
   * @param {number} [ms=500]
   * @param {number} [amp=0.12]
   */
  shakeCamera(ms = 500, amp = 0.12) {
    const origin = this.lookAt.clone();
    const t0 = performance.now();
    const step = () => {
      const u = (performance.now() - t0) / ms;
      if (u >= 1) {
        this.lookAt.copy(origin);
        this._updateCamera();
        return;
      }
      const a = amp * (1 - u);
      this.lookAt.set(
        origin.x + (Math.random() - 0.5) * a * 2,
        origin.y + (Math.random() - 0.5) * a,
        origin.z + (Math.random() - 0.5) * a * 2
      );
      this._updateCamera();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * Procedural summon creature silhouette at target, then impact.
   * @param {object} creature from resolveSummonCreature
   * @param {{x:number,y:number}} target
   * @param {import('../core/grid.js').GridMap} map
   * @param {number} [ms=1400]
   */
  spawnSummonCreature(creature, target, map, ms = 1400) {
    if (!creature || !target) return Promise.resolve();
    let h = 0.4;
    if (map?.tiles?.[target.y]?.[target.x]) {
      const t = map.tiles[target.y][target.x];
      h = t.terrain === 'water' ? 0.15 : t.terrain === 'bridge' ? 0.45 : t.height * 0.48 + 0.35;
    }
    const root = new THREE.Group();
    root.position.set(target.x, h, target.y);
    const color = creature.color ?? 0xaa66ff;
    const secondary = creature.secondary ?? 0xffee88;
    const ht = creature.height ?? 1.5;
    // Body
    if (creature.silhouette === 'beast') {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      body.position.y = ht * 0.35;
      body.scale.set(1.2, 0.9, 1.4);
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 8),
        new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.95 })
      );
      head.position.set(0, ht * 0.7, 0.25);
      head.rotation.x = Math.PI / 2;
      root.add(body, head);
    } else if (creature.silhouette === 'cute') {
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      body.position.y = ht * 0.4;
      const pom = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: secondary })
      );
      pom.position.y = ht * 0.75;
      root.add(body, pom);
    } else {
      // humanoid / ethereal
      const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, ht * 0.45, 4, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      torso.position.y = ht * 0.45;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.95 })
      );
      head.position.y = ht * 0.85;
      root.add(torso, head);
    }
    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    root.add(ring);
    this.fxGroup.add(root);
    root.scale.setScalar(0.2);
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        if (u < 0.35) {
          root.scale.setScalar(0.2 + (u / 0.35) * 0.9);
          root.position.y = h + (1 - u / 0.35) * 1.2;
        } else if (u < 0.7) {
          root.scale.setScalar(1.1 + Math.sin(u * 20) * 0.08);
          root.rotation.y = u * 4;
        } else {
          root.scale.setScalar(1.1 * (1 - (u - 0.7) / 0.3));
          root.traverse((o) => {
            if (o.material?.opacity != null) o.material.opacity = 0.9 * (1 - (u - 0.7) / 0.3);
          });
        }
        if (u < 1) requestAnimationFrame(step);
        else {
          this.fxGroup.remove(root);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Spell bolt from caster to target tile (direct hit).
   */
  spawnSpellProjectile(fromUnitId, target, map, color = 0x66ccff, ms = 700) {
    const mesh = this.unitMeshes.get(fromUnitId);
    if (!mesh || !target) return Promise.resolve();
    let h1 = 0.5;
    if (map?.tiles?.[target.y]?.[target.x]) {
      const t = map.tiles[target.y][target.x];
      h1 = t.terrain === 'water' ? 0.2 : t.terrain === 'bridge' ? 0.45 : t.height * 0.48 + 0.4;
    }
    const start = mesh.position.clone();
    start.y += 0.8;
    const end = new THREE.Vector3(target.x, h1, target.y);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    orb.position.copy(start);
    this.fxGroup.add(orb);
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        const s = u * u * (3 - 2 * u);
        orb.position.lerpVectors(start, end, s);
        orb.position.y += Math.sin(s * Math.PI) * 0.5;
        if (u < 1) requestAnimationFrame(step);
        else {
          this.fxGroup.remove(orb);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Residual ambient FX: smoke, debris, explosions around a point (arena-wide layer).
   */
  spawnResidualFx(x, y, map, color = 0xff8844, intensity = 1) {
    let h = 0.3;
    if (map?.tiles?.[y]?.[x]) {
      const t = map.tiles[y][x];
      h = t.terrain === 'water' ? 0.15 : t.height * 0.48 + 0.3;
    }
    // Smoke puffs
    for (let i = 0; i < 6 + Math.floor(intensity * 3); i++) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.45 })
      );
      smoke.position.set(x + (Math.random() - 0.5) * 2.5 * intensity, h + 0.3, y + (Math.random() - 0.5) * 2.5 * intensity);
      this.fxGroup.add(smoke);
      const t0 = performance.now();
      const anim = () => {
        const u = (performance.now() - t0) / 900;
        if (u >= 1) {
          this.fxGroup.remove(smoke);
          return;
        }
        smoke.position.y += 0.012;
        smoke.scale.setScalar(1 + u * 2);
        smoke.material.opacity = 0.45 * (1 - u);
        requestAnimationFrame(anim);
      };
      anim();
    }
    // Debris sparks
    for (let i = 0; i < 8; i++) {
      const d = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color })
      );
      d.position.set(x, h + 0.4, y);
      d.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.04 + Math.random() * 0.05, (Math.random() - 0.5) * 0.08);
      this.fxGroup.add(d);
      const t0 = performance.now();
      const anim = () => {
        const u = (performance.now() - t0) / 700;
        if (u >= 1) {
          this.fxGroup.remove(d);
          return;
        }
        d.position.add(d.userData.v);
        d.userData.v.y -= 0.003;
        d.material.opacity = 1 - u;
        d.material.transparent = true;
        requestAnimationFrame(anim);
      };
      anim();
    }
    // Ground explosion ring
    const boom = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.5, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    boom.rotation.x = -Math.PI / 2;
    boom.position.set(x, h + 0.05, y);
    this.fxGroup.add(boom);
    const t0 = performance.now();
    const anim = () => {
      const u = (performance.now() - t0) / 600;
      if (u >= 1) {
        this.fxGroup.remove(boom);
        return;
      }
      boom.scale.setScalar(1 + u * 5 * intensity);
      boom.material.opacity = 0.7 * (1 - u);
      requestAnimationFrame(anim);
    };
    anim();
  }

  /**
   * Full ability FX plan: direct target hit + optional creature + residual/shake.
   * @param {import('./fx-plan.js').planAbilityFx extends Function} plan
   */
  async playAbilityFxPlan(plan, casterId, target, map, impactUnitIds = []) {
    if (!plan) return;
    // Direct projectile toward target
    if (plan.projectile && target && casterId && !plan.summon) {
      await this.spawnSpellProjectile(casterId, target, map, plan.color, 550);
    }
    // Unique summon creature at target
    if (plan.creature && target) {
      void this.spawnSummonCreature(plan.creature, target, map, 1500);
    }
    // Direct hits on each impact unit
    for (const id of impactUnitIds) {
      this.spawnSpellBurst(id, plan.abilityId, {
        intensity: plan.intensity,
        arenaWide: false,
        rings: plan.summon ? 4 : 2,
      });
      this.spawnHitFx(id);
      this.playAnim(id, 'hit', 700);
    }
    if (target) {
      this.spawnSpellBurstAtTile(target.x, target.y, plan.abilityId, map, {
        intensity: plan.intensity,
        arenaWide: false,
        rings: 3,
      });
    }
    // Residual ambient layer when arena-wide / high intensity
    if (plan.residual && target) {
      this.spawnResidualFx(target.x, target.y, map, plan.color, plan.intensity);
      // Secondary residual at map center for whole-board feel
      if (map) {
        this.spawnResidualFx((map.width - 1) / 2, (map.height - 1) / 2, map, plan.color, plan.intensity * 0.7);
      }
    }
    if (plan.shake) this.shakeCamera(plan.summon ? 700 : 450, plan.summon ? 0.2 : 0.12);
  }

  /**
   * Spell burst at a map tile (impact point for CT resolve).
   * @param {number} x
   * @param {number} y
   * @param {string} abilityId
   * @param {import('../core/grid.js').GridMap} map
   */
  spawnSpellBurstAtTile(x, y, abilityId = '', map = null, spectacle = null) {
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
    this.spawnSpellBurst(anchorId, abilityId, spectacle);
    setTimeout(() => {
      this.scene.remove(anchor);
      this.unitMeshes.delete(anchorId);
    }, 1600);
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
    // Multi-spark hurt flash
    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 6, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6644 : 0xffee88 })
      );
      spark.position.copy(mesh.position);
      spark.position.y += 0.55 + Math.random() * 0.25;
      spark.position.x += (Math.random() - 0.5) * 0.35;
      spark.position.z += (Math.random() - 0.5) * 0.35;
      this.fxGroup.add(spark);
      setTimeout(() => this.fxGroup.remove(spark), 280 + i * 40);
    }
    // Brief red tint flash
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.35 })
    );
    flash.position.copy(mesh.position);
    flash.position.y += 0.5;
    this.fxGroup.add(flash);
    setTimeout(() => this.fxGroup.remove(flash), 220);
  }

  clearRanges() {
    for (const m of this.rangeMeshes) this.scene.remove(m);
    this.rangeMeshes = [];
  }

  /**
   * @param {{x:number,y:number}[]} tiles
   * @param {number} color
   * @param {import('../core/grid.js').GridMap} map
   * @param {number} [opacity=0.48]
   */
  showRange(tiles, color, map, opacity = 0.48) {
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
          opacity,
          depthWrite: false,
        })
      );
      mesh.position.set(t.x, h, t.y);
      this.scene.add(mesh);
      this.rangeMeshes.push(mesh);
    }
  }

  /**
   * Range cells + AoE effect cells (distinct colors) before confirm.
   * @param {{x:number,y:number}[]} rangeTiles
   * @param {{x:number,y:number}[]} aoeTiles
   * @param {import('../core/grid.js').GridMap} map
   */
  showRangeAndAoe(rangeTiles, aoeTiles, map) {
    this.clearRanges();
    const aoeSet = new Set((aoeTiles || []).map((t) => `${t.x},${t.y}`));
    const rangeOnly = (rangeTiles || []).filter((t) => !aoeSet.has(`${t.x},${t.y}`));
    this.showRange(rangeOnly, 0xef4444, map, 0.4);
    this.showRange(aoeTiles || [], 0xfbbf24, map, 0.62);
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
    return this.hoverTile(event);
  }

  /** Raycast tile under pointer without consuming click suppression (hover preview). */
  hoverTile(event) {
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
      // Pulse active unit highlight
      if (this._activeHighlight) {
        const s = 1 + Math.sin(now * 0.008) * 0.12;
        this._activeHighlight.scale.set(s, s, s);
        this._activeHighlight.material.opacity = 0.75 + Math.sin(now * 0.01) * 0.2;
      }
      if (this._activeTileMesh) {
        this._activeTileMesh.material.opacity = 0.4 + Math.sin(now * 0.009) * 0.15;
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
