// models.js — stylized low-poly roguelite characters (capsules/spheres/cones), toon-shaded.
// Pure construction only (no game state). Animation lives in main.js and reads `parts`.
import * as THREE from 'three';

const _mat = {};
let _grad;
function gradient() {
  if (!_grad) {
    const d = new Uint8Array([70, 150, 215, 255]);           // 4-step cel ramp
    _grad = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
    _grad.minFilter = _grad.magFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  }
  return _grad;
}
function mat(color) {
  if (!_mat[color]) {
    _mat[color] = new THREE.MeshLambertMaterial({ 
      color, 
      side: THREE.DoubleSide 
    });
  }
  return _mat[color];
}
function glow(color) { 
  return new THREE.MeshBasicMaterial({ 
    color, 
    side: THREE.DoubleSide 
  }); 
}

function sphere(r, m, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), m); o.scale.set(sx, sy, sz); return o;
}
function capMesh(r, len, m) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 14), m); }

// limb group pivoting at its TOP (shoulder/hip) so rotation.x swings it
function limb(r, len, m, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const o = capMesh(r, len, m); o.position.y = -(len / 2 + r); g.add(o);
  return g;
}

// ---- weapons ----
export function buildWeapon(kind) {
  const g = new THREE.Group();
  if (kind === 'sword') {
    const blade = capMesh(0.1, 1.35, mat(0xe2e7ee)); blade.position.y = 0.95; blade.scale.set(1.5, 1, 0.5);
    const guard = capMesh(0.08, 0.4, mat(0x6b4a2a)); guard.rotation.z = Math.PI / 2; guard.position.y = 0.14;
    const grip = capMesh(0.07, 0.26, mat(0x3a2a1a)); grip.position.y = -0.12;
    g.add(blade, guard, grip);
  } else if (kind === 'bow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 8, 20, Math.PI * 1.1), mat(0x7a5a2a));
    arc.rotation.z = Math.PI / 2;
    const string = capMesh(0.02, 1.2, mat(0xeef0f2)); string.position.x = 0.28;
    g.add(arc, string);
  } else {
    const rod = capMesh(0.06, 0.86, mat(0x4a3a2a)); rod.position.y = 0.12;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), glow(0xc49bff)); orb.position.y = 0.64;
    g.add(rod, orb); g.userData.orb = orb;
  }
  return g;
}

// ---- stylized humanoid (player, zombie, skeleton) ----
function humanoid(cfg) {
  const group = new THREE.Group();
  const skinM = mat(cfg.skin), torsoM = mat(cfg.torso), legM = mat(cfg.leg);
  const ar = cfg.thin ? 0.1 : 0.12, lr = cfg.thin ? 0.13 : 0.15;
  const legL = limb(lr, 0.46, legM, -0.16, 0.8, 0);
  const legR = limb(lr, 0.46, legM, 0.16, 0.8, 0);
  const torso = capMesh(0.3, 0.52, torsoM); torso.position.y = 1.22; torso.scale.set(cfg.thin ? 0.9 : 1.15, 1, 0.8);
  const armL = limb(ar, 0.5, skinM, -0.42, 1.62, 0);
  const armR = limb(ar, 0.5, skinM, 0.42, 1.62, 0);
  const head = sphere(0.34, skinM); head.position.y = 2.0;
  const eyeM = mat(0x16161e);
  const eL = sphere(0.065, eyeM); eL.position.set(-0.13, 0.03, 0.3); head.add(eL);
  const eR = sphere(0.065, eyeM); eR.position.set(0.13, 0.03, 0.3); head.add(eR);
  group.add(legL, legR, torso, armL, armR, head);
  return { group, parts: { legL, legR, torso, armL, armR, head }, tint: [torsoM, skinM], walk: 'biped', phase: Math.random() * 6.28 };
}

