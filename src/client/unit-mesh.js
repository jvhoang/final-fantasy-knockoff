/**
 * Roblox-style blocky modular avatars — head/face expressions + equip pieces.
 * Procedural only (no Roblox/SE assets).
 */
import * as THREE from 'three';
import { resolveAvatarKit, FACE_EXPRESSIONS } from '../content/avatar-kit.js';

/**
 * Build a Roblox-like blocky humanoid for a unit.
 * @param {import('../core/ct.js').Unit} unit
 * @param {string} team
 */
export function buildUnitMesh(unit, team) {
  const kit = resolveAvatarKit(unit, team);
  const root = new THREE.Group();
  root.userData = {
    unitId: unit.id,
    kitId: kit.kitId,
    style: 'roblox-blocky',
    expression: kit.expression,
    weaponAttach: kit.weaponAttach,
    armorType: kit.armorType,
    gender: kit.gender,
    fingerprint: kit.fingerprint,
    weaponId: unit.weaponId,
    armorId: unit.armorId,
    accessoryId: unit.accessoryId,
    anim: 'idle',
    animT: 0,
    parts: {},
  };

  const bulk = (kit.armorVisual?.bulk ?? 1) * (kit.gender === 'f' ? 0.94 : 1);
  const teamTint = team === 'player' ? 0x1d4ed8 : 0xb91c1c;
  const skin = kit.gender === 'f' ? 0xf5c6a8 : 0xe8b896;
  const limb = mat(skin, 0.15);
  const shirt = mat(kit.primaryColor, 0.25);
  const pants = mat(kit.secondaryColor, 0.3);

  // —— Legs (blocky R6-like) ——
  const legGeo = new THREE.BoxGeometry(0.16 * bulk, 0.36 * bulk, 0.16 * bulk);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.name = 'legL';
  legL.position.set(-0.1 * bulk, 0.18 * bulk, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.name = 'legR';
  legR.position.set(0.1 * bulk, 0.18 * bulk, 0);
  root.add(legL, legR);

  // —— Torso ——
  let torsoW = 0.42 * bulk;
  let torsoH = 0.4 * bulk;
  let torsoD = 0.22 * bulk;
  if (kit.armorVisual?.plate || kit.bodyStyle === 'heavy') {
    torsoW *= 1.12;
    torsoD *= 1.15;
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), shirt);
  torso.name = 'torso';
  torso.position.y = 0.48 * bulk;
  root.add(torso);

  // Armor plate accents
  if (kit.armorVisual?.plate) {
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 0.95, torsoH * 0.35, torsoD * 1.08),
      mat(kit.secondaryColor, 0.55)
    );
    chest.name = 'armorChest';
    chest.position.set(0, 0.08, 0.02);
    torso.add(chest);
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), mat(0x94a3b8, 0.6));
    padL.position.set(-torsoW * 0.55, torsoH * 0.35, 0);
    const padR = padL.clone();
    padR.position.x *= -1;
    torso.add(padL, padR);
  } else if (kit.armorType === 'robe' || kit.armorType === 'mage_robe') {
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 1.05, 0.22, torsoD * 1.1),
      mat(kit.primaryColor, 0.2)
    );
    skirt.name = 'robeSkirt';
    skirt.position.y = -torsoH * 0.45;
    torso.add(skirt);
  }

  // —— Arms ——
  const armGeo = new THREE.BoxGeometry(0.14 * bulk, 0.36 * bulk, 0.14 * bulk);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.name = 'armL';
  armL.position.set(-torsoW * 0.55 - 0.06, 0.48 * bulk, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.name = 'armR';
  armR.position.set(torsoW * 0.55 + 0.06, 0.48 * bulk, 0);
  // Hands
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), limb);
  handL.name = 'handL';
  handL.position.y = -0.2 * bulk;
  armL.add(handL);
  const handR = handL.clone();
  handR.name = 'handR';
  armR.add(handR);
  root.add(armL, armR);

  // —— Head + face ——
  const headSize = 0.28 * bulk * (kit.gender === 'f' ? 0.95 : 1);
  const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), limb);
  head.name = 'head';
  head.position.y = 0.78 * bulk;
  root.add(head);

  // Face panel (front of head)
  const face = buildFaceMesh(kit.expression, headSize);
  face.name = 'face';
  face.position.set(0, 0, headSize * 0.51);
  head.add(face);

  // Hair block
  const hairColor = kit.gender === 'f' ? 0x4a3728 : kit.secondaryColor;
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(headSize * 1.05, headSize * 0.45, headSize * 1.05),
    mat(hairColor, 0.2)
  );
  hair.name = 'hair';
  hair.position.y = headSize * 0.35;
  head.add(hair);

  if (kit.helmet) {
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 1.12, headSize * 0.55, headSize * 1.12),
      mat(kit.secondaryColor, 0.55)
    );
    helm.name = 'helmet';
    helm.position.y = headSize * 0.28;
    head.add(helm);
  }

  // Accessory (hat/orb/ring above head or on torso)
  if (kit.accessoryTint != null) {
    const acc = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.12),
      mat(kit.accessoryTint, 0.5)
    );
    acc.name = 'accessory';
    acc.position.set(0, headSize * 0.65, 0);
    head.add(acc);
  }

  if (kit.cape) {
    const cape = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 0.9, 0.45, 0.04),
      mat(teamTint, 0.2)
    );
    cape.name = 'cape';
    cape.position.set(0, 0.42 * bulk, -0.14);
    root.add(cape);
  }

  // Team ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.28, 20),
    new THREE.MeshBasicMaterial({ color: teamTint, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'teamRing';
  root.add(ring);
  root.userData._teamRing = ring;

  // Weapon
  const weapon = buildWeaponMesh(kit.weaponAttach, kit.weaponVisual);
  weapon.name = 'weapon';
  attachWeapon(weapon, kit.weaponAttach, armR, torsoW, bulk);
  root.add(weapon);

  // Shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.name = 'shadow';
  root.add(shadow);

  root.userData.parts = {
    head,
    face,
    torso,
    armL,
    armR,
    legL,
    legR,
    weapon,
  };

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return root;
}

/**
 * @param {string} expression
 * @param {number} headSize
 */
function buildFaceMesh(expression, headSize) {
  const g = new THREE.Group();
  g.name = 'face';
  const w = headSize * 0.85;
  const h = headSize * 0.85;
  // Face plate
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: 0xffe4d0, side: THREE.DoubleSide })
  );
  g.add(plate);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const eyeGeo = new THREE.CircleGeometry(headSize * 0.07, 10);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-headSize * 0.16, headSize * 0.08, 0.01);
  eyeR.position.set(headSize * 0.16, headSize * 0.08, 0.01);
  g.add(eyeL, eyeR);

  // Mouth by expression
  let mouth;
  if (expression === 'smile') {
    mouth = new THREE.Mesh(
      new THREE.TorusGeometry(headSize * 0.12, headSize * 0.025, 6, 12, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -headSize * 0.12, 0.01);
  } else if (expression === 'determined') {
    mouth = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.22, headSize * 0.03, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    );
    mouth.position.set(0, -headSize * 0.14, 0.01);
    // Brow
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.45, headSize * 0.025, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    );
    brow.position.set(0, headSize * 0.18, 0.01);
    g.add(brow);
  } else if (expression === 'wink') {
    eyeR.scale.set(1, 0.15, 1);
    mouth = new THREE.Mesh(
      new THREE.CircleGeometry(headSize * 0.06, 10),
      new THREE.MeshBasicMaterial({ color: 0xcc4466 })
    );
    mouth.position.set(0, -headSize * 0.14, 0.01);
  } else if (expression === 'cool') {
    // Sunglasses
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.55, headSize * 0.12, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    glass.position.set(0, headSize * 0.08, 0.02);
    g.add(glass);
    mouth = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.14, headSize * 0.025, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    mouth.position.set(0, -headSize * 0.14, 0.01);
  } else {
    // neutral
    mouth = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.16, headSize * 0.03, 0.01),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    mouth.position.set(0, -headSize * 0.14, 0.01);
  }
  mouth.name = 'mouth';
  g.add(mouth);
  return g;
}

