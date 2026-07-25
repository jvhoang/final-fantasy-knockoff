/**
 * Procedural job-unique unit meshes with visible weapons/armor (original, no SE rips).
 */
import * as THREE from 'three';
import { resolveUnitVisual } from '../content/visual-kits.js';

/**
 * Build a distinct humanoid group for a unit.
 * @param {import('../core/ct.js').Unit} unit
 * @param {string} team
 */
export function buildUnitMesh(unit, team) {
  const vis = resolveUnitVisual(unit.jobId, unit.weaponId, unit.armorId, unit.gender || 'm');
  const root = new THREE.Group();
  root.userData = {
    unitId: unit.id,
    kitId: vis.kitId,
    weaponAttach: vis.weaponAttach,
    armorType: vis.armorType,
    gender: vis.gender,
    anim: 'idle',
    animT: 0,
  };

  const bulk = (vis.armorVisual?.bulk ?? 1) * (vis.gender === 'f' ? 0.95 : 1);
  const teamTint = team === 'player' ? 0x1d4ed8 : 0xb91c1c;
  const skin = vis.gender === 'f' ? 0xf0c8b0 : 0xe8c4a8;

  // Legs
  const legMat = mat(vis.primaryColor, 0.4);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * bulk, 0.22, 3, 6), legMat);
  legL.position.set(-0.09, 0.2, 0);
  const legR = legL.clone();
  legR.position.x = 0.09;
  root.add(legL, legR);

  // Torso — style by bodyStyle
  let torso;
  const torsoH = 0.35 * bulk;
  if (vis.bodyStyle === 'heavy' || vis.armorVisual?.plate) {
    torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.38 * bulk, torsoH, 0.22 * bulk),
      mat(vis.primaryColor, 0.55)
    );
    // shoulder plates
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.12),
      mat(vis.secondaryColor, 0.6)
    );
    pad.position.set(-0.22 * bulk, torsoH * 0.35, 0);
    const pad2 = pad.clone();
    pad2.position.x *= -1;
    torso.add(pad, pad2);
  } else if (vis.bodyStyle === 'robe' || vis.bodyStyle === 'mystic' || vis.armorVisual?.skirt) {
    torso = new THREE.Mesh(
      new THREE.ConeGeometry(0.28 * bulk, torsoH * 1.3, 8),
      mat(vis.primaryColor, 0.35)
    );
    torso.rotation.x = Math.PI; // flare down
    torso.position.y = 0.15;
  } else {
    torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14 * bulk, 0.22, 4, 8),
      mat(vis.primaryColor, 0.35)
    );
  }
  torso.position.y = 0.48;
  root.add(torso);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.11 * bulk, 10, 10),
    mat(skin, 0.2)
  );
  head.position.y = 0.78 * bulk;
  root.add(head);
  // Hair / bangs for identity
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * bulk, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(vis.gender === 'f' ? 0x4a3728 : vis.secondaryColor, 0.5)
  );
  hair.position.y = 0.84 * bulk;
  root.add(hair);

  if (vis.helmet) {
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.125 * bulk, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(vis.secondaryColor, 0.65)
    );
    helm.position.y = 0.82 * bulk;
    root.add(helm);
  }

  if (vis.cape) {
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32 * bulk, 0.45),
      new THREE.MeshStandardMaterial({
        color: teamTint,
        side: THREE.DoubleSide,
        roughness: 0.7,
      })
    );
    cape.position.set(0, 0.5, -0.14);
    cape.rotation.x = 0.15;
    root.add(cape);
  }

  // Team badge ring under feet
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.24, 16),
    new THREE.MeshBasicMaterial({ color: teamTint, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'teamRing';
  root.add(ring);
  root.userData._teamRing = ring;
  root.userData.weaponId = unit.weaponId;
  root.userData.armorId = unit.armorId;

  // Weapon — color/shape follows equipped item (Blood Sword, bows, etc.)
  const weapon = buildWeaponMesh(vis.weaponAttach, vis.weaponVisual);
  weapon.name = 'weapon';
  weapon.position.set(0.22, 0.5, 0.05);
  if (vis.weaponAttach === 'bow') {
    weapon.position.set(-0.18, 0.48, -0.05);
  } else if (vis.weaponAttach === 'staff' || vis.weaponAttach === 'rod') {
    weapon.position.set(0.18, 0.35, 0);
  } else if (vis.weaponAttach === 'fist') {
    weapon.position.set(0.2, 0.45, 0.1);
  } else if (vis.weaponAttach === 'spear') {
    weapon.position.set(0.2, 0.4, 0.05);
  }
  root.add(weapon);

  // Shadow blob
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  root.add(shadow);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return root;
}

function mat(color, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness: 1 - metalness * 0.5,
  });
}

function buildWeaponMesh(attach, weaponVisual) {
  const g = new THREE.Group();
  const color = weaponVisual?.color ?? 0xcccccc;
  const m = mat(color, 0.7);

  if (attach === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 12, Math.PI), m);
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
  } else if (attach === 'staff' || attach === 'rod') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6), m);
    shaft.position.y = 0.2;
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      mat(attach === 'rod' ? 0xef4444 : 0xfbbf24, 0.3)
    );
    orb.position.y = 0.55;
    g.add(shaft, orb);
  } else if (attach === 'axe') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.45, 6), m);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), m);
    head.position.set(0.08, 0.2, 0);
    g.add(shaft, head);
  } else if (attach === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), m);
    blade.position.y = 0.1;
    g.add(blade);
  } else if (attach === 'fist') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m));
  } else if (attach === 'spear') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), m);
    tip.position.y = 0.42;
    g.add(shaft, tip);
  } else {
    // sword
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), m);
    blade.position.y = 0.2;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), mat(0xca8a04, 0.5));
    guard.position.y = -0.02;
    g.add(blade, guard);
  }
  return g;
}