const CLASS_PAL = {
  knight: { skin: 0xd8a07a, torso: 0x9aa0aa, leg: 0x3b4250 },
  archer: { skin: 0xd8a07a, torso: 0x3f7a3a, leg: 0x5a4632 },
  mage:   { skin: 0xc7a9ff, torso: 0x5a3a9a, leg: 0x3a2a6a },
};

export function buildPlayer(cls, weaponKind) {
  const group = new THREE.Group();
  const parts = { weaponKind };

  // Helper for quick box/cylinder mesh
  const box = (w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };
  const cyl = (rt, rb, h, seg, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  };

  if (cls === 'knight') {
    // =========================================================================
    // IMPERIUN: The Royal Sovereign (Radiant Gold Plate Armour & Crimson Mantle)
    // =========================================================================
    const goldP = mat(0xffd700);        // Shining radiant primary gold plate
    const goldHi = mat(0xffea38);       // Bright polished gold highlights & trim
    const goldDk = mat(0xb48c1e);       // Deep burnished gold rivets & shadows
    const rubyMat = mat(0xdc2626);      // Royal crimson mantle & crest
    const blueGlow = glow(0x38bdf8);    // Divine sapphire visor & chest core

    // 1. TORSO & WAIST (Armored Cuirass, Tassets & Pauldrons)
    const torso = new THREE.Group();
    torso.position.set(0, 1.22, 0);

    // Heavy Golden Breastplate & Backplate
    const cuirass = box(0.92, 0.78, 0.72, goldP, 0, 0.04, 0);
    const chestPlate = box(0.84, 0.44, 0.76, goldHi, 0, 0.16, 0.02);
    const gorget = cyl(0.42, 0.48, 0.22, 10, goldHi, 0, 0.44, 0);
    const coreGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), blueGlow);
    coreGem.position.set(0, 0.16, 0.41);
    torso.add(cuirass, chestPlate, gorget, coreGem);

    // Golden Armored Belt
    const belt = box(0.94, 0.18, 0.74, goldDk, 0, -0.32, 0);
    const buckle = box(0.28, 0.24, 0.78, goldHi, 0, -0.32, 0);
    const buckleGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), rubyMat);
    buckleGem.position.set(0, -0.32, 0.41);
    torso.add(belt, buckle, buckleGem);

    // 4 Hanging Flared Tasset Plates (Armored Skirt over hips)
    const tassetFront = box(0.38, 0.46, 0.12, goldHi, 0, -0.52, 0.36, 0.2, 0, 0);
    const tassetBack  = box(0.38, 0.46, 0.12, goldP, 0, -0.52, -0.36, -0.2, 0, 0);
    const tassetL     = box(0.12, 0.46, 0.44, goldHi, -0.46, -0.52, 0, 0, 0, 0.2);
    const tassetR     = box(0.12, 0.46, 0.44, goldHi, 0.46, -0.52, 0, 0, 0, -0.2);
    torso.add(tassetFront, tassetBack, tassetL, tassetR);

    // Massive Tiered Golden Pauldrons (Flared Shoulder Guards)
    const mantleShoulders = box(1.58, 0.24, 0.74, goldHi, 0, 0.44, 0);
    torso.add(mantleShoulders);

    for (const side of [-1, 1]) {
      const pauldron = new THREE.Group();
      pauldron.position.set(side * 0.72, 0.46, 0);
      pauldron.rotation.z = side * -0.24;
      const p1 = box(0.56, 0.36, 0.62, goldHi, 0, 0, 0);
      const p2 = box(0.62, 0.16, 0.66, goldDk, 0, 0.12, 0);
      const pRivet = box(0.14, 0.14, 0.68, rubyMat, 0, 0.14, 0);
      pauldron.add(p1, p2, pRivet);
      torso.add(pauldron);
    }

    // Volumetric Billowing Royal Crimson Cape with Gold Embroidered Border
    const capeGroup = new THREE.Group();
    capeGroup.position.set(0, 0.42, -0.38);
    capeGroup.rotation.x = 0.24;
    const capeClasp = box(1.12, 0.18, 0.22, goldHi, 0, 0, 0);
    const capeBody  = box(1.08, 1.62, 0.09, rubyMat, 0, -0.84, -0.06);
    const capeHem   = box(1.14, 0.16, 0.12, goldHi, 0, -1.64, -0.06);
    capeGroup.add(capeClasp, capeBody, capeHem);
    torso.add(capeGroup);

    // 2. HEAD (Royal Golden Greathelm, Visor & Crimson Plume)
    const head = new THREE.Group();
    head.position.set(0, 2.0, 0);

    const helm = box(0.82, 0.84, 0.84, goldP, 0, 0.04, 0);
    const browRim = box(0.88, 0.22, 0.88, goldHi, 0, 0.12, 0.02);
    const jawGuard = box(0.84, 0.36, 0.44, goldDk, 0, -0.22, 0.22);
    const visor = box(0.66, 0.14, 0.2, blueGlow, 0, 0.06, 0.44); // Glowing Blue Visor

    // Majestic Golden Winged Horns on Helmet
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 4), goldHi);
      wing.position.set(side * 0.48, 0.32, -0.12);
      wing.rotation.set(-0.35, 0, side * -0.75);
      head.add(wing);
    }
    // High-Standing Royal Crimson Plume Crest
    const plume = box(0.16, 0.55, 1.02, rubyMat, 0, 0.58, -0.02);
    head.add(helm, browRim, jawGuard, visor, plume);

    // 3. ARMS & GAUNTLETS
    const armL = new THREE.Group(); armL.position.set(-0.52, 1.62, 0);
    const armR = new THREE.Group(); armR.position.set(0.52, 1.62, 0);

    for (const [arm, side] of [[armL, -1], [armR, 1]]) {
      const bicep = box(0.32, 0.38, 0.32, goldP, 0, -0.19, 0);
      const elbow = box(0.36, 0.16, 0.36, goldHi, 0, -0.36, 0);
      const gauntlet = box(0.38, 0.44, 0.38, goldP, 0, -0.58, 0);
      const cuff = box(0.42, 0.14, 0.42, goldHi, 0, -0.42, 0);
      arm.add(bicep, elbow, gauntlet, cuff);
    }

    // Heavy Golden Sovereign Kite Shield on Left Arm
    const shield = new THREE.Group();
    shield.position.set(0, -0.38, 0.28);
    shield.rotation.y = 0.25;
    const sBody = box(0.88, 1.35, 0.12, rubyMat, 0, 0, 0);
    const sRim  = box(0.94, 1.42, 0.08, goldHi, 0, 0, 0);
    const sCross = box(0.32, 1.1, 0.16, goldHi, 0, 0, 0.02);
    const sCrossH = box(0.72, 0.28, 0.16, goldHi, 0, 0.18, 0.02);
    const sBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), blueGlow);
    sBoss.position.set(0, 0.18, 0.12);
    shield.add(sBody, sRim, sCross, sCrossH, sBoss);
    armL.add(shield);

    // Golden Sovereign Broadsword on Right Arm
    const sword = new THREE.Group();
    sword.position.set(0, -0.76, 0.22);
    sword.rotation.x = 0.35;
    const blade = box(0.26, 1.48, 0.09, mat(0xf8fafc), 0, 0.82, 0);
    const bladeGoldRim = box(0.3, 1.48, 0.05, goldHi, 0, 0.82, 0);
    const fullerRune = box(0.08, 1.25, 0.11, blueGlow, 0, 0.82, 0);
    const guard = box(0.72, 0.16, 0.22, goldHi, 0, 0.08, 0);
    const guardGem = box(0.12, 0.18, 0.24, rubyMat, 0, 0.08, 0);
    const grip = cyl(0.06, 0.06, 0.34, 8, goldDk, 0, -0.16, 0);
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), goldHi);
    pommel.position.set(0, -0.36, 0);
    sword.add(blade, bladeGoldRim, fullerRune, guard, guardGem, grip, pommel);
    armR.add(sword);
    parts.weapon = sword;

    armR.rotation.x = -1.15;
    armL.rotation.x = -0.95;

    // 4. LEGS, GREAVES & ARMORED BOOTS (SABATONS)
    const legL = new THREE.Group(); legL.position.set(-0.22, 0.8, 0);
    const legR = new THREE.Group(); legR.position.set(0.22, 0.8, 0);

    for (const leg of [legL, legR]) {
      const thigh = box(0.34, 0.36, 0.34, goldP, 0, -0.18, 0);
      const knee  = box(0.38, 0.18, 0.38, goldHi, 0, -0.36, 0.02);
      const shin  = box(0.36, 0.42, 0.36, goldP, 0, -0.58, 0);
      const boot  = box(0.38, 0.22, 0.58, goldHi, 0, -0.74, 0.09); // Pointed sabaton foot
      leg.add(thigh, knee, shin, boot);
    }

    group.add(legL, legR, torso, armL, armR, head);
    parts.legL = legL; parts.legR = legR; parts.torso = torso;
    parts.armL = armL; parts.armR = armR; parts.head = head;

  } else if (cls === 'archer') {
    // =========================================================================
    // AREN: The Ghost Ranger (Vibrant Red Hooded Clothes & Ranger Gear)
    // =========================================================================
    const redP = mat(0xef233c);         // Bright scarlet red hood & tunic
    const redDk = mat(0x991b1b);        // Deep dark crimson shadows & borders
    const leather = mat(0x78350f);      // Warm tan leather belts & boots
    const leatherDk = mat(0x451a03);    // Dark leather quiver
    const eyeGlow = glow(0x22c55e);      // Piercing glowing emerald eyes
    const goldMat = mat(0xffd700);      // Belt buckles & arrow fletch tips

    // 1. TORSO & WAIST (Scarlet Poncho Mantle, Tunic Skirts & Quiver)
    const torso = new THREE.Group();
    torso.position.set(0, 1.22, 0);

    // Scarlet Ranger Tunic & Shoulder Mantle / Poncho
    const mantle = box(1.42, 0.36, 0.88, redP, 0, 0.38, 0);
    const mantleTrim = box(1.46, 0.12, 0.92, redDk, 0, 0.22, 0);
    const tunicBody = box(0.86, 0.74, 0.66, redP, 0, 0.04, 0);
    const harnessX1 = box(0.12, 0.88, 0.68, leather, 0, 0.04, 0.01, 0, 0, 0.42);
    const harnessX2 = box(0.12, 0.88, 0.68, leather, 0, 0.04, 0.01, 0, 0, -0.42);
    torso.add(mantle, mantleTrim, tunicBody, harnessX1, harnessX2);

    // Double Leather Utility Belt & Hip Pouches
    const belt = box(0.9, 0.2, 0.7, leather, 0, -0.32, 0);
    const buckle = box(0.24, 0.24, 0.74, goldMat, 0, -0.32, 0);
    const pouchL = box(0.22, 0.24, 0.28, leatherDk, -0.46, -0.32, 0);
    const pouchR = box(0.22, 0.24, 0.28, leatherDk, 0.46, -0.32, 0);
    torso.add(belt, buckle, pouchL, pouchR);

    // Hanging Red Tunic Skirts (Split Tunic Hem covering upper thighs)
    const tunicFront = box(0.42, 0.46, 0.1, redP, 0, -0.52, 0.34, 0.18, 0, 0);
    const tunicBack  = box(0.42, 0.46, 0.1, redP, 0, -0.52, -0.34, -0.18, 0, 0);
    const tunicL     = box(0.1, 0.46, 0.42, redDk, -0.44, -0.52, 0, 0, 0, 0.18);
    const tunicR     = box(0.1, 0.46, 0.42, redDk, 0.44, -0.52, 0, 0, 0, -0.18);
    torso.add(tunicFront, tunicBack, tunicL, tunicR);

    // Leather Back Quiver with 5 Fletched Arrows
    const quiver = new THREE.Group();
    quiver.position.set(0.28, 0.24, -0.38);
    quiver.rotation.set(0.18, 0, -0.38);
    const qTube = cyl(0.18, 0.14, 1.25, 8, leatherDk);
    const qRim  = cyl(0.2, 0.2, 0.16, 8, goldMat, 0, 0.58, 0);
    quiver.add(qTube, qRim);

    // Prominent Red & Gold Arrows protruding high over shoulder
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const fletch = box(0.1, 0.35, 0.1, redP, Math.cos(ang) * 0.08, 0.78, Math.sin(ang) * 0.08);
      const fletchTip = box(0.08, 0.1, 0.08, goldMat, Math.cos(ang) * 0.08, 0.94, Math.sin(ang) * 0.08);
      quiver.add(fletch, fletchTip);
    }
    torso.add(quiver);

    // Fluttering Red Half-Cape / Ranger Scarf
    const scarf = new THREE.Group();
    scarf.position.set(-0.25, 0.38, -0.38);
    scarf.rotation.set(0.26, 0.12, 0.15);
    const sBody = box(0.72, 1.45, 0.08, redP, 0, -0.72, 0);
    const sHem  = box(0.76, 0.14, 0.1, redDk, 0, -1.45, 0);
    scarf.add(sBody, sHem);
    torso.add(scarf);

    // 2. HEAD (Peaked Scarlet Ranger Hood & Shadowed Face)
    const head = new THREE.Group();
    head.position.set(0, 2.0, 0);

    const hoodBody = box(0.86, 0.88, 0.9, redP, 0, 0.06, 0);
    // Forward Peaked Hood Brow Visor
    const hoodVisor = box(0.88, 0.26, 0.44, redP, 0, 0.26, 0.32, -0.22, 0, 0);
    // Drooping Conical Cowl Tip in Back
    const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 4), redDk);
    hoodTip.position.set(0, 0.06, -0.58);
    hoodTip.rotation.x = -Math.PI / 2 + 0.3;
    // Deep Face Recess & Glowing Emerald Eyes
    const faceVoid = box(0.62, 0.46, 0.25, mat(0x0f0406), 0, -0.04, 0.32);
    const eyeL = box(0.14, 0.07, 0.1, eyeGlow, -0.14, 0.02, 0.42);
    const eyeR = box(0.14, 0.07, 0.1, eyeGlow, 0.14, 0.02, 0.42);
    head.add(hoodBody, hoodVisor, hoodTip, faceVoid, eyeL, eyeR);

    // 3. ARMS, SLEEVES & BRACERS
    const armL = new THREE.Group(); armL.position.set(-0.48, 1.62, 0);
    const armR = new THREE.Group(); armR.position.set(0.48, 1.62, 0);

    for (const [arm, side] of [[armL, -1], [armR, 1]]) {
      const sleeve = box(0.3, 0.38, 0.3, redP, 0, -0.19, 0);
      const bracer = box(0.34, 0.42, 0.34, leather, 0, -0.55, 0);
      const bracerTrim = box(0.36, 0.14, 0.36, redDk, 0, -0.4, 0);
      arm.add(sleeve, bracer, bracerTrim);
    }

    // Recurve Hunting Bow in Hand
    const bow = new THREE.Group();
    bow.position.set(0, -0.65, 0.32);
    bow.rotation.set(-Math.PI / 2, 0, 0);
    const bowLimb = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.065, 8, 24, Math.PI * 1.15), leatherDk);
    bowLimb.rotation.z = Math.PI / 2;
    const bowGoldTip1 = box(0.12, 0.18, 0.12, goldMat, 0.65, 0.35, 0);
    const bowGoldTip2 = box(0.12, 0.18, 0.12, goldMat, -0.65, 0.35, 0);
    const bowString = capMesh(0.02, 1.32, mat(0xffffff));
    bowString.position.x = 0.32;
    // Nocked Hunting Arrow Ready to Shoot
    const nockedArrow = cyl(0.02, 0.02, 1.35, 6, mat(0x5a3a2a), 0.15, 0, 0);
    nockedArrow.rotation.z = Math.PI / 2;
    const arrowhead = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), mat(0xe2e8f0));
    arrowhead.position.set(-0.55, 0, 0);
    arrowhead.rotation.z = Math.PI / 2;
    bow.add(bowLimb, bowGoldTip1, bowGoldTip2, bowString, nockedArrow, arrowhead);

    armR.add(bow);
    parts.weapon = bow;
    armR.rotation.x = -1.2;
    armL.rotation.x = -1.0;

    // 4. LEGS & LACED RANGER BOOTS
    const legL = new THREE.Group(); legL.position.set(-0.2, 0.8, 0);
    const legR = new THREE.Group(); legR.position.set(0.2, 0.8, 0);

    for (const leg of [legL, legR]) {
      const pants = box(0.3, 0.36, 0.3, mat(0x1e293b), 0, -0.18, 0); // Charcoal breeches
      const bootShin = box(0.34, 0.44, 0.34, leather, 0, -0.56, 0);
      const bootLace = box(0.36, 0.12, 0.36, redDk, 0, -0.44, 0);
      const bootFoot = box(0.34, 0.22, 0.54, leather, 0, -0.74, 0.09);
      leg.add(pants, bootShin, bootLace, bootFoot);
    }

    group.add(legL, legR, torso, armL, armR, head);
    parts.legL = legL; parts.legR = legR; parts.torso = torso;
    parts.armL = armL; parts.armR = armR; parts.head = head;

  } else {
    // =========================================================================
    // ZILI: The Astral Sorceress (Elven Empress in Silver Cloak & Flared Gown)
    // =========================================================================
    const silverP = mat(0xf8fafc);      // Radiant moonlight platinum silver
    const silverMed = mat(0xe2e8f0);    // Silken silver corset & drape
    const lilacP = mat(0x818cf8);       // Celestial soft lilac/indigo accents
    const astralCyan = glow(0x38bdf8);  // Glowing sapphire diadem & star core
    const skinFair = mat(0xfdf2f8);     // Fair porcelain elven skin

    // 1. TORSO & WAIST (Flared Silver Shoulder Cowl, Corset & Wide Skirt)
    const torso = new THREE.Group();
    torso.position.set(0, 1.22, 0);

    // Ethereal Silver Shoulder Mantle / Cowl
    const shoulderCowl = box(1.36, 0.3, 0.78, silverP, 0, 0.38, 0);
    const cowlTrim = box(1.4, 0.1, 0.82, lilacP, 0, 0.24, 0);
    torso.add(shoulderCowl, cowlTrim);

    // Form-Fitting Silver Silk Corset Bodice
    const corset = box(0.76, 0.68, 0.56, silverMed, 0, 0.06, 0);
    const corsetLace = box(0.24, 0.55, 0.6, lilacP, 0, 0.06, 0);
    const brooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), astralCyan);
    brooch.position.set(0, 0.18, 0.32);
    const waistBelt = box(0.8, 0.16, 0.6, silverP, 0, -0.28, 0);
    torso.add(corset, corsetLace, brooch, waistBelt);

    // WIDE FLARED TIERED SILVER GOWN / SKIRT (Enormous Top-Down Visibility!)
    // 3 tiered flared rings creating a stunning flowing dress silhouette!
    const skirtGroup = new THREE.Group();
    skirtGroup.position.set(0, -0.32, 0);

    const skirtTop = cyl(0.44, 0.74, 0.36, 16, silverP, 0, -0.12, 0);
    const skirtMid = cyl(0.72, 0.96, 0.42, 16, silverMed, 0, -0.44, 0);
    const skirtHem = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.07, 8, 24), lilacP);
    skirtHem.rotation.x = Math.PI / 2;
    skirtHem.position.y = -0.65;
    skirtGroup.add(skirtTop, skirtMid, skirtHem);
    torso.add(skirtGroup);

    // Flowing Moonlight-Silver Cloak Draping Down to Ankles
    const cloakGroup = new THREE.Group();
    cloakGroup.position.set(0, 0.38, -0.34);
    cloakGroup.rotation.x = 0.2;
    const cClasp = box(1.08, 0.16, 0.18, silverP, 0, 0, 0);
    const cBody  = box(1.04, 1.68, 0.08, silverP, 0, -0.86, 0);
    const cLining = box(0.98, 1.62, 0.06, lilacP, 0, -0.84, 0.02);
    const cHem   = box(1.08, 0.14, 0.1, astralCyan, 0, -1.68, 0);
    cloakGroup.add(cClasp, cBody, cLining, cHem);
    torso.add(cloakGroup);

    // 2. HEAD (Cascading Platinum Hair, Pointed Elf Ears & Diadem)
    const head = new THREE.Group();
    head.position.set(0, 2.0, 0);

    // Fair Porcelain Face
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skinFair);
    face.scale.set(0.95, 1, 0.85);

    // Cascading Volumetric Platinum/Silver Hair
    const hairTop = box(0.82, 0.78, 0.84, silverP, 0, 0.08, -0.04);
    const hairL   = box(0.18, 0.75, 0.28, silverP, -0.4, -0.16, 0.08);
    const hairR   = box(0.18, 0.75, 0.28, silverP, 0.4, -0.16, 0.08);
    // Flowing Back Locks reaching down to the waist
    const hairBack = box(0.82, 1.45, 0.28, silverP, 0, -0.48, -0.36);
    head.add(face, hairTop, hairL, hairR, hairBack);

    // Pointed Elven Ears sticking out with Silver Earrings
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.58, 4), skinFair);
      ear.position.set(side * 0.46, 0.06, -0.06);
      ear.rotation.set(-0.25, side * 0.35, side * -1.18);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), silverP);
      ring.position.set(side * 0.42, -0.04, -0.04);
      head.add(ear, ring);
    }

    // Astral Royal Diadem / Tiara with Glowing Sapphire
    const diadem = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 18), silverP);
    diadem.rotation.x = Math.PI / 2;
    diadem.position.set(0, 0.22, 0.04);
    const crownGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), astralCyan);
    crownGem.position.set(0, 0.28, 0.38);
    head.add(diadem, crownGem);

    // 3. ARMS & OPERA GLOVES
    const armL = new THREE.Group(); armL.position.set(-0.46, 1.62, 0);
    const armR = new THREE.Group(); armR.position.set(0.46, 1.62, 0);

    for (const arm of [armL, armR]) {
      const shoulder = box(0.24, 0.32, 0.24, skinFair, 0, -0.16, 0);
      const glove = box(0.28, 0.46, 0.28, silverP, 0, -0.52, 0);
      const bangle = box(0.32, 0.12, 0.32, astralCyan, 0, -0.38, 0);
      arm.add(shoulder, glove, bangle);
    }

    // Floating Celestial Starlight Staff
    const staff = new THREE.Group();
    staff.position.set(0.82, 1.55, 0.85);
    staff.rotation.set(0.35, 0, 0.2);

    const rod = cyl(0.045, 0.055, 1.55, 8, silverP, 0, 0.15, 0);
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 20, Math.PI * 1.55), silverP);
    crescent.position.y = 0.95;
    crescent.rotation.z = Math.PI * 0.25;

    // Orbiting Starlight Core Orb
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), astralCyan);
    orb.position.y = 0.95;
    const orbRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 16), lilacP);
    orbRing.position.y = 0.95;
    orbRing.rotation.x = Math.PI / 3;

    staff.add(rod, crescent, orb, orbRing);
    staff.userData.orb = orb;
    group.add(staff);
    parts.floatWeapon = staff;

    armR.rotation.x = -0.55;
    armL.rotation.x = -0.42;

    // 4. LEGS & ELVEN SLIPPERS
    const legL = new THREE.Group(); legL.position.set(-0.16, 0.8, 0);
    const legR = new THREE.Group(); legR.position.set(0.16, 0.8, 0);

    for (const leg of [legL, legR]) {
      const legMesh = box(0.24, 0.42, 0.24, skinFair, 0, -0.21, 0);
      const slipper = box(0.26, 0.32, 0.38, silverP, 0, -0.58, 0.05);
      leg.add(legMesh, slipper);
    }

    group.add(legL, legR, torso, armL, armR, head);
    parts.legL = legL; parts.legR = legR; parts.torso = torso;
    parts.armL = armL; parts.armR = armR; parts.head = head;
  }

  // Ensure each mesh has its own cloned material instance so hit-flashes work independently
  const tint = [];
  group.traverse((o) => {
    if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) {
      o.material = o.material.clone();
      tint.push(o.material);
    }
  });

  return { group, parts, tint, walk: 'biped', phase: 0 };
}