function attachWeapon(weapon, attach, armR, torsoW, bulk) {
  if (attach === 'bow') {
    weapon.position.set(-0.22 * bulk, 0.5 * bulk, -0.08);
  } else if (attach === 'staff' || attach === 'rod') {
    weapon.position.set(torsoW * 0.55 + 0.1, 0.35 * bulk, 0.05);
  } else if (attach === 'fist') {
    weapon.position.set(torsoW * 0.55 + 0.12, 0.38 * bulk, 0.08);
  } else if (attach === 'spear') {
    weapon.position.set(torsoW * 0.55 + 0.1, 0.4 * bulk, 0.05);
  } else {
    // sword / default — in right hand
    weapon.position.set(torsoW * 0.55 + 0.12, 0.38 * bulk, 0.06);
  }
}

function mat(color, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness: Math.max(0.25, 0.85 - metalness * 0.4),
  });
}

function buildWeaponMesh(attach, weaponVisual) {
  const g = new THREE.Group();
  const color = weaponVisual?.color ?? 0xcccccc;
  const m = mat(color, 0.65);

  if (attach === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 14, Math.PI), m);
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
  } else if (attach === 'staff' || attach === 'rod') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.65, 0.05), m);
    shaft.position.y = 0.2;
    const orb = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      mat(attach === 'rod' ? 0xef4444 : 0xfbbf24, 0.35)
    );
    orb.position.y = 0.55;
    g.add(shaft, orb);
  } else if (attach === 'axe') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), m);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.06), m);
    head.position.set(0.08, 0.2, 0);
    g.add(shaft, head);
  } else if (attach === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), m);
    blade.position.y = 0.1;
    g.add(blade);
  } else if (attach === 'fist') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), m));
  } else if (attach === 'spear') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.04), m);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), m);
    tip.position.y = 0.42;
    g.add(shaft, tip);
  } else {
    // sword — longer block blade + crossguard for close-up detail
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.025), m);
    blade.position.y = 0.22;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.05), mat(0xca8a04, 0.5));
    guard.position.y = -0.02;
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), mat(0x5c4033, 0.2));
    hilt.position.y = -0.1;
    g.add(blade, guard, hilt);
  }
  return g;
}