const FACE_YAW = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 };

/**
 * Store and optionally apply cardinal facing (does not accumulate spin).
 * @param {THREE.Object3D} mesh
 * @param {string} facing
 * @param {{ applyNow?: boolean }} [opts]
 */
export function setUnitFacing(mesh, facing, opts = {}) {
  if (!mesh) return;
  const yaw = FACE_YAW[facing] ?? mesh.userData.baseFacingY ?? 0;
  mesh.userData.baseFacingY = yaw;
  mesh.userData.facing = facing;
  if (opts.applyNow !== false) {
    mesh.rotation.y = yaw;
  }
}

/**
 * Temporary attack yaw offset from base facing (no permanent accumulation).
 * @param {number} baseYaw
 * @param {number} animT seconds into anim
 */
export function attackYawOffset(baseYaw, animT) {
  // Body yaw stays within a small envelope (weapon carries the big swing arc)
  const swing = Math.sin(Math.min(animT * 5.5, Math.PI)) * 0.42;
  return baseYaw + swing;
}

/**
 * Clear weapon/body pose after attack/cast and snap to base facing.
 * @param {THREE.Object3D} mesh
 */
export function resetUnitAnimPose(mesh) {
  if (!mesh) return;
  const weapon = mesh.getObjectByName?.('weapon') || mesh.children?.find?.((c) => c.name === 'weapon');
  if (weapon) {
    weapon.rotation.x = 0;
    weapon.rotation.y = 0;
    weapon.rotation.z = 0;
  }
  mesh.rotation.z = 0;
  mesh.rotation.x = 0;
  if (typeof mesh.userData.baseFacingY === 'number') {
    mesh.rotation.y = mesh.userData.baseFacingY;
  }
  mesh.scale.setScalar(1);
  mesh.userData.animT = 0;
  mesh.userData.anim = 'idle';
}

/**
 * Tick procedural animation pose.
 * @param {THREE.Group} mesh
 * @param {string} anim idle|move|attack|cast|summon|hit
 * @param {number} dt
 */
export function tickUnitAnim(mesh, anim, dt) {
  if (!mesh) return;
  if (typeof mesh.userData.baseFacingY !== 'number') {
    mesh.userData.baseFacingY = mesh.rotation.y || 0;
  }
  // New anim name resets phase
  if (mesh.userData.anim !== anim) {
    mesh.userData.animT = 0;
  }
  mesh.userData.anim = anim;
  mesh.userData.animT = (mesh.userData.animT || 0) + dt;
  const t = mesh.userData.animT;
  const weapon = mesh.getObjectByName?.('weapon') || null;
  const baseY = mesh.userData.baseY ?? 0;
  const baseYaw = mesh.userData.baseFacingY;

  mesh.rotation.z = 0;
  mesh.position.y = baseY;

  if (anim === 'idle') {
    // FFT-like march-in-place: bounce + slight body sway (weapon stays sheathed-stable)
    mesh.rotation.y = baseYaw;
    const step = Math.abs(Math.sin(t * 7.5));
    mesh.position.y = baseY + step * 0.055;
    mesh.rotation.z = Math.sin(t * 7.5) * 0.06;
    if (weapon) {
      weapon.rotation.z = 0;
      weapon.rotation.x = 0;
    }
    // Legs pulse via scale on first children if present
    if (mesh.children?.[0]?.scale && mesh.children?.[1]?.scale) {
      mesh.children[0].scale.y = 1 + step * 0.08;
      mesh.children[1].scale.y = 1 + (1 - step) * 0.08;
    }
  } else if (anim === 'move') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + Math.abs(Math.sin(t * 10)) * 0.06;
    mesh.rotation.z = Math.sin(t * 10) * 0.08;
  } else if (anim === 'attack') {
    // Longer, readable sword swing (body lean + weapon arc)
    const phase = Math.min(t * 5.5, Math.PI * 1.15);
    mesh.rotation.y = attackYawOffset(baseYaw, t);
    mesh.rotation.z = Math.sin(phase) * 0.18;
    mesh.position.y = baseY + Math.sin(Math.min(phase, Math.PI)) * 0.06;
    if (weapon) {
      weapon.rotation.z = -Math.sin(phase) * 1.65;
      weapon.rotation.x = Math.sin(phase * 0.8) * 0.35;
      if (weapon.position) weapon.position.y = 0.5 + Math.sin(phase) * 0.08;
    }
  } else if (anim === 'cast') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + 0.1 + Math.sin(t * 6) * 0.04;
    mesh.rotation.z = Math.sin(t * 3) * 0.05;
    if (weapon) {
      weapon.rotation.x = -0.4 + Math.sin(t * 5) * 0.55;
      if (weapon.position) weapon.position.y = 0.55 + Math.sin(t * 4) * 0.06;
    }
  } else if (anim === 'summon') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + 0.18 + Math.sin(t * 7) * 0.07;
    mesh.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    if (weapon) weapon.rotation.x = Math.sin(t * 6) * 0.7;
  } else if (anim === 'hit') {
    // Visible hurt: flinch, lean back, slight shrink
    mesh.rotation.y = baseYaw;
    mesh.rotation.z = Math.sin(t * 18) * 0.28;
    mesh.rotation.x = -0.12 + Math.sin(t * 14) * 0.08;
    mesh.position.y = baseY + Math.abs(Math.sin(t * 16)) * 0.04;
    mesh.scale.setScalar(0.94 + Math.sin(t * 20) * 0.03);
  }
}