export function buildEnemy(type) {
  if (type === 'zombie') {
    const h = humanoid({ skin: 0x5a9a46, torso: 0x2f6fa0, leg: 0x3a3a7a });
    h.parts.armL.rotation.x = h.parts.armR.rotation.x = -Math.PI / 2;   // arms reaching out
    return h;
  }
  if (type === 'skeleton') {
    const h = humanoid({ skin: 0xe6e7e0, torso: 0xc4c7ca, leg: 0xb8bbbe, thin: true });
    const bow = buildWeapon('bow'); bow.rotation.x = -Math.PI / 2; bow.position.set(0, -0.6, 0.3);
    h.parts.armR.rotation.x = -1.3; h.parts.armL.rotation.x = -1.0; h.parts.armR.add(bow);
    return h;
  }
  if (type === 'creeper') {
    const g = new THREE.Group(); const sM = mat(0x5fb94e);
    const body = capMesh(0.32, 0.68, sM); body.position.y = 0.95; body.scale.set(1, 1, 0.82);
    const head = sphere(0.34, sM, 1, 0.92, 0.92); head.position.y = 1.62;
    const eM = mat(0x141414);
    for (const ex of [-0.14, 0.14]) { const e = sphere(0.08, eM); e.position.set(ex, 0.04, 0.28); head.add(e); }
    const mouth = sphere(0.1, eM, 1, 1.4, 0.6); mouth.position.set(0, -0.12, 0.28); head.add(mouth);
    const legs = [];
    for (const [x, z] of [[-0.17, 0.17], [0.17, 0.17], [-0.17, -0.17], [0.17, -0.17]]) { const L = limb(0.12, 0.3, sM, x, 0.36, z); legs.push(L); g.add(L); }
    g.add(body, head);
    return { group: g, parts: { body, head, legs }, tint: [sM], walk: 'quad', phase: Math.random() * 6.28 };
  }
  // spider
  const g = new THREE.Group(); const dM = mat(0x2b2420);
  const abdomen = sphere(0.44, dM, 1, 0.78, 1.25); abdomen.position.set(0, 0.5, -0.28);
  const head = sphere(0.3, dM, 1, 0.85, 1); head.position.set(0, 0.46, 0.36);
  const eM = glow(0xff4030);
  for (const ex of [-0.12, 0.12]) { const e = sphere(0.055, eM); e.position.set(ex, 0.54, 0.62); g.add(e); }
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, row = (i % 4) - 1.5;
    const L = limb(0.05, 0.5, dM, side * 0.4, 0.52, row * 0.2);
    L.rotation.z = side * 1.0; L.rotation.x = row * 0.22; legs.push(L); g.add(L);
  }
  g.add(abdomen, head);
  return { group: g, parts: { body: abdomen, head, legs }, tint: [dM], walk: 'spider', phase: Math.random() * 6.28 };
}

export function buildBoss(baseType) {
  const e = buildEnemy(baseType);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 8), glow(0xffd24a));
  crown.position.y = baseType === 'creeper' ? 1.95 : 2.4; e.group.add(crown);
  return e;
}