const FACE_YAW = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 };

/**
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

export function attackYawOffset(baseYaw, animT) {
  const swing = Math.sin(Math.min(animT * 5.5, Math.PI)) * 0.42;
  return baseYaw + swing;
}

export function resetUnitAnimPose(mesh) {
  if (!mesh) return;
  const weapon = mesh.getObjectByName?.('weapon') || mesh.userData?.parts?.weapon;
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
 * @param {THREE.Group} mesh
 * @param {string} anim
 * @param {number} dt
 */
export function tickUnitAnim(mesh, anim, dt) {
  if (!mesh) return;
  if (typeof mesh.userData.baseFacingY !== 'number') {
    mesh.userData.baseFacingY = mesh.rotation.y || 0;
  }
  if (mesh.userData.anim !== anim) {
    mesh.userData.animT = 0;
  }
  mesh.userData.anim = anim;
  mesh.userData.animT = (mesh.userData.animT || 0) + dt;
  const t = mesh.userData.animT;
  const weapon = mesh.getObjectByName?.('weapon') || mesh.userData?.parts?.weapon || null;
  const baseY = mesh.userData.baseY ?? 0;
  const baseYaw = mesh.userData.baseFacingY;
  const legL = mesh.getObjectByName?.('legL');
  const legR = mesh.getObjectByName?.('legR');
  const armL = mesh.getObjectByName?.('armL');
  const armR = mesh.getObjectByName?.('armR');

  mesh.rotation.z = 0;
  mesh.position.y = baseY;

  if (anim === 'idle') {
    // FFT / Roblox march-in-place
    mesh.rotation.y = baseYaw;
    const step = Math.abs(Math.sin(t * 7.5));
    mesh.position.y = baseY + step * 0.05;
    mesh.rotation.z = Math.sin(t * 7.5) * 0.05;
    if (weapon) {
      weapon.rotation.z = 0;
      weapon.rotation.x = 0;
    }
    if (legL) legL.rotation.x = Math.sin(t * 7.5) * 0.35;
    if (legR) legR.rotation.x = -Math.sin(t * 7.5) * 0.35;
    if (armL) armL.rotation.x = -Math.sin(t * 7.5) * 0.25;
    if (armR) armR.rotation.x = Math.sin(t * 7.5) * 0.25;
  } else if (anim === 'move') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + Math.abs(Math.sin(t * 10)) * 0.06;
    mesh.rotation.z = Math.sin(t * 10) * 0.08;
    if (legL) legL.rotation.x = Math.sin(t * 12) * 0.55;
    if (legR) legR.rotation.x = -Math.sin(t * 12) * 0.55;
  } else if (anim === 'attack') {
    const phase = Math.min(t * 5.5, Math.PI * 1.15);
    mesh.rotation.y = attackYawOffset(baseYaw, t);
    mesh.rotation.z = Math.sin(phase) * 0.18;
    mesh.position.y = baseY + Math.sin(Math.min(phase, Math.PI)) * 0.06;
    if (weapon) {
      weapon.rotation.z = -Math.sin(phase) * 1.65;
      weapon.rotation.x = Math.sin(phase * 0.8) * 0.35;
    }
    if (armR) armR.rotation.x = -Math.sin(phase) * 1.2;
  } else if (anim === 'cast') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + 0.1 + Math.sin(t * 6) * 0.04;
    mesh.rotation.z = Math.sin(t * 3) * 0.05;
    if (weapon) weapon.rotation.x = -0.4 + Math.sin(t * 5) * 0.55;
    if (armR) armR.rotation.x = -0.8 + Math.sin(t * 4) * 0.3;
  } else if (anim === 'summon') {
    mesh.rotation.y = baseYaw;
    mesh.position.y = baseY + 0.18 + Math.sin(t * 7) * 0.07;
    mesh.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    if (weapon) weapon.rotation.x = Math.sin(t * 6) * 0.7;
  } else if (anim === 'hit') {
    mesh.rotation.y = baseYaw;
    mesh.rotation.z = Math.sin(t * 18) * 0.28;
    mesh.rotation.x = -0.12 + Math.sin(t * 14) * 0.08;
    mesh.position.y = baseY + Math.abs(Math.sin(t * 16)) * 0.04;
    mesh.scale.setScalar(0.94 + Math.sin(t * 20) * 0.03);
  }
}

export { FACE_EXPRESSIONS };
