// main.js — Last Block Standing. Survivors-like, voxel/Minecraft look. Single-file engine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { tex, blob, seal } from './textures.js';
import { buildPlayer, buildEnemy, buildBoss } from './models.js';
import {
  PLAYER, WEAPONS, ENEMIES, BOSSES, MAPS, ARENA, waveSpec, XP, PERKS, CLASSES,
} from './config.js';
import { ICONS, getIcon } from './icons.js';
import * as Audio from './audio.js';
import {
  initLeaderboard, openLeaderboardModal, closeLeaderboardModal,
  calculateScore, submitScore, getSavedName, setSavedName, getPlayerStats,
  getRandomRunicName, updateLandingCareerBadge,
} from './leaderboard.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const dom = {
  app: $('app'), loader: $('loader'),
  lvl: $('lvl'), kills: $('kills'), wave: $('wave'), wavesub: $('wavesub'),
  time: $('time'), dps: $('dps'),
  hpfill: $('hpfill'), hplabel: $('hplabel'), xpfill: $('xpfill'),
  dmglayer: $('dmglayer'), hint: $('hint'),
  menu: $('menu'), gameover: $('gameover'), gotitle: $('gotitle'), gostats: $('gostats'),
  pause: $('pause'), perkdraft: $('perkdraft'),
  classselect: $('classselect'), classcards: $('classcards'),
  speedlines: $('speedlines'), vignette: $('vignette'), powerupFlash: $('powerup-flash'),
  specials: $('specials'),
  mutebtn: $('mutebtn'),
  minimap: $('minimap'),
  bossbar: $('bossbar'), bossname: $('bossname'), bosstitle: $('bosstitle'),
  bossfill: $('bossfill'), bossghostfill: $('bossghostfill'), bossval: $('bossval'),
  bossSeqCast: $('boss-sequence-cast'), bossSeqName: $('boss-sequence-name'), bossSeqFill: $('boss-sequence-fill'),
  wavebanner: $('wavebanner'), wbtitle: $('wb-title'), wbsub: $('wb-sub'),
  combobox: $('combobox'), combocount: $('combocount'), comborate: $('comborate'),
  waygatePrompt: $('waygate-prompt'), wpTitle: $('wp-title'), wpDesc: $('wp-desc'),
  realmWarp: $('realm-warp-overlay'), rwoTitle: $('rwo-title'), rwoRealmName: $('rwo-realm-name'), rwoSub: $('rwo-sub'),
  victorymodal: $('victorymodal'),
  vstatWaves: $('vstat-waves'), vstatKills: $('vstat-kills'), vstatTime: $('vstat-time'), vstatTitans: $('vstat-titans'),
  vicEndlessBtn: $('vic-endless-btn'), vicMenuBtn: $('vic-menu-btn'),
};

// ---------- Globals ----------
let renderer, scene, camera, clock;
let composer, bloom;
let worldGroup, floorMesh, wallGroup;
let realmPortal = null;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const envAnim = { braziers: [], crystals: [], lava: [], trees: [], runes: [], vents: [], lanterns: [], shrooms: [], seal: null, motes: null };

// pools / actor lists
let player;
const enemies = [];
const projectiles = [];
const particles = [];
const orbs = [];
const freeEnemy = {};   // type -> array of pooled dead enemy objects
const sharedGeo = {};   // size key -> BoxGeometry
const mobMat = {};      // type -> MeshLambertMaterial

// game state
const G = {
  mode: 'menu',          // menu | playing | paused | over
  time: 0, wave: 0, kills: 0, mapIndex: 0,
  level: 1, xp: 0, xpNeed: 10,
  spec: null, toSpawn: 0, spawnTimer: 0, boss: null,
  dmgWindow: [],         // [{t, amt}] for DPS readout
  pendingLevels: 0, drafting: false,
  waveActive: false, betweenTimer: 0, shakeMag: 0, shakeX: 0, shakeY: 0,
  combo: 0, comboTimer: 0, bossGhostPct: 100, waveBannerTimer: null,
  selectedClass: 'knight',
};

// mutable player-stat bag (perks mutate copies, not config)
let P = null;      // player stats
let WPN = null;    // active weapon instances {sword:{...}, ...}
let modifiers = null;

init();

// ============================================================= ENGINE
function init() {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch-device');

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(isTouch ? 1.25 : 1.5, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = isTouch ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  dom.app.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 400);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2e38, 0.45));
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  // key "sun": casts shadows and follows the player (updateLights)
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 130;
  const sc = 36; Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  scene.userData.sun = sun;

  // cool rim/back light so models pop off the background
  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.5);
  rim.position.set(-10, 8, -12); scene.add(rim);
  scene.userData.rim = rim;

  worldGroup = new THREE.Group(); scene.add(worldGroup);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.65, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  applyBiome(0);
  buildArena(0);
  createPlayer('knight');

  addEventListener('resize', onResize);
  bindInput();
  bindUI();
  initLeaderboard();

  dom.loader.style.display = 'none';
  dom.menu.classList.add('show');
  Audio.playHomescreenMusic();
  renderer.setAnimationLoop(frame);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}

function applyBiome(i) {
  const m = MAPS[i];
  scene.background = new THREE.Color(m.sky);
  const fogNear = [28, 22, 24][i], fogFar = [135, 115, 130][i];
  scene.fog = new THREE.Fog(m.fog, fogNear, fogFar);
  scene.userData.sun.color.set(m.light);
  scene.userData.sun.intensity = [1.25, 1.45, 1.15][i];
  
  if (scene.userData.rim) {
    const rimColors = [0x57eb64, 0xff5a2a, 0xa855f7];
    scene.userData.rim.color.set(rimColors[i]);
    scene.userData.rim.intensity = [0.65, 0.95, 0.8][i];
  }

  renderer.toneMappingExposure = [1.05, 1.15, 1.0][i];
  dom.wavesub.textContent = `${m.name} · ${m.subtitle || ''}`;
}

function tiled(name, rx, ry) {
  const t = tex(name).clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function resetEnvAnim() {
  envAnim.braziers = [];
  envAnim.crystals = [];
  envAnim.lava = [];
  envAnim.trees = [];
  envAnim.runes = [];
  envAnim.vents = [];
  envAnim.lanterns = [];
  envAnim.shrooms = [];
  envAnim.motes = null;
}

function buildArena(i) {
  while (worldGroup.children.length) {
    const c = worldGroup.children.pop();
    c.geometry?.dispose?.();
    worldGroup.remove(c);
  }
  resetEnvAnim();

  const m = MAPS[i];
  const S = ARENA.size, H = ARENA.wallH, h = S / 2;

  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S),
    new THREE.MeshLambertMaterial({ map: tiled(m.floor, S / 2, S / 2) }));
  floorMesh.rotation.x = -Math.PI / 2; worldGroup.add(floorMesh);

  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(S * 2.4, S * 2.4),
    new THREE.MeshBasicMaterial({ color: m.ground }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.08; worldGroup.add(skirt);

  // enclosing walls with trimmed cap & plinth
  const wallMat = new THREE.MeshLambertMaterial({ map: tiled(m.wall, S / 3, H / 4) });
  const capMat = new THREE.MeshLambertMaterial({ map: tex(m.wall) });
  const th = 2.6;
  for (const [x, z] of [[0, -h], [0, h], [-h, 0], [h, 0]]) {
    const horiz = x === 0;
    const w = horiz ? S + th * 2 : th, d = horiz ? th : S + th * 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
    wall.position.set(x, H / 2, z); worldGroup.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.3, d + 0.6), capMat);
    cap.position.set(x, H + 0.3, z); worldGroup.add(cap);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1.3, 1.5, d + 1.3), capMat);
    plinth.position.set(x, 0.6, z); worldGroup.add(plinth);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(4.5, H + 3.5, 4.5), capMat);
    col.position.set(sx * h, (H + 3.5) / 2, sz * h); worldGroup.add(col);
  }

  // Build biome-specific animated roguelite dungeon decor
  buildThemedDungeon(i, h, H, m);

  floorMesh.receiveShadow = true;
  worldGroup.traverse((o) => {
    if (o.isMesh) { o.receiveShadow = true; if (!(o.material && o.material.isMeshBasicMaterial)) o.castShadow = true; }
  });
}

function buildThemedDungeon(mi, h, H, m) {
  const stoneMat = new THREE.MeshLambertMaterial({ map: tex(m.wall) });
  const woodMat = new THREE.MeshLambertMaterial({ map: tex('wood') });
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xd7d8cf });
  const inner = h - 6;
  const far = () => (Math.random() - 0.5) * 2 * inner;

  // Perimeter posts / shrines / torches
  const be = h - 4, bo = (h - 4) * 0.5;
  for (const [x, z] of [[-be, -bo], [-be, bo], [be, -bo], [be, bo], [-bo, -be], [bo, -be], [-bo, be], [bo, be]]) {
    buildBeacon(x, z, m, stoneMat);
  }

  // Atmospheric ambient motes/spores/embers
  spawnAmbientMotes(m);

  if (m.theme === 'forest') {
    buildForestDecor(far, inner, H, m, stoneMat, woodMat);
  } else if (m.theme === 'inferno') {
    buildInfernoDecor(far, inner, H, m, stoneMat, boneMat);
  } else if (m.theme === 'void') {
    buildVoidDecor(far, inner, H, m, stoneMat);
  }

  // Roguelite dungeon perimeter banners
  const bannerMat = new THREE.MeshBasicMaterial({ color: m.accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[0, -h + 2, 0], [0, h - 2, Math.PI], [-h + 2, 0, Math.PI / 2], [h - 2, 0, -Math.PI / 2]]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 6.2), bannerMat);
    banner.position.set(x, H * 0.52, z); banner.rotation.y = ry; worldGroup.add(banner);
  }
}

function buildBeacon(x, z, m, stoneMat) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 7), stoneMat); 
  post.position.y = 1.2;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.6, 9), stoneMat); 
  bowl.position.y = 2.45;
  
  let flame;
  if (m.theme === 'forest') {
    flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.48), new THREE.MeshBasicMaterial({ color: 0x62ff84 }));
    flame.position.y = 2.85;
  } else if (m.theme === 'inferno') {
    flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4d15 }));
    flame.position.y = 2.85; flame.scale.y = 1.5;
  } else {
    flame = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
    flame.position.y = 2.85;
  }
  
  g.add(post, bowl, flame); 
  g.position.set(x, 0, z); 
  worldGroup.add(g);
  
  const pl = new THREE.PointLight(m.accent, 1.8, 28, 1.4); 
  pl.position.set(x, 3.2, z); 
  worldGroup.add(pl);
  envAnim.braziers.push({ light: pl, flame, baseInt: 1.8, phase: Math.random() * 6.28, type: m.theme });
}

function buildForestDecor(far, inner, H, m, stoneMat, woodMat) {
  const leafMat = new THREE.MeshLambertMaterial({ map: tex('leaves') });
  const barkMat = new THREE.MeshLambertMaterial({ map: tex('bark') });
  const cryptMat = new THREE.MeshLambertMaterial({ map: tex('dungeon_crypt_brick') });
  const grateMat = new THREE.MeshLambertMaterial({ map: tex('dungeon_iron_grate') });
  const relicMat = new THREE.MeshLambertMaterial({ map: tex('ancient_relic_stone') });
  const shroomStem = new THREE.MeshLambertMaterial({ color: 0xd8e4dc });
  const shroomCap = new THREE.MeshBasicMaterial({ color: 0x34d399 });

  // 1. Grand Ruined Gothic Crypt Archways with Hanging Lantern Cages (4 monumental archways)
  const archPositions = [
    { x: -16, z: -16, rot: Math.PI / 4 },
    { x: 16, z: -16, rot: -Math.PI / 4 },
    { x: -16, z: 16, rot: -Math.PI / 4 },
    { x: 16, z: 16, rot: Math.PI / 4 },
  ];
  for (const ap of archPositions) {
    const ag = new THREE.Group();
    const pL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7.8, 1.8), cryptMat);
    pL.position.set(-4.6, 3.9, 0);
    const pR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7.8, 1.8), cryptMat);
    pR.position.set(4.6, 3.9, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.0, 1.5, 2.0), stoneMat);
    lintel.position.set(0, 7.8, 0);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.4), stoneMat);
    crest.position.set(0, 8.2, 0);
    ag.add(pL, pR, lintel, crest);

    // Hanging Iron Lantern Cage on chain
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0x1a201c }));
    chain.position.set(0, 6.2, 0);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.85), grateMat);
    cage.position.set(0, 4.8, 0);
    const soulFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    soulFlame.position.set(0, 4.8, 0);
    const soulLight = new THREE.PointLight(0x4ade80, 1.2, 18, 1.5);
    soulLight.position.set(0, 4.8, 0);
    ag.add(chain, cage, soulFlame, soulLight);
    envAnim.lanterns.push({ flame: soulFlame, light: soulLight, phase: Math.random() * 6.28 });

    ag.position.set(ap.x, 0, ap.z);
    ag.rotation.y = ap.rot;
    worldGroup.add(ag);
  }

  // 2. Overgrown Catacomb Sewer Grates with Under-Floor Spirit Glow
  for (let k = 0; k < 6; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 8) continue;
    const grate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), grateMat);
    grate.rotation.x = -Math.PI / 2;
    grate.position.set(x, 0.05, z);
    worldGroup.add(grate);

    const gLight = new THREE.PointLight(0x22c55e, 0.9, 10, 2);
    gLight.position.set(x, 0.35, z);
    worldGroup.add(gLight);
    envAnim.braziers.push({ light: gLight, flame: null, baseInt: 0.9, phase: Math.random() * 6.28, type: 'forest' });
  }

  // 3. Ancient Knight Sarcophagi & Burial Effigies
  for (let k = 0; k < 7; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 9) continue;
    const sg = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 1.3), cryptMat);
    plinth.position.y = 0.35;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.4), stoneMat);
    lid.position.y = 0.85;
    const effigy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 0.7), relicMat);
    effigy.position.y = 1.1;
    sg.add(plinth, lid, effigy);
    sg.position.set(x, 0, z);
    sg.rotation.y = Math.random() * Math.PI;
    worldGroup.add(sg);
  }

  // 4. Standing Ancient Runic Menhirs
  for (let k = 0; k < 8; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 10) continue;
    const mh = 3.5 + Math.random() * 2.8;
    const menhir = new THREE.Mesh(new THREE.BoxGeometry(1.3, mh, 1.3), relicMat);
    menhir.position.set(x, mh / 2, z);
    menhir.rotation.y = Math.random() * 3;
    worldGroup.add(menhir);
  }

  // 5. Breathing Bioluminescent Fungi Clusters
  for (let k = 0; k < 14; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 8) continue;
    const g = new THREE.Group();
    for (let c = 0; c < 3; c++) {
      const ox = (Math.random() - 0.5) * 1.2, oz = (Math.random() - 0.5) * 1.2;
      const sh = 0.5 + Math.random() * 0.7;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, sh, 6), shroomStem);
      stem.position.set(ox, sh / 2, oz);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 8), shroomCap);
      cap.position.set(ox, sh + 0.18, oz);
      g.add(stem, cap);
    }
    g.position.set(x, 0, z);
    worldGroup.add(g);
    envAnim.shrooms.push({ group: g, phase: Math.random() * 6.28 });
  }

  // 6. Weeping Ancient Roots & Twisted Trees
  for (let k = 0; k < 8; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 12) continue;
    const tg = new THREE.Group();
    const th = 5.5 + Math.random() * 3.0;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, th, 8), barkMat);
    trunk.position.y = th / 2;
    tg.add(trunk);
    const fol = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 3.6), leafMat);
    fol.position.y = th + 0.8;
    tg.add(fol);
    tg.position.set(x, 0, z);
    worldGroup.add(tg);
    envAnim.trees.push({ group: tg, phase: Math.random() * 6.28, speed: 1.0 });
  }
}

function buildInfernoDecor(far, inner, H, m, stoneMat, boneMat) {
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff3b00 });
  const obsidianMat = new THREE.MeshLambertMaterial({ map: tex('obsidian') });
  const brimstoneMat = new THREE.MeshLambertMaterial({ map: tex('brimstone_wall') });
  const grateMat = new THREE.MeshLambertMaterial({ map: tex('dungeon_iron_grate') });

  // 1. Dynamic Magma Chasms & Rivers with jagged basalt borders
  for (let k = 0; k < 10; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 9) continue;
    const sx = 4.0 + Math.random() * 5.0, sz = 4.0 + Math.random() * 5.0;
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), lavaMat.clone());
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(x, 0.05, z);
    worldGroup.add(lava);
    envAnim.lava.push({ mesh: lava, phase: Math.random() * 6.28 });

    // Surrounding jagged basalt rocks
    for (let b = 0; b < 6; b++) {
      const ang = (b / 6) * Math.PI * 2;
      const bx = x + Math.cos(ang) * (sx * 0.48), bz = z + Math.sin(ang) * (sz * 0.48);
      const bs = 0.8 + Math.random() * 0.8;
      const rock = new THREE.Mesh(new THREE.BoxGeometry(bs, bs * 1.1, bs), obsidianMat);
      rock.position.set(bx, bs * 0.5, bz);
      rock.rotation.y = Math.random() * 3;
      worldGroup.add(rock);
    }
  }

  // 2. Volcanic Floor Furnace Vents (Spew fire & ember sparks)
  for (let k = 0; k < 6; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 8) continue;
    const vent = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), grateMat);
    vent.rotation.x = -Math.PI / 2;
    vent.position.set(x, 0.06, z);
    worldGroup.add(vent);

    const ventLight = new THREE.PointLight(0xff4500, 1.4, 12, 2);
    ventLight.position.set(x, 0.8, z);
    worldGroup.add(ventLight);
    envAnim.vents.push({ pos: new THREE.Vector3(x, 0.2, z), light: ventLight, timer: Math.random() * 2 });
  }

  // 3. Spiked Bastion Archways & Iron Gibbet Cages
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(ang) * 18, z = Math.sin(ang) * 18;
    const archG = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), brimstoneMat);
    p1.position.set(-3.5, 4, 0);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), brimstoneMat);
    p2.position.set(3.5, 4, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.4, 1.8), brimstoneMat);
    top.position.set(0, 8, 0);
    archG.add(p1, p2, top);

    // Hanging iron spiked cage over lava
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 4), new THREE.MeshBasicMaterial({ color: 0x111 }));
    chain.position.set(0, 6.2, 0);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), grateMat);
    cage.position.set(0, 4.4, 0);
    archG.add(chain, cage);

    archG.position.set(x, 0, z);
    archG.rotation.y = -ang;
    worldGroup.add(archG);
  }

  // 4. Obsidian Spires & Skulls
  for (let k = 0; k < 8; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 11) continue;
    const sh = 4.5 + Math.random() * 5.0;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.3, sh, 5), obsidianMat);
    spire.position.set(x, sh / 2, z);
    worldGroup.add(spire);
  }

  // 5. Charred Bone & Skull Piles
  for (let k = 0; k < 8; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 9) continue;
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.22, 0.22), boneMat);
      b.position.set(x + (Math.random() - 0.5) * 1.5, 0.12, z + (Math.random() - 0.5) * 1.5);
      b.rotation.y = Math.random() * 3;
      worldGroup.add(b);
    }
  }
}

function buildVoidDecor(far, inner, H, m, stoneMat) {
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
  const voidDarkMat = new THREE.MeshBasicMaterial({ color: 0x05020c });
  const voidPillarMat = new THREE.MeshLambertMaterial({ map: tex('void_pillar') });

  // 1. Floating Shattered Island Platforms (Antigravity Levitating Monoliths)
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    const dist = 24 + (Math.random() - 0.5) * 8;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const baseY = 2.5 + Math.random() * 4.5;

    const platG = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.8, 3.5), voidPillarMat);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), crystalMat);
    crystal.position.y = 1.4;
    platG.add(plat, crystal);
    platG.position.set(x, baseY, z);
    worldGroup.add(platG);

    envAnim.crystals.push({
      mesh: platG,
      baseY,
      phase: Math.random() * 6.28,
      rotSpeed: 0.3 + Math.random() * 0.4
    });
  }

  // 2. Concentric Runic Constellation Summoning Circles on Floor
  for (let k = 0; k < 6; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 9) continue;
    const rad = 3.0 + Math.random() * 2.0;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rad * 0.6, rad, 24),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    worldGroup.add(ring);

    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(rad * 0.6, 24),
      voidDarkMat
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, 0.06, z);
    worldGroup.add(hole);

    envAnim.runes.push({ mesh: ring, phase: Math.random() * 6.28, rot: 0.8 + Math.random() * 0.8 });
  }

  // 3. Monolithic Void Obelisks with Rotating Warp Rings
  for (let k = 0; k < 6; k++) {
    const x = far(), z = far();
    if (Math.hypot(x, z) < 11) continue;
    const obH = 7 + Math.random() * 3.5;
    const obelisk = new THREE.Mesh(new THREE.BoxGeometry(1.8, obH, 1.8), voidPillarMat);
    obelisk.position.set(x, obH / 2, z);

    // Glowing crystal crown
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.0, 4), crystalMat);
    cap.position.set(x, obH + 1.0, z);
    cap.rotation.y = Math.PI / 4;

    // Orbiting energy ring around obelisk
    const warpRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    warpRing.position.set(x, obH * 0.65, z);
    warpRing.rotation.x = Math.PI / 2;

    worldGroup.add(obelisk, cap, warpRing);
    envAnim.runes.push({ mesh: warpRing, phase: Math.random() * 6.28, rot: 1.2 });
  }
}

// ============================================================= REALM DESCENT WAYGATE SYSTEM
function spawnRealmPortal(x, z, nextMapIndex) {
  if (realmPortal) removeRealmPortal();

  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const m = MAPS[nextMapIndex] || MAPS[2];
  const portalCol = m.accent || 0xffd24a;

  // 1. Ancient Carved Stone Base Pedestal
  const stoneMat = new THREE.MeshLambertMaterial({ map: tex(MAPS[G.mapIndex].wall) });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.0, 0.45, 16), stoneMat);
  base.position.y = 0.22;
  g.add(base);

  // 2. Twin Portal Monolith Pillars
  const pillarGeo = new THREE.BoxGeometry(0.95, 6.5, 0.95);
  const pillarL = new THREE.Mesh(pillarGeo, stoneMat);
  pillarL.position.set(-2.4, 3.25, 0);
  const pillarR = new THREE.Mesh(pillarGeo, stoneMat);
  pillarR.position.set(2.4, 3.25, 0);

  // 3. Heavy Carved Top Archway & Keystone
  const arch = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.2, 1.3), stoneMat);
  arch.position.set(0, 6.5, 0);

  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color: portalCol }));
  keystone.position.set(0, 6.5, 0.7);

  // 4. Glowing Runic Ground Ring on Pedestal
  const sealTex = seal();
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 5.4),
    new THREE.MeshBasicMaterial({ map: sealTex, color: portalCol, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.48;
  g.add(ring);

  // 5. Swirling Dimensional Vortex Disc
  const vortexGeo = new THREE.RingGeometry(0.3, 2.3, 24);
  const vortexMat = new THREE.MeshBasicMaterial({
    color: portalCol,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  const vortex = new THREE.Mesh(vortexGeo, vortexMat);
  vortex.position.set(0, 3.3, 0);
  g.add(vortex);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  core.position.set(0, 3.3, 0.02);
  g.add(core);

  // 6. Skyward Radiant Beam
  const beamGeo = new THREE.CylinderGeometry(1.6, 2.6, 45, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: portalCol,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 22.5, 0);
  g.add(beam);

  // 7. Dynamic Point Light
  const pl = new THREE.PointLight(portalCol, 3.2, 26, 1.2);
  pl.position.set(0, 3.5, 0);
  g.add(pl);

  g.add(pillarL, pillarR, arch, keystone);
  worldGroup.add(g);

  // Animated rising emergence from subterranean earth
  g.position.y = -6.5;
  g.userData.targetY = 0;

  realmPortal = {
    group: g,
    ring,
    vortex,
    core,
    beam,
    light: pl,
    pos: new THREE.Vector3(x, 0, z),
    targetMapIndex: nextMapIndex,
    active: true,
    isVictory: nextMapIndex > 2,
    phase: 0,
    warping: false,
  };

  Audio.playPortalSpawn();
  G.shakeMag = 1.0;

  if (dom.waygatePrompt) {
    if (dom.wpTitle) dom.wpTitle.textContent = nextMapIndex > 2 ? 'ASCENSION GATE UNLOCKED' : 'REALM DESCENT WAYGATE UNLOCKED';
    if (dom.wpDesc) dom.wpDesc.textContent = nextMapIndex > 2 ? 'STEP IN TO CONQUER THE ABYSS' : `STEP IN TO ENTER REALM ${nextMapIndex + 1}: ${m.name}`;
    dom.waygatePrompt.classList.add('show');
  }
}

function removeRealmPortal() {
  if (realmPortal) {
    if (realmPortal.group) disposeGroup(realmPortal.group);
    realmPortal = null;
  }
  if (dom.waygatePrompt) dom.waygatePrompt.classList.remove('show');
}

function updateRealmPortal(dt) {
  if (!realmPortal || !realmPortal.active) return;
  const p = realmPortal;
  p.phase += dt;

  if (p.group.position.y < p.group.userData.targetY) {
    p.group.position.y = THREE.MathUtils.lerp(p.group.position.y, p.group.userData.targetY, dt * 3.5);
  }

  p.vortex.rotation.z += dt * 3.2;
  p.ring.rotation.z -= dt * 1.5;

  const pulse = 1 + Math.sin(p.phase * 4.5) * 0.15;
  p.core.scale.set(pulse, pulse, 1);
  p.light.intensity = 2.8 + Math.sin(p.phase * 5) * 0.9;
  p.beam.material.opacity = 0.28 + Math.sin(p.phase * 3.5) * 0.14;

  if (player && G.mode === 'playing') {
    const dist = player.pos.distanceTo(p.pos);
    if (dist < 3.8) {
      if (dom.waygatePrompt) dom.waygatePrompt.classList.add('show');
      if (dist < 1.7 && !p.warping) {
        enterRealmPortal();
      }
    }
  }
}

function enterRealmPortal() {
  if (!realmPortal || realmPortal.warping) return;
  realmPortal.warping = true;

  if (realmPortal.isVictory) {
    showVictoryScreen();
    return;
  }

  const nextMapIndex = realmPortal.targetMapIndex;
  const nextMap = MAPS[nextMapIndex];

  Audio.playPortalWarp();
  if (nextMapIndex > 0) Audio.stopDungeonMusic(1.2);
  G.shakeMag = 1.6;

  if (dom.powerupFlash) {
    dom.powerupFlash.classList.remove('flash');
    void dom.powerupFlash.offsetWidth;
    dom.powerupFlash.classList.add('flash');
  }
  if (dom.speedlines) dom.speedlines.style.opacity = '1';

  if (dom.realmWarp) {
    if (dom.rwoTitle) dom.rwoTitle.textContent = `DESCENDING TO REALM ${nextMapIndex + 1}`;
    if (dom.rwoRealmName) dom.rwoRealmName.textContent = nextMap.name;
    if (dom.rwoSub) dom.rwoSub.textContent = nextMap.subtitle;
    dom.realmWarp.classList.add('show');
  }

  if (dom.waygatePrompt) dom.waygatePrompt.classList.remove('show');
  G.waveActive = false;

  setTimeout(() => {
    removeRealmPortal();
    G.mapIndex = nextMapIndex;
    G.wave = nextMapIndex * 10 + 1; // 11 or 21
    clearField();
    applyBiome(nextMapIndex);
    buildArena(nextMapIndex);

    player.pos.set(0, 0, 0);
    player.vel.set(0, 0, 0);
    player.iframes = 2.0;

    if (dom.speedlines) dom.speedlines.style.opacity = '0';
    if (dom.realmWarp) dom.realmWarp.classList.remove('show');

    showWaveBanner(MAPS[nextMapIndex].name, `REALM ${nextMapIndex + 1} · COMMENCE PURGING`);
    Audio.playWaveStart(false);

    startWave(G.wave);
  }, 1600);
}

function showVictoryScreen() {
  G.mode = 'over';
  Audio.stopDungeonMusic(0.8);
  Audio.playVictory();
  removeRealmPortal();

  const finalScore = calculateScore(30, G.kills, 3, G.time);

  if (dom.victorymodal) {
    const slayerTag = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();
    const vicTitle = $('victitle');
    if (vicTitle) vicTitle.textContent = `CONQUEROR ${slayerTag} ASCENDED`;

    if (dom.vstatWaves) dom.vstatWaves.textContent = '30 / 30';
    if (dom.vstatKills) dom.vstatKills.textContent = G.kills;
    if (dom.vstatTime) dom.vstatTime.textContent = fmt(G.time);
    if (dom.vstatTitans) dom.vstatTitans.textContent = '3 / 3';

    const vicScoreDisplay = $('vic-score-display');
    if (vicScoreDisplay) vicScoreDisplay.textContent = `${finalScore.toLocaleString()} PTS`;

    const vicInput = $('vic-player-name');
    if (vicInput) vicInput.value = G.playerName || getSavedName(G.selectedClass);

    const vicForm = $('vic-submit-form');
    const vicSuccess = $('vic-submit-success');
    const vicBtn = $('vic-submit-btn');

    if (vicForm) vicForm.style.display = 'flex';
    if (vicSuccess) vicSuccess.classList.remove('show');
    if (vicBtn) {
      vicBtn.disabled = false;
      vicBtn.textContent = 'IMMORTALIZE';
      vicBtn.onclick = async () => {
        const name = (vicInput?.value || '').trim() || getSavedName(G.selectedClass);
        vicBtn.disabled = true;
        vicBtn.textContent = 'IMMORTALIZING...';
        const res = await submitScore({
          name,
          cls: G.selectedClass || 'knight',
          wave: 30,
          kills: G.kills,
          titans: 3,
          time: Math.floor(G.time),
          score: finalScore,
        });
        const homeInput = $('home-player-name-input');
        if (homeInput) homeInput.value = name;
        const landingInput = $('landing-player-name');
        if (landingInput) landingInput.value = name;
        updateLandingCareerBadge(name);
        if (vicForm) vicForm.style.display = 'none';
        if (vicSuccess) {
          vicSuccess.classList.add('show');
          const msg = $('vic-success-msg');
          if (msg) {
            msg.textContent = res.isNewBest
              ? `IMMORTALIZED NEW RECORD FOR ${name.toUpperCase()}! RANK #${res.rank || 1}`
              : `LEGEND PRESERVED FOR ${name.toUpperCase()}! RANK #${res.rank || 1}`;
          }
        }
      };
    }

    dom.victorymodal.classList.add('show');
  }
}

function spawnAmbientMotes(m) {
  const count = 55;
  const motesGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vels = [];
  const lim = ARENA.size / 2 - 4;

  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * lim * 2;
    pos[i * 3 + 1] = 0.5 + Math.random() * 7.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * lim * 2;
    vels.push({
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.3 + Math.random() * 0.9,
      vz: (Math.random() - 0.5) * 0.8,
      phase: Math.random() * 6.28
    });
  }
  motesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  
  const col = m.theme === 'forest' ? 0x86efac : (m.theme === 'inferno' ? 0xf97316 : 0xd8b4fe);
  const motesMat = new THREE.PointsMaterial({
    color: col,
    size: m.theme === 'inferno' ? 0.38 : 0.28,
    transparent: true,
    opacity: 0.75,
  });
  const points = new THREE.Points(motesGeo, motesMat);
  worldGroup.add(points);
  envAnim.motes = { points, vels, count, lim, theme: m.theme };
}

// ============================================================= INPUT
const keys = {};
const touchAxis = { x: 0, z: 0 };

function triggerDash() {
  if (player && player.dashCd <= 0 && !G.drafting && G.mode === 'playing') {
    player.dashT = PLAYER.dashDur; player.iframes = PLAYER.dashIframes;
    player.dashCd = P.dashCd; player.trailT = 0;
    Audio.playDash();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
  }
}

function bindInput() {
  initTouchControls();
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') e.preventDefault();
    if (G.mode === 'menu' && (k === ' ' || k === 'enter')) {
      Audio.initAudio();
      startRun(G.selectedClass || 'knight');
    }
    if (G.drafting && (k === '1' || k === '2' || k === '3')) pickDraft(+k - 1);
    if ((k === 'p' || k === 'escape') && (G.mode === 'playing' || G.mode === 'paused')) togglePause();
    if (G.mode === 'playing' && !G.drafting) {
      if (k === 'e' && realmPortal && realmPortal.active && player && player.pos.distanceTo(realmPortal.pos) < 4.0) {
        enterRealmPortal();
        return;
      }
      if (k === 'q') useSpecial(0);
      if (k === 'e') useSpecial(1);
      if (k === 'r') useSpecial(2);
    }
  });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
}

function initTouchControls() {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches || (window.innerWidth <= 1024);
  if (isTouch) document.body.classList.add('touch-device');

  const dashIcon = $('tb-icon-dash');
  if (dashIcon) dashIcon.innerHTML = getIcon('zap', 24);
  const portalIcon = $('tb-icon-portal');
  if (portalIcon) portalIcon.innerHTML = getIcon('portal', 18);
  const mobPause = $('mobile-pause-btn');
  if (mobPause) {
    mobPause.innerHTML = getIcon('pause', 16);
    mobPause.onclick = () => togglePause();
  }

  // Populate initial special ability icons if specials are configured
  ['q', 'e', 'r'].forEach((k, idx) => {
    const iconEl = $(`tb-icon-${k}`);
    if (iconEl && G.specials && G.specials[idx]) {
      iconEl.innerHTML = getIcon(G.specials[idx].icon, 20);
    }
  });

  // 1. High-Precision Responsive Virtual Joystick (Left Hand)
  const joystickZone = $('touch-joystick-zone');
  const joystickBase = $('touch-joystick-base');
  const joystickKnob = $('touch-joystick-knob');

  let joystickTouchId = null;
  let joyOrigin = { x: 0, y: 0 };
  const maxR = 48; // Max radius in pixels for knob deflection

  function getBaseCenter() {
    if (!joystickBase) return { x: 96, y: window.innerHeight - 96 };
    const rect = joystickBase.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function handleJoyStart(clientX, clientY, identifier) {
    if (G.mode !== 'playing') return;
    if (joystickTouchId !== null) return;
    joystickTouchId = identifier;

    const center = getBaseCenter();
    const distFromCenter = Math.hypot(clientX - center.x, clientY - center.y);

    if (distFromCenter < 110) {
      // Touch is close enough to existing base, anchor origin to center of base
      joyOrigin = { x: center.x, y: center.y };
    } else {
      // Reposition base dynamically directly under thumb for effortless reach
      if (joystickBase) {
        joystickBase.style.left = `${clientX - 68}px`;
        joystickBase.style.bottom = 'auto';
        joystickBase.style.top = `${clientY - 68}px`;
      }
      joyOrigin = { x: clientX, y: clientY };
    }

    handleJoyMove(clientX, clientY);
  }

  function handleJoyMove(clientX, clientY) {
    const dx = clientX - joyOrigin.x;
    const dy = clientY - joyOrigin.y;
    const dist = Math.hypot(dx, dy);

    // If thumb drags far beyond radius * 1.5, dynamically slide the base to follow thumb
    if (dist > maxR * 1.5) {
      const a = Math.atan2(dy, dx);
      joyOrigin.x = clientX - Math.cos(a) * (maxR * 1.5);
      joyOrigin.y = clientY - Math.sin(a) * (maxR * 1.5);
      if (joystickBase) {
        joystickBase.style.left = `${joyOrigin.x - 68}px`;
        joystickBase.style.bottom = 'auto';
        joystickBase.style.top = `${joyOrigin.y - 68}px`;
      }
    }

    const currentDx = clientX - joyOrigin.x;
    const currentDy = clientY - joyOrigin.y;
    const currentDist = Math.hypot(currentDx, currentDy);
    const clampedDist = Math.min(currentDist, maxR);
    const angle = Math.atan2(currentDy, currentDx);

    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    if (joystickKnob) {
      joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    // Deadzone and exponential response curve for steering
    if (clampedDist < 6) {
      touchAxis.x = 0;
      touchAxis.z = 0;
    } else {
      const norm = (clampedDist - 6) / (maxR - 6);
      const power = Math.pow(norm, 1.1);
      touchAxis.x = Math.cos(angle) * power;
      touchAxis.z = Math.sin(angle) * power;
    }
  }

  function handleJoyEnd() {
    joystickTouchId = null;
    touchAxis.x = 0;
    touchAxis.z = 0;
    if (joystickKnob) {
      joystickKnob.style.transform = 'translate(0px, 0px)';
    }
    if (joystickBase) {
      joystickBase.style.left = '';
      joystickBase.style.top = '';
      joystickBase.style.bottom = '';
    }
  }

  if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      handleJoyStart(t.clientX, t.clientY, t.identifier);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === joystickTouchId) {
          handleJoyMove(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const onJoyEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          handleJoyEnd();
          break;
        }
      }
    };
    joystickZone.addEventListener('touchend', onJoyEnd, { passive: false });
    joystickZone.addEventListener('touchcancel', onJoyEnd, { passive: false });

    // Pointer events for desktop testing and mouse/stylus emulation
    joystickZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      handleJoyStart(e.clientX, e.clientY, e.pointerId);
      const onMove = (pe) => {
        if (pe.pointerId === joystickTouchId) handleJoyMove(pe.clientX, pe.clientY);
      };
      const onUp = (pe) => {
        if (pe.pointerId === joystickTouchId) {
          handleJoyEnd();
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  // Helper for responsive multi-event button binding with debounce
  function bindTouchAction(el, fn) {
    if (!el) return;
    let lastExec = 0;
    const exec = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const now = performance.now();
      if (now - lastExec < 80) return; // Debounce multi-events (pointerdown + touchstart + click)
      lastExec = now;
      fn();
    };
    el.addEventListener('pointerdown', exec, { passive: false });
    el.addEventListener('touchstart', exec, { passive: false });
    el.addEventListener('click', exec);
  }

  // 2. Dash Button
  const dashBtn = $('touch-dash-btn');
  bindTouchAction(dashBtn, () => triggerDash());

  // 3. Specials (Q, E, R) with Tactile Feedback
  ['q', 'e', 'r'].forEach((k, idx) => {
    const btn = $(`touch-btn-${k}`);
    bindTouchAction(btn, () => {
      if (navigator.vibrate) try { navigator.vibrate(25); } catch(err){}
      useSpecial(idx);
    });
  });

  // 4. One-Handed Layout Handedness Toggle (Left / Right Hand)
  const handToggle = $('touch-hand-toggle');
  const actionPad = $('touch-action-pad');
  const handToggleLabel = $('th-toggle-label');
  const handToggleIcon = $('th-toggle-icon');
  if (handToggleIcon) handToggleIcon.innerHTML = getIcon('hand', 14);

  let currentHandMode = localStorage.getItem('lbs_hand_mode') || 'right';
  function applyHandMode(mode) {
    currentHandMode = mode;
    localStorage.setItem('lbs_hand_mode', mode);
    if (actionPad) {
      if (mode === 'left') {
        actionPad.classList.add('hand-mode-left');
        actionPad.classList.remove('hand-mode-right');
        if (handToggleLabel) handToggleLabel.textContent = '1-HAND [L]';
      } else {
        actionPad.classList.add('hand-mode-right');
        actionPad.classList.remove('hand-mode-left');
        if (handToggleLabel) handToggleLabel.textContent = '1-HAND [R]';
      }
    }
  }
  applyHandMode(currentHandMode);

  if (handToggle) {
    bindTouchAction(handToggle, () => {
      applyHandMode(currentHandMode === 'right' ? 'left' : 'right');
      Audio.playGem();
    });
  }

  // 5. Portal Descent Button
  const portalBtn = $('touch-portal-btn');
  bindTouchAction(portalBtn, () => {
    if (realmPortal && realmPortal.active) enterRealmPortal();
  });
}

function axis() {
  let x = touchAxis.x || 0, z = touchAxis.z || 0;
  if (keys['w'] || keys['arrowup']) z -= 1;
  if (keys['s'] || keys['arrowdown']) z += 1;
  if (keys['a'] || keys['arrowleft']) x -= 1;
  if (keys['d'] || keys['arrowright']) x += 1;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return [x, z];
}

// ============================================================= PLAYER
function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  scene.remove(g);
}
function createPlayer(cls) {
  const prevHp = player ? player.hp : PLAYER.hp, prevMax = player ? player.maxHp : PLAYER.hp;
  if (player && player.group) disposeGroup(player.group);
  const m = buildPlayer(cls, CLASSES[cls].weapon);
  const g = m.group;
  scene.add(g); enableShadows(g);
  player = {
    group: g, parts: m.parts, tint: m.tint,
    pos: g.position, vel: new THREE.Vector3(),
    facing: new THREE.Vector3(0, 0, -1),
    hp: prevHp, maxHp: prevMax,
    dashT: 0, dashCd: 0, iframes: 0, hitCd: 0, flash: 0, attackT: 0, attackKind: null,
    cls,
  };
}

function updatePlayer(dt) {
  const [ax, az] = axis();
  const moving = !!(ax || az);
  if (moving) { 
    tmp.set(ax, 0, az).normalize(); 
    player.facing.copy(tmp); 
  }

  if (keys[' ']) triggerDash();
  const dashing = player.dashT > 0;

  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) G.combo = 0;
  }

  // Fluid velocity: higher top-speed with responsive lerping
  if (dashing) {
    player.vel.copy(player.facing).multiplyScalar(PLAYER.dashSpeed);
    player.trailT -= dt;
    if (player.trailT <= 0) { spawnAfterimage(); player.trailT = 0.025; }
  } else {
    tmp2.set(0, 0, 0);
    if (moving) tmp2.set(ax, 0, az).normalize().multiplyScalar(P.speed);
    player.vel.lerp(tmp2, 1 - Math.pow(0.0001, dt)); // fluid exponential decay
  }
  player.pos.addScaledVector(player.vel, dt);

  const lim = ARENA.size / 2 - 1.5;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);

  // Smooth rotational facing with dynamic banking / lean into turn
  const targetAngle = Math.atan2(player.facing.x, player.facing.z);
  let d = targetAngle - player.group.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  player.group.rotation.y += d * Math.min(1, dt * 18);

  const speedSq = player.vel.lengthSq();
  const speedNorm = Math.min(1, Math.sqrt(speedSq) / (P.speed || 7.6));
  const movingNow = speedSq > 0.4;

  // Athletic running bob & bank roll into sharp turns
  const rollTarget = -d * 0.45 * speedNorm;
  player.group.rotation.z = THREE.MathUtils.lerp(player.group.rotation.z || 0, rollTarget, dt * 12);
  // Forward pitch when sprinting forward
  player.group.rotation.x = THREE.MathUtils.lerp(player.group.rotation.x || 0, movingNow ? 0.12 : 0, dt * 10);

  player.group.position.y = Math.abs(Math.sin(G.time * 14)) * (movingNow ? 0.12 * speedNorm : 0.02);
  animatePlayerLimbs(dt, movingNow, speedNorm);

  player.dashT -= dt; player.dashCd -= dt; player.iframes -= dt; player.hitCd -= dt;
  if (player.flash > 0) {
    player.flash = Math.max(0, player.flash - dt * 4);
    for (const m of player.tint) m.emissive.setRGB(player.flash, 0, 0);
  }
  if (modifiers.regen > 0 && player.hp < player.maxHp)
    player.hp = Math.min(player.maxHp, player.hp + modifiers.regen * dt);
}

function animatePlayerLimbs(dt, moving, speedNorm = 1) {
  const p = player.parts;
  const runFreq = 14;
  const legCycle = Math.sin(G.time * runFreq) * 0.75 * (moving ? speedNorm : 0.08);
  const armCycle = Math.cos(G.time * runFreq) * 0.65 * (moving ? speedNorm : 0.08);
  const breathe = Math.sin(G.time * 2.8) * 0.04;
  
  // Dynamic leg strides & natural knee flex
  p.legL.rotation.x = legCycle;
  p.legR.rotation.x = -legCycle;
  p.torso.rotation.y = THREE.MathUtils.lerp(p.torso.rotation.y, (moving ? -legCycle * 0.18 : 0), dt * 15);

  const kind = p.weaponKind;

  if (kind === 'magic') {
    p.armL.rotation.x = -0.45 + breathe - armCycle * 0.3;
    p.armR.rotation.x = -0.6 + breathe + armCycle * 0.3;
    const w = p.floatWeapon;
    if (w) {
      w.position.y = 1.5 + Math.sin(G.time * 3.5) * 0.22;
      w.position.x = 0.72 + Math.sin(G.time * 2.0) * 0.14;
      w.rotation.z = Math.sin(G.time * 2.5) * 0.3;
      let s = 1;
      if (player.attackT > 0) { 
        player.attackT -= dt; 
        s = 1 + (player.attackT / 0.2) * 0.9; 
      }
      if (w.userData.orb) w.userData.orb.scale.setScalar(s);
    }
    return;
  }

  // Left arm counter-balances movement or steadies attack
  p.armL.rotation.x = (player.attackT > 0 ? -1.3 : -0.7 + armCycle * 0.7 + breathe);
  p.armL.rotation.z = (player.attackT > 0 ? -0.3 : 0.15);

  if (player.attackT > 0) {
    player.attackT -= dt;
    const dur = kind === 'sword' ? 0.28 : 0.18;
    const prog = Math.min(1, Math.max(0, 1 - player.attackT / dur));
    
    if (kind === 'sword') {
      const dir = player.slashDir ? 1 : -1;
      // High-impact dynamic martial sword combo (horizontal & diagonal cleave)
      // Anticipation -> explosive swing -> follow-through
      const swingEase = Math.sin(prog * Math.PI);
      const angle = (prog * 2.8 - 1.4) * dir; // wide horizontal arc
      
      p.armR.rotation.x = -1.55 + Math.cos(prog * Math.PI) * 0.55; 
      p.armR.rotation.y = angle;
      p.armR.rotation.z = dir * (0.85 - swingEase * 0.65);
      
      // Sword tilts along the cutting plane
      if (p.weapon) {
        p.weapon.rotation.z = dir * (1.1 - prog * 2.2);
        p.weapon.rotation.x = 0.4 + swingEase * 0.5;
      }
      // Torso rotates into the power stroke
      p.torso.rotation.y = -angle * 0.45;
    } else if (kind === 'bow') {
      // ---- ARCHER (AREN): 2-Handed Draw, Aim Tension & Release Recoil ----
      const drawPhase = Math.sin(prog * Math.PI);
      // Right arm (draw hand pulling the arrow string back to cheek)
      p.armR.rotation.x = -1.45 - drawPhase * 0.45;
      p.armR.rotation.y = -0.35 + drawPhase * 0.55; // pulls back along shoulder line
      p.armR.rotation.z = -0.25;

      // Left arm (bow hand extending out straight toward target)
      p.armL.rotation.x = -1.52;
      p.armL.rotation.y = 0.25;
      p.armL.rotation.z = 0.15;

      // Bow tilts dynamically and vibrates on release snap
      if (p.weapon) {
        p.weapon.rotation.z = -Math.PI / 2 + Math.sin(prog * Math.PI * 4) * (1 - prog) * 0.25;
      }
      p.torso.rotation.y = -0.28 + drawPhase * 0.4; // archer side-stance aiming
    } else {
      p.armR.rotation.x = -1.25 - Math.sin(prog * Math.PI) * 0.55;
      p.armR.rotation.y = 0;
      p.armR.rotation.z = 0;
    }
  } else {
    // Idle / running armed ready pose
    p.armR.rotation.x = -1.05 + breathe + armCycle * 0.35;
    p.armR.rotation.y = THREE.MathUtils.lerp(p.armR.rotation.y, 0, dt * 15);
    p.armR.rotation.z = THREE.MathUtils.lerp(p.armR.rotation.z, 0, dt * 15);
    if (kind === 'bow') {
      p.armL.rotation.x = THREE.MathUtils.lerp(p.armL.rotation.x, -0.6 + armCycle * 0.35, dt * 10);
      p.armL.rotation.y = THREE.MathUtils.lerp(p.armL.rotation.y, 0, dt * 10);
      p.armL.rotation.z = THREE.MathUtils.lerp(p.armL.rotation.z, 0, dt * 10);
    }
    if (p.weapon && kind === 'sword') {
      p.weapon.rotation.z = THREE.MathUtils.lerp(p.weapon.rotation.z, 0, dt * 12);
      p.weapon.rotation.x = 0.35;
    }
  }
}

function triggerAttack(kind) {
  player.attackT = kind === 'sword' ? 0.28 : (kind === 'bow' ? 0.24 : 0.18); 
  player.attackKind = kind;
  if (kind === 'sword') player.slashDir = !player.slashDir;
}

function updateCamera(dt) {
  if (G.mode === 'menu') {
    // Cinematic AAA Hero Select Framing: intimate eye-level view centered between panels
    const isMobile = window.innerWidth <= 860;
    const orbitSpeed = 0.16;
    const sway = Math.sin(G.time * orbitSpeed) * (isMobile ? 0.35 : 0.75);
    const dist = (isMobile ? 5.6 : 4.8) + Math.cos(G.time * orbitSpeed * 0.5) * 0.2;
    camera.position.x = sway;
    camera.position.z = dist;
    camera.position.y = (isMobile ? 1.55 : 1.75) + Math.sin(G.time * 0.35) * 0.08;
    camera.lookAt(0, 1.25, 0);
    return;
  }
  const lx = THREE.MathUtils.clamp(player.vel.x * 0.18, -2.5, 2.5);
  const lz = THREE.MathUtils.clamp(player.vel.z * 0.18, -2.5, 2.5);
  tmp.set(player.pos.x + lx, 23, player.pos.z + 16.5 + lz);
  camera.position.lerp(tmp, 1 - Math.pow(0.0015, dt));
  camera.position.x += G.shakeX || 0;
  camera.position.y += G.shakeY || 0;
  camera.lookAt(player.pos.x + lx * 0.6, 1.1, player.pos.z + lz * 0.6);

  // Dynamic Speed-FOV expansion during dashes and rapid sprint
  const speed = player.vel.length();
  const targetFov = player.dashT > 0 ? 56 : (speed > 8 ? 51 : 48);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 10);
    camera.updateProjectionMatrix();
  }
}

function updateLights() {
  const s = scene.userData.sun;
  s.position.set(player.pos.x + 24, 48, player.pos.z + 18);
  s.target.position.set(player.pos.x, 0, player.pos.z);
  s.target.updateMatrixWorld();
}

function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial)) o.castShadow = true;
  });
}

// ============================================================= ENEMIES
function getEnemy(type) {
  const pool = freeEnemy[type] || (freeEnemy[type] = []);
  let e = pool.pop();
  if (!e) {
    const m = buildEnemy(type);
    scene.add(m.group); enableShadows(m.group);
    e = { mesh: m.group, parts: m.parts, walk: m.walk, type };
  }
  e.mesh.visible = true; e.phase = Math.random() * 6.28;
  return e;
}
function releaseEnemy(e) {
  if (e.halo) {
    e.mesh.remove(e.halo);
    e.halo.geometry?.dispose?.();
    e.halo.material?.dispose?.();
    e.halo = null;
  }
  e.alive = false; e.mesh.visible = false;
  (freeEnemy[e.type] || (freeEnemy[e.type] = [])).push(e);
}

function spawnEnemy(type) {
  const cfg = ENEMIES[type];
  const e = getEnemy(type);
  const ang = Math.random() * Math.PI * 2;
  const r = ARENA.spawnRing + Math.random() * 8;      // spawn in a ring around the player, just off-screen
  const lim = ARENA.size / 2 - 2;
  const x = THREE.MathUtils.clamp(player.pos.x + Math.cos(ang) * r, -lim, lim);
  const z = THREE.MathUtils.clamp(player.pos.z + Math.sin(ang) * r, -lim, lim);
  e.cfg = cfg; e.isBoss = false; e.behavior = cfg.behavior;
  
  // Exponential scaling from G.spec
  e.maxHp = Math.round(cfg.hp * (G.spec?.hpScale || 1)); e.hp = e.maxHp;
  e.speed = cfg.speed * (G.spec?.spdScale || 1);
  e.dmg = Math.round(cfg.dmg * (G.spec?.dmgScale || 1));
  e.radius = cfg.radius; e.xp = cfg.xp;
  
  // Faster ranged shots in later waves
  e.shotCd = cfg.shotCd ? Math.max(0.65, cfg.shotCd * (G.spec?.shotCdScale || 1)) : 0;
  e.fuse = -1; e.punch = 0; e.slow = 0;
  e.mesh.position.set(x, 0, z);
  e.mesh.scale.setScalar(1);

  // Elite Champion Chance (Golden Crown / High Stats / Heavy Loot)
  const eliteChance = G.spec?.eliteChance || 0;
  if (eliteChance > 0 && Math.random() < eliteChance) {
    e.isElite = true;
    e.maxHp = Math.round(e.maxHp * 1.85); e.hp = e.maxHp;
    e.dmg = Math.round(e.dmg * 1.45);
    e.speed *= 1.15;
    e.xp = Math.round(e.xp * 3.5);
    e.mesh.scale.setScalar(1.28);
    
    // Glowing Champion Halo
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.68, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = (cfg.size ? cfg.size[1] : 1.8) + 0.35;
    e.mesh.add(halo);
    e.halo = halo;
  } else {
    e.isElite = false;
  }

  e.alive = true;
  enemies.push(e);
}

function spawnBoss(key) {
  const cfg = BOSSES[key];
  const base = { zombie: 'zombie', skeleton: 'skeleton', creeper: 'creeper' }[cfg.tex] || 'zombie';
  const m = buildBoss(base);
  const s = cfg.size[1] / (base === 'creeper' ? 1.8 : 2.0);
  m.group.scale.setScalar(s);
  const lim = ARENA.size / 2 - 4;
  m.group.position.set(THREE.MathUtils.clamp(player.pos.x, -lim, lim), 0, THREE.MathUtils.clamp(player.pos.z - 20, -lim, lim));
  scene.add(m.group); enableShadows(m.group);

  const scaledHp = Math.round(cfg.hp * (G.spec?.bossHpScale || G.spec?.hpScale || 1));
  const scaledDmg = Math.round(cfg.dmg * (G.spec?.bossDmgScale || G.spec?.dmgScale || 1));
  const attacks = (cfg.attacks && cfg.attacks.length) ? cfg.attacks : [
    { id: 'atk1', name: 'Primary Assault', telegraph: 1.0 },
    { id: 'atk2', name: 'Zoning Barrage', telegraph: 1.1 },
    { id: 'atk3', name: 'Cataclysmic Surge', telegraph: 1.3 }
  ];

  const e = {
    mesh: m.group, parts: m.parts, walk: m.walk, type: 'boss', isBoss: true, cfg,
    bossKey: key,
    maxHp: scaledHp, hp: scaledHp, speed: cfg.speed * (G.spec?.spdScale || 1), dmg: scaledDmg,
    radius: cfg.radius, xp: cfg.xp, behavior: 'boss', bossScale: s,
    punch: 0, alive: true, phase: 0,
    name: cfg.name, title: cfg.title || 'ENCOUNTER', enraged: false,

    // 3-Attack Sequences Engine
    attacks,
    attackIndex: 0,
    state: 'idle',           // 'idle' | 'telegraph' | 'executing' | 'recovery'
    stateTimer: 2.2,         // breathing room before sequence 1
    telegraphDur: 1.0,
    activeAttack: null,
    seqData: {},
    telegraphObjects: [],
  };
  enemies.push(e);
  G.boss = e;
  G.bossGhostPct = 100;
  bannerBoss(cfg.name);
}

function animateEnemy(e) {
  const t = G.time * 8 + e.phase;
  if (e.walk === 'biped') {
    const s = Math.sin(t) * 0.5; e.parts.legL.rotation.x = s; e.parts.legR.rotation.x = -s;
  } else if (e.walk === 'quad') {
    const s = Math.sin(t) * 0.4, L = e.parts.legs;
    L[0].rotation.x = s; L[3].rotation.x = s; L[1].rotation.x = -s; L[2].rotation.x = -s;
  } else if (e.walk === 'spider') {
    const L = e.parts.legs;
    for (let i = 0; i < L.length; i++) L[i].rotation.x = (i % 4 - 1.5) * 0.2 + Math.sin(t * 2 + i) * 0.3;
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.alive) { if (!e.isBoss) releaseEnemy(e); enemies.splice(i, 1); continue; }

    // Bleed / Poison DoT
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      e.bleedTick = (e.bleedTick || 0) + dt;
      if (e.bleedTick >= 0.5) {
        e.bleedTick = 0;
        damageEnemy(e, e.bleedDmg || 10);
        burst(e.mesh.position, 0xef4444, 3);
      }
      if (!e.alive) { if (!e.isBoss) releaseEnemy(e); enemies.splice(i, 1); continue; }
    }

    // Frozen Solid (Cannot move, rotate, attack, or explode)
    if (e.frozen > 0) {
      e.frozen -= dt;
      continue;
    }

    // Stunned
    if (e.stun > 0) {
      e.stun -= dt;
      continue;
    }

    tmp.set(player.pos.x - e.mesh.position.x, 0, player.pos.z - e.mesh.position.z);
    const dist = tmp.length();
    tmp.normalize();
    e.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
    if (e.slow > 0) e.slow -= dt;
    const spd = e.speed * (e.slow > 0 ? 0.35 : 1);
    const base = 0;

    if (e.isBoss) { updateBoss(e, dt, dist, tmp); }
    else if (e.behavior === 'archer') {
      const want = e.cfg.range * 0.6;
      if (dist > want) e.mesh.position.addScaledVector(tmp, spd * dt);
      else { tmp2.set(-tmp.z, 0, tmp.x); e.mesh.position.addScaledVector(tmp2, spd * 0.6 * dt); }
      e.shotCd -= dt;
      if (e.shotCd <= 0 && dist < e.cfg.range) {
        const pSpeed = (e.cfg.projSpeed || 14) * (G.spec?.projSpeedScale || 1);
        fireEnemyShot(e, pSpeed);
        e.shotCd = Math.max(0.65, (e.cfg.shotCd || 1.6) * (G.spec?.shotCdScale || 1));
      }
    } else if (e.behavior === 'bomber') {
      if (e.fuse < 0 && dist < e.cfg.aoe * 0.8) e.fuse = e.cfg.fuse;
      if (e.fuse >= 0) { e.fuse -= dt; e.mesh.scale.setScalar((e.isElite ? 1.28 : 1) + Math.sin(G.time * 30) * 0.18 + (e.cfg.fuse - e.fuse)); if (e.fuse <= 0) { explode(e); enemies.splice(i, 1); continue; } }
      else e.mesh.position.addScaledVector(tmp, spd * dt);
    } else { // chase + flank
      if (e.behavior === 'flank') { tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(Math.sin(G.time * 3 + e.mesh.id) * 0.5); tmp.add(tmp2).normalize(); }
      e.mesh.position.addScaledVector(tmp, spd * dt);
    }

    const lim = ARENA.size / 2 - 1;
    e.mesh.position.x = THREE.MathUtils.clamp(e.mesh.position.x, -lim, lim);
    e.mesh.position.z = THREE.MathUtils.clamp(e.mesh.position.z, -lim, lim);
    if (e.punch > 0) e.punch -= dt * 4;
    if (!e.isBoss && e.fuse < 0) e.mesh.scale.setScalar((e.isElite ? 1.28 : 1) + Math.max(0, e.punch) * 0.4);
    if (e.fuse < 0) animateEnemy(e);
    e.mesh.position.y = base + (e.walk === 'spider' ? 0 : Math.abs(Math.sin(G.time * 8 + e.phase)) * 0.08);

    // contact damage
    if (dist < e.radius + PLAYER.radius + 0.15) {
      hitPlayer(e.dmg, e);
      e.mesh.position.addScaledVector(tmp, -0.4); // tiny bounce
    }
  }
}

function clearBossTelegraphs(e) {
  if (!e || !e.telegraphObjects) return;
  for (const obj of e.telegraphObjects) {
    if (obj.parent) obj.parent.remove(obj);
    else scene.remove(obj);
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
    else obj.material?.dispose?.();
  }
  e.telegraphObjects.length = 0;
  if (e.seqData && e.seqData.beam) {
    scene.remove(e.seqData.beam);
    e.seqData.beam.geometry?.dispose?.();
    e.seqData.beam.material?.dispose?.();
    e.seqData.beam = null;
  }
}

function spawnBossAfterimage(pos, color = 0x4ade80) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 3.8, 2.0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })
  );
  m.position.set(pos.x, 2.0, pos.z);
  scene.add(m);
  fx.push({ mesh: m, life: 0.32, maxLife: 0.32 });
}

function startBossTelegraph(e, atk) {
  clearBossTelegraphs(e);
  e.seqData = { id: atk.id, timer: 0 };
  const bpos = e.mesh.position;
  const ppos = player.pos;

  if (e.bossKey === 'zombieKing') {
    if (atk.id === 'earthshaker') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 7.5, 32),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(bpos.x, 0.08, bpos.z);
      ring.scale.setScalar(0.1);
      scene.add(ring);
      e.telegraphObjects.push(ring);
      e.seqData.ring = ring;
      e.seqData.noBob = true;
    } else if (atk.id === 'tomb_legion') {
      e.seqData.fissurePositions = [
        ppos.clone(),
        new THREE.Vector3(ppos.x + 3.8, 0, ppos.z - 2.5),
        new THREE.Vector3(ppos.x - 3.8, 0, ppos.z + 2.5)
      ];
      for (const pos of e.seqData.fissurePositions) {
        const rune = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 2.6, 24),
          new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        rune.rotation.x = -Math.PI / 2;
        rune.position.set(pos.x, 0.08, pos.z);
        scene.add(rune);
        e.telegraphObjects.push(rune);
      }
    } else if (atk.id === 'monarch_charge') {
      const dir = new THREE.Vector3().subVectors(ppos, bpos).setY(0).normalize();
      e.seqData.chargeDir = dir;
      e.seqData.lockFacing = true;
      e.mesh.rotation.y = Math.atan2(dir.x, dir.z);

      const pathMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 28),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.rotation.z = Math.atan2(dir.x, dir.z);
      pathMesh.position.set(bpos.x + dir.x * 14, 0.08, bpos.z + dir.z * 14);
      scene.add(pathMesh);
      e.telegraphObjects.push(pathMesh);
    }
  } else if (e.bossKey === 'blazeLord') {
    if (atk.id === 'spiral_nova') {
      const novaRing = new THREE.Mesh(
        new THREE.RingGeometry(2.0, 3.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xff6a28, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      novaRing.rotation.x = -Math.PI / 2;
      novaRing.position.set(bpos.x, 1.2, bpos.z);
      scene.add(novaRing);
      e.telegraphObjects.push(novaRing);
      e.seqData.ring = novaRing;
    } else if (atk.id === 'meteor_strike') {
      e.seqData.meteorPositions = [
        ppos.clone(),
        new THREE.Vector3(ppos.x + 5, 0, ppos.z + 4),
        new THREE.Vector3(ppos.x - 5, 0, ppos.z - 4),
        new THREE.Vector3(ppos.x + (Math.random() - 0.5) * 6, 0, ppos.z + (Math.random() - 0.5) * 6)
      ];
      for (const pos of e.seqData.meteorPositions) {
        const reticle = new THREE.Mesh(
          new THREE.RingGeometry(0.6, 3.6, 24),
          new THREE.MeshBasicMaterial({ color: 0xff3b00, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        reticle.rotation.x = -Math.PI / 2;
        reticle.position.set(pos.x, 0.08, pos.z);
        scene.add(reticle);
        e.telegraphObjects.push(reticle);
      }
    } else if (atk.id === 'infernal_vortex') {
      const vRing = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 9.5, 32),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      vRing.rotation.x = -Math.PI / 2;
      vRing.position.set(bpos.x, 0.08, bpos.z);
      vRing.scale.setScalar(0.1);
      scene.add(vRing);
      e.telegraphObjects.push(vRing);
      e.seqData.ring = vRing;
    }
  } else if (e.bossKey === 'warden') {
    if (atk.id === 'void_blink') {
      const behindDir = player.facing.clone().negate().setY(0).normalize();
      const riftPos = player.pos.clone().addScaledVector(behindDir, 4.5);
      const lim = ARENA.size / 2 - 3;
      riftPos.x = THREE.MathUtils.clamp(riftPos.x, -lim, lim);
      riftPos.z = THREE.MathUtils.clamp(riftPos.z, -lim, lim);
      e.seqData.riftPos = riftPos;

      const rift = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 3.0, 24),
        new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      rift.rotation.x = -Math.PI / 2;
      rift.position.set(riftPos.x, 0.08, riftPos.z);
      scene.add(rift);
      e.telegraphObjects.push(rift);
    } else if (atk.id === 'death_ray') {
      const dir = new THREE.Vector3().subVectors(ppos, bpos).setY(0).normalize();
      e.seqData.rayDir = dir;
      const rayGeo = new THREE.CylinderGeometry(0.08, 0.08, 26, 6);
      const rayMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.6 });
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.rotation.z = Math.PI / 2;
      ray.rotation.y = Math.atan2(dir.x, dir.z);
      ray.position.set(bpos.x + dir.x * 13, 2.2, bpos.z + dir.z * 13);
      scene.add(ray);
      e.telegraphObjects.push(ray);
      e.seqData.ray = ray;
    } else if (atk.id === 'event_horizon') {
      e.mesh.position.set(0, 0, 0);
      const centerRing = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 14.0, 36),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      centerRing.rotation.x = -Math.PI / 2;
      centerRing.position.set(0, 0.08, 0);
      scene.add(centerRing);
      e.telegraphObjects.push(centerRing);
    }
  }
}

function updateBossTelegraph(e, dt, dist, ndir) {
  const p = Math.max(0, Math.min(1, 1 - e.stateTimer / e.telegraphDur));

  if (e.bossKey === 'zombieKing') {
    if (e.activeAttack.id === 'earthshaker') {
      e.mesh.position.y = (e.cfg.size[1] / 2) + Math.sin(p * Math.PI) * 4.2;
      if (e.seqData.ring) {
        e.seqData.ring.scale.setScalar(p);
        e.seqData.ring.material.opacity = 0.4 + p * 0.4;
      }
    } else if (e.activeAttack.id === 'tomb_legion') {
      for (const obj of e.telegraphObjects) {
        obj.material.opacity = 0.4 + Math.sin(G.time * 12) * 0.3;
      }
    }
  } else if (e.bossKey === 'blazeLord') {
    if (e.activeAttack.id === 'spiral_nova') {
      e.mesh.rotation.y += dt * 14;
      if (e.seqData.ring) {
        e.seqData.ring.position.copy(e.mesh.position).setY(1.2);
        e.seqData.ring.rotation.z += dt * 8;
      }
    } else if (e.activeAttack.id === 'infernal_vortex') {
      if (e.seqData.ring) {
        e.seqData.ring.scale.setScalar(p);
        e.seqData.ring.material.opacity = 0.3 + p * 0.5;
      }
    }
  } else if (e.bossKey === 'warden') {
    if (e.activeAttack.id === 'death_ray') {
      const dir = new THREE.Vector3().subVectors(player.pos, e.mesh.position).setY(0).normalize();
      e.seqData.rayDir = dir;
      if (e.seqData.ray) {
        e.seqData.ray.rotation.y = Math.atan2(dir.x, dir.z);
        e.seqData.ray.position.set(e.mesh.position.x + dir.x * 13, 2.2, e.mesh.position.z + dir.z * 13);
      }
    }
  }
}

function startBossExecution(e, atk) {
  e.seqData = { id: atk.id, timer: 0 };
  const bpos = e.mesh.position;
  const ppos = player.pos;
  const dist = bpos.distanceTo(ppos);

  if (e.bossKey === 'zombieKing') {
    if (atk.id === 'earthshaker') {
      e.mesh.position.y = e.cfg.size[1] / 2;
      ringBurst(bpos, 7.5, 0x4ade80);
      shake(1.3);
      Audio.playExplosion();
      if (dist < 7.5) hitPlayer(Math.round(e.dmg * 1.5), e);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const spkPos = new THREE.Vector3(bpos.x + Math.cos(ang) * 4.8, 0.4, bpos.z + Math.sin(ang) * 4.8);
        burst(spkPos, 0x4ade80, 8);
      }
      e.state = 'recovery';
      e.stateTimer = e.enraged ? 0.9 : 1.5;
    } else if (atk.id === 'tomb_legion') {
      Audio.playSpecialSound('glacial');
      shake(0.9);
      for (const pos of (e.seqData.fissurePositions || [ppos])) {
        ringBurst(pos, 2.8, 0x22c55e);
        burst(pos, 0x22c55e, 14);
        if (player.pos.distanceTo(pos) < 2.8) hitPlayer(Math.round(e.dmg * 1.2), e);
      }
      spawnEnemy('skeleton');
      spawnEnemy('zombie');
      e.state = 'recovery';
      e.stateTimer = e.enraged ? 1.0 : 1.6;
    } else if (atk.id === 'monarch_charge') {
      e.seqData.execTimer = 1.0;
      e.seqData.speed = 22;
      Audio.playSpecialSound('aegis');
    }
  } else if (e.bossKey === 'blazeLord') {
    if (atk.id === 'spiral_nova') {
      e.seqData.execTimer = 1.6;
      e.seqData.pulse = 0;
      e.seqData.tick = 0;
      Audio.playSpecialSound('supernova');
    } else if (atk.id === 'meteor_strike') {
      e.seqData.meteorIndex = 0;
      e.seqData.execTimer = 1.8;
      e.seqData.tick = 0;
    } else if (atk.id === 'infernal_vortex') {
      e.seqData.execTimer = 1.5;
      Audio.playSpecialSound('singularity');
    }
  } else if (e.bossKey === 'warden') {
    if (atk.id === 'void_blink') {
      if (e.seqData.riftPos) e.mesh.position.copy(e.seqData.riftPos);
      Audio.playSpecialSound('singularity');
      burst(e.mesh.position, 0xa855f7, 26);
      shake(1.1);
      const facing = new THREE.Vector3().subVectors(player.pos, e.mesh.position).setY(0).normalize();
      spawnSwing(6.8, Math.PI * 1.5, facing, true);
      if (e.mesh.position.distanceTo(player.pos) < 6.8) {
        hitPlayer(Math.round(e.dmg * 1.5), e);
        player.pos.addScaledVector(facing, 6);
      }
      e.state = 'recovery';
      e.stateTimer = e.enraged ? 0.8 : 1.4;
    } else if (atk.id === 'death_ray') {
      e.seqData.execTimer = 2.0;
      e.seqData.sweepAngle = -0.55;
      Audio.playSpecialSound('supernova');
      const beamGeo = new THREE.CylinderGeometry(0.65, 0.65, 24, 12);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.85 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.z = Math.PI / 2;
      scene.add(beam);
      e.seqData.beam = beam;
    } else if (atk.id === 'event_horizon') {
      e.seqData.execTimer = 1.6;
      e.seqData.step = 0;
      Audio.playSpecialSound('supernova');
    }
  }
}

function updateBossExecution(e, dt, dist, ndir) {
  e.seqData.execTimer -= dt;

  if (e.bossKey === 'zombieKing') {
    if (e.seqData.id === 'monarch_charge') {
      const cdir = e.seqData.chargeDir;
      e.mesh.position.addScaledVector(cdir, e.seqData.speed * dt);
      if (Math.random() < 0.4) spawnBossAfterimage(e.mesh.position, 0x4ade80);

      if (dist < e.radius + PLAYER.radius + 0.6) {
        hitPlayer(Math.round(e.dmg * 1.4), e);
        player.pos.addScaledVector(cdir, 12);
        shake(0.8);
      }

      const lim = ARENA.size / 2 - 2;
      const hitWall = Math.abs(e.mesh.position.x) >= lim || Math.abs(e.mesh.position.z) >= lim;
      if (e.seqData.execTimer <= 0 || hitWall) {
        ringBurst(e.mesh.position, 4.2, 0xffd24a);
        Audio.playSword();
        if (dist < 4.2) hitPlayer(Math.round(e.dmg), e);
        e.seqData.lockFacing = false;
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 0.9 : 1.5;
      }
    }
  } else if (e.bossKey === 'blazeLord') {
    if (e.seqData.id === 'spiral_nova') {
      e.seqData.tick += dt;
      if (e.seqData.tick >= 0.18) {
        e.seqData.tick = 0;
        e.seqData.pulse++;
        for (let i = 0; i < 4; i++) {
          const ang = e.seqData.pulse * 0.38 + i * (Math.PI / 2);
          const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          spawnProjectile({
            kind: 'magic', from: 'enemy', origin: e.mesh.position,
            dir, speed: 13.5, dmg: Math.round(e.dmg * 0.75), life: 3.2, color: 0xff6a28
          });
        }
      }
      if (e.seqData.execTimer <= 0) {
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 1.0 : 1.6;
      }
    } else if (e.seqData.id === 'meteor_strike') {
      e.seqData.tick += dt;
      if (e.seqData.tick >= 0.38 && e.seqData.meteorIndex < (e.seqData.meteorPositions?.length || 4)) {
        e.seqData.tick = 0;
        const pos = e.seqData.meteorPositions[e.seqData.meteorIndex++];
        detonate(pos, 3.8, Math.round(e.dmg * 1.3));
        Audio.playExplosion();
      }
      if (e.seqData.execTimer <= 0) {
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 1.0 : 1.6;
      }
    } else if (e.seqData.id === 'infernal_vortex') {
      const pullDir = new THREE.Vector3().subVectors(e.mesh.position, player.pos).setY(0).normalize();
      player.pos.addScaledVector(pullDir, 7.5 * dt);
      if (Math.random() < 0.3) burst(e.mesh.position, 0xff7b00, 2);

      if (e.seqData.execTimer <= 0) {
        ringBurst(e.mesh.position, 9.5, 0xff4d15);
        shake(1.4);
        Audio.playExplosion();
        if (dist < 9.5) hitPlayer(Math.round(e.dmg * 1.6), e);
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 1.1 : 1.7;
      }
    }
  } else if (e.bossKey === 'warden') {
    if (e.seqData.id === 'death_ray') {
      e.seqData.sweepAngle += dt * 0.7;
      const baseAng = Math.atan2(e.seqData.rayDir.x, e.seqData.rayDir.z);
      const currAng = baseAng + e.seqData.sweepAngle;
      const curDir = new THREE.Vector3(Math.sin(currAng), 0, Math.cos(currAng));

      if (e.seqData.beam) {
        e.seqData.beam.rotation.y = currAng;
        e.seqData.beam.position.set(e.mesh.position.x + curDir.x * 12, 2.0, e.mesh.position.z + curDir.z * 12);
      }

      const toP = new THREE.Vector3().subVectors(player.pos, e.mesh.position).setY(0);
      const proj = toP.dot(curDir);
      if (proj > 0 && proj < 24) {
        const perp = new THREE.Vector3().subVectors(toP, curDir.clone().multiplyScalar(proj)).length();
        if (perp < 1.3 && player.iframes <= 0) {
          hitPlayer(Math.round(e.dmg * 0.85), e);
          burst(player.pos, 0xc084fc, 4);
        }
      }

      if (e.seqData.execTimer <= 0) {
        if (e.seqData.beam) {
          scene.remove(e.seqData.beam);
          e.seqData.beam.geometry.dispose();
          e.seqData.beam.material.dispose();
          e.seqData.beam = null;
        }
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 0.9 : 1.5;
      }
    } else if (e.seqData.id === 'event_horizon') {
      if (e.seqData.step === 0 && e.seqData.execTimer <= 1.2) {
        e.seqData.step = 1;
        Audio.playSpecialSound('singularity');
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          spawnProjectile({
            kind: 'magic', from: 'enemy', origin: new THREE.Vector3(0, 1.2, 0),
            dir, speed: 14, dmg: Math.round(e.dmg * 0.9), life: 3.5, color: 0xa855f7
          });
        }
      } else if (e.seqData.step === 1 && e.seqData.execTimer <= 0.6) {
        e.seqData.step = 2;
        Audio.playSpecialSound('singularity');
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          spawnProjectile({
            kind: 'magic', from: 'enemy', origin: new THREE.Vector3(0, 1.2, 0),
            dir, speed: 14, dmg: Math.round(e.dmg * 0.9), life: 3.5, color: 0xd8b4fe
          });
        }
      } else if (e.seqData.execTimer <= 0) {
        ringBurst(new THREE.Vector3(0, 0, 0), 14, 0xd8b4fe);
        shake(1.5);
        Audio.playSpecialSound('supernova');
        const pDistFromCenter = Math.hypot(player.pos.x, player.pos.z);
        if (pDistFromCenter > 3.5 && pDistFromCenter < 14) {
          hitPlayer(Math.round(e.dmg * 1.6), e);
        }
        e.state = 'recovery';
        e.stateTimer = e.enraged ? 1.0 : 1.6;
      }
    }
  }
}

function updateBoss(e, dt, dist, ndir) {
  // Titan Enrage phase below 50% HP
  if (!e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    e.speed *= 1.25;
    floatText(e.mesh.position, 'TITAN ENRAGED!', '#ff2200', 1.8);
    shake(1.2);
    Audio.playWaveStart(true);
  }
  if (e.enraged && Math.random() < 0.2) {
    burst(e.mesh.position, 0xff3b00, 1);
  }

  // Look toward player unless executing locked direction
  if (!e.seqData.lockFacing) {
    e.mesh.rotation.y = Math.atan2(ndir.x, ndir.z);
  }

  // Base bobbing
  if (!e.seqData.noBob) {
    e.mesh.position.y = (e.cfg.size[1] / 2) + Math.sin(G.time * 4) * 0.15;
  }

  // State Machine: 'idle' | 'telegraph' | 'executing' | 'recovery'
  e.stateTimer -= dt;

  if (e.state === 'idle') {
    e.mesh.position.addScaledVector(ndir, e.speed * dt);

    if (e.stateTimer <= 0 && e.attacks && e.attacks.length) {
      const atk = e.attacks[e.attackIndex % e.attacks.length];
      e.attackIndex = (e.attackIndex + 1) % e.attacks.length;
      e.activeAttack = atk;
      e.state = 'telegraph';
      e.telegraphDur = Math.max(0.65, (atk.telegraph || 1.1) * (e.enraged ? 0.75 : 1.0));
      e.stateTimer = e.telegraphDur;
      e.seqData = {};

      floatText(e.mesh.position, atk.name.toUpperCase(), '#ffd24a', 1.4);
      startBossTelegraph(e, atk);
    }
  } else if (e.state === 'telegraph') {
    updateBossTelegraph(e, dt, dist, ndir);
    if (e.stateTimer <= 0) {
      clearBossTelegraphs(e);
      e.state = 'executing';
      startBossExecution(e, e.activeAttack);
    }
  } else if (e.state === 'executing') {
    updateBossExecution(e, dt, dist, ndir);
  } else if (e.state === 'recovery') {
    e.mesh.position.addScaledVector(ndir, e.speed * 0.3 * dt);
    if (e.stateTimer <= 0) {
      e.state = 'idle';
      e.stateTimer = e.enraged ? 1.4 : 2.2;
      e.seqData = {};
    }
  }
}

function explode(e) {
  Audio.playExplosion();
  burst(e.mesh.position, 0x6fe04e, 26); ringBurst(e.mesh.position, e.cfg.aoe, 0x9fff6a); shake(0.7);
  if (player.pos.distanceTo(e.mesh.position) < e.cfg.aoe) hitPlayer(e.dmg, null);
  G.kills++; spawnOrb(e.mesh.position, e.xp * modifiers.xpMul);
  releaseEnemy(e);
}

function hitPlayer(dmg, source) {
  if (G.mode !== 'playing' || player.iframes > 0 || player.hitCd > 0) return;
  Audio.playHurt();
  player.hp -= dmg; player.hitCd = PLAYER.invulnAfterHit; player.flash = 1;
  shake(0.6); floatText(player.pos, '-' + Math.round(dmg), '#ff6b6b', 1.2);
  if (modifiers.thorns > 0 && source && source.alive) damageEnemy(source, dmg * modifiers.thorns);
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

function damageEnemy(e, dmg) {
  if (!e.alive) return;
  dmg *= modifiers.dmgMul;

  // Critical Strike Mechanics
  const critChance = modifiers.crit || 0.12;
  const isCrit = Math.random() < critChance;
  if (isCrit) {
    dmg *= 2.0;
    Audio.playHit(true);
    burst(e.mesh.position, 0xffd24a, 8);
    floatText(e.mesh.position, 'CRIT! ' + Math.round(dmg), '#ffd24a', 1.4);
  } else {
    Audio.playHit(false);
    floatText(e.mesh.position, Math.round(dmg), '#fff2a8', 1);
  }

  e.hp -= dmg; e.punch = 1;
  if (modifiers.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + dmg * modifiers.lifesteal);
  G.dmgWindow.push({ t: G.time, amt: dmg });
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.alive = false; e.mesh.visible = false;
  burst(e.mesh.position, enemyColor(e.type), 16);

  // Aggression Reward: Combo Streak & Escalating XP Multiplier
  G.combo = (G.combo || 0) + 1;
  G.comboTimer = 3.5;
  const comboMul = 1 + Math.min(1.0, (G.combo - 1) * 0.1);
  if (G.combo === 10 || G.combo === 25 || G.combo === 50 || G.combo === 100) {
    floatText(player.pos, `COMBO x${G.combo}!`, '#ffd24a', 1.6);
    shake(0.2);
  }

  G.kills++;
  spawnOrb(e.mesh.position, e.xp * modifiers.xpMul * comboMul);
  if (e.isBoss) {
    clearBossTelegraphs(e);
    Audio.playExplosion();
    disposeGroup(e.mesh);
    G.boss = null;
    bossDefeated();
  }
}

function enemyColor(t) {
  return { zombie: 0x4f8f3f, skeleton: 0xd8dadb, creeper: 0x5fb94e, spider: 0x7a2a22, boss: 0xffd24a }[t] || 0xffffff;
}

// ============================================================= WEAPONS
const UP = new THREE.Vector3(0, 1, 0);
function cloneWeapon(name) { return Object.assign({ key: name, t: 0 }, WEAPONS[name]); }
function initWeapons(wk) { WPN = { [wk]: cloneWeapon(wk) }; }

function nearest(range) {
  let best = null, bd = range * range;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.mesh.position.x - player.pos.x, dz = e.mesh.position.z - player.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateWeapons(dt) {
  for (const k in WPN) {
    const w = WPN[k]; w.t -= dt;
    if (w.t <= 0) {
      const fired = FIRE[k](w);                 // only attacks when a target is in range
      if (fired) { if (k === G.classWeapon) triggerAttack(k); w.t = w.cd * modifiers.cdMul; }
      else w.t = 0.06;                           // no target: re-check shortly, don't swing at air
    }
  }
}

const FIRE = {
  sword(w) {
    const r2 = w.range * w.range; let hit = false, inRange = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      tmp.set(e.mesh.position.x - player.pos.x, 0, e.mesh.position.z - player.pos.z);
      if (tmp.lengthSq() > r2) continue;
      inRange = true;
      const ang = tmp.clone().normalize().dot(player.facing);
      if (ang < Math.cos(w.arc / 2)) continue;
      damageEnemy(e, w.dmg); hit = true;
      e.mesh.position.addScaledVector(tmp.normalize(), w.knockback * 0.12);
    }
    if (!inRange) return false;            // nobody close — don't slash at air
    Audio.playSword();
    spawnSwing(w.range, w.arc, player.facing, hit);
    if (hit) shake(0.18);
    return true;
  },
  bow(w) {
    const t = nearest(w.range); if (!t) return false;
    tmp.set(t.mesh.position.x - player.pos.x, 0, t.mesh.position.z - player.pos.z).normalize();
    const n = w.count || 1;
    Audio.playBow();
    for (let i = 0; i < n; i++) {
      const d = tmp.clone().applyAxisAngle(UP, (i - (n - 1) / 2) * 0.17);
      spawnProjectile({ kind: 'arrow', from: 'player', dir: d, speed: w.speed, dmg: w.dmg, pierce: w.pierce || 0, life: 1.2, color: 0xf4e8c1 });
    }
    return true;
  },
  tnt(w) {
    const t = nearest(w.range); if (!t) return false;
    tmp.set(t.mesh.position.x - player.pos.x, 0, t.mesh.position.z - player.pos.z).normalize();
    spawnProjectile({ kind: 'tnt', from: 'player', dir: tmp.clone(), speed: 13, dmg: w.dmg, aoe: w.aoe, life: 0.75, color: 0xd64545 });
    return true;
  },
  snowball(w) {
    if (!nearest(w.range)) return false;
    const n = w.count || 6;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.cos(i / n * 7), 0, Math.sin(i / n * 7));
      spawnProjectile({ kind: 'snow', from: 'player', dir: d, speed: w.speed, dmg: w.dmg, pierce: 1, life: 0.9, slow: w.slowDur, color: 0xcfe9ff });
    }
    return true;
  },
  magic(w) {
    const t = nearest(w.range); if (!t) return false;
    tmp.set(t.mesh.position.x - player.pos.x, 0, t.mesh.position.z - player.pos.z).normalize();
    Audio.playMagic();
    spawnProjectile({ kind: 'magic', from: 'player', dir: tmp.clone(), speed: w.speed, dmg: w.dmg, pierce: w.pierce || 1, life: 1.3, color: 0xb98bff });
    return true;
  },
};

// ============================================================= PROJECTILES
let projGeo; const _matCache = {};
function matCache(color) { return _matCache[color] || (_matCache[color] = new THREE.MeshBasicMaterial({ color })); }

function buildArrowMesh(color) {
  const g = new THREE.Group();
  // 1. Sleek Wooden Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 6), matCache(0x523b20));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);

  // 2. Steel Arrowhead Point (Cone)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), matCache(0xe2e8f0));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.76;
  g.add(tip);

  // 3. Fletching Feathers (Crossed Plates)
  const fletchMat = matCache(color || 0x22c55e); // glowing emerald ranger fletching
  for (const rot of [0, Math.PI / 2]) {
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.32), fletchMat);
    fletch.position.z = -0.52;
    fletch.rotation.z = rot;
    g.add(fletch);
  }
  return g;
}

function spawnProjectile(o) {
  let mesh;
  if (o.kind === 'arrow') {
    mesh = buildArrowMesh(o.color);
  } else {
    if (!projGeo) projGeo = new THREE.BoxGeometry(0.35, 0.35, 0.7);
    mesh = new THREE.Mesh(projGeo, matCache(o.color));
    if (o.kind === 'magic') mesh.scale.set(1.3, 1.3, 1.0);
  }
  
  const src = o.origin || player.pos;
  mesh.position.set(src.x, 1, src.z);
  mesh.rotation.y = Math.atan2(o.dir.x, o.dir.z);
  scene.add(mesh);
  projectiles.push({
    mesh, vel: o.dir.clone().multiplyScalar(o.speed), dmg: o.dmg, life: o.life,
    from: o.from, kind: o.kind, pierce: o.pierce ?? 0, aoe: o.aoe || 0, slow: o.slow || 0, hit: new Set(),
    onHit: o.onHit || null,
  });
}
function fireEnemyShot(e, speed) {
  tmp.set(player.pos.x - e.mesh.position.x, 0, player.pos.z - e.mesh.position.z).normalize();
  const col = e.type === 'boss' ? 0xff8a3c : 0xcacfd2;
  spawnProjectile({ kind: 'eshot', from: 'enemy', origin: e.mesh.position, dir: tmp.clone(), speed, dmg: e.dmg, life: 3, color: col });
}

function detonate(pos, aoe, dmg) {
  Audio.playExplosion();
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z) < aoe) damageEnemy(e, dmg);
  }
  burst(pos, 0xffa23c, 24); ringBurst(pos, aoe, 0xffcf6a); shake(0.8);
}

function updateProjectiles(dt) {
  const lim = ARENA.size / 2;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.life -= dt;
    let dead = false;
    const pos = p.mesh.position;
    if (p.from === 'player') {
      if (p.kind === 'tnt') {
        let near = false;
        for (const e of enemies) {
          if (e.alive && Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z) < e.radius + 0.6) { near = true; break; }
        }
        if (near || p.life <= 0) { detonate(pos, p.aoe, p.dmg); dead = true; }
      } else {
        for (const e of enemies) {
          if (!e.alive || p.hit.has(e)) continue;
          if (Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z) < e.radius + 0.5) {
            damageEnemy(e, p.dmg); if (p.slow) e.slow = p.slow; p.hit.add(e);
            if (p.onHit) p.onHit(pos.clone(), e);
            if (p.kind === 'magic') burst(pos, 0xb98bff, 6);
            if (p.pierce-- <= 0) { dead = true; break; }
          }
        }
        if (p.life <= 0) dead = true;
      }
    } else {
      if (Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < PLAYER.radius + 0.5) { hitPlayer(p.dmg, null); dead = true; }
      if (p.life <= 0) dead = true;
    }
    if (Math.abs(pos.x) > lim || Math.abs(pos.z) > lim) dead = true;
    if (dead) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

// ============================================================= FX
let partGeo; const freeParts = []; const fx = [];
function getPart() {
  if (!partGeo) partGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  let p = freeParts.pop();
  if (!p) { p = { mesh: new THREE.Mesh(partGeo, matCache(0xffffff)) }; scene.add(p.mesh); }
  p.mesh.visible = true; return p;
}
function burst(pos, color, n) {
  for (let i = 0; i < n; i++) {
    const p = getPart();
    p.mesh.material = matCache(color);
    p.mesh.position.set(pos.x, pos.y, pos.z);
    p.vel = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 7 + 2, (Math.random() - 0.5) * 8);
    p.maxLife = p.life = 0.4 + Math.random() * 0.35;
    p.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    particles.push(p);
  }
}
function ringBurst(pos, radius, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.86, radius, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.12, pos.z); m.scale.setScalar(0.2);
  scene.add(m); fx.push({ mesh: m, life: 0.35, maxLife: 0.35, grow: true });
}
function spawnSwing(range, arc, facing, hit) {
  const g = new THREE.Group();
  g.position.set(player.pos.x, 1.0, player.pos.z);
  
  // Angle facing direction
  const baseAngle = Math.atan2(facing.x, facing.z);
  g.rotation.y = baseAngle;

  const dir = player.slashDir ? 1 : -1;
  const swingArc = arc || Math.PI * 1.35;

  // 1. Glowing curved crescent blade slash
  const arcGeo = new THREE.RingGeometry(range * 0.55, range * 1.05, 32, 1, -swingArc / 2, swingArc);
  const slashMat = new THREE.MeshBasicMaterial({ 
    color: 0xecfeff, 
    transparent: true, 
    opacity: 0.95, 
    side: THREE.DoubleSide, 
    depthWrite: false 
  });
  const slashMesh = new THREE.Mesh(arcGeo, slashMat);
  slashMesh.rotation.x = Math.PI / 2 + (dir * 0.15); // slightly angled cutting plane
  g.add(slashMesh);

  // 2. High-energy inner glow ribbon
  const innerGeo = new THREE.RingGeometry(range * 0.72, range * 0.95, 24, 1, -swingArc / 2, swingArc);
  const innerMat = new THREE.MeshBasicMaterial({ 
    color: 0x38bdf8, 
    transparent: true, 
    opacity: 0.8, 
    side: THREE.DoubleSide, 
    depthWrite: false 
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.rotation.x = Math.PI / 2 + (dir * 0.15);
  g.add(innerMesh);

  scene.add(g);
  fx.push({ 
    group: g, 
    slashMat, 
    innerMat, 
    life: 0.18, 
    maxLife: 0.18, 
    dir, 
    baseAngle, 
    range 
  });

  // 3. Emit kinetic sword sparks forward along the slash arc
  const sparkCount = hit ? 10 : 4;
  for (let i = 0; i < sparkCount; i++) {
    const p = getPart();
    p.mesh.material = matCache(hit ? 0xfef08a : 0xbae6fd);
    p.mesh.position.set(
      player.pos.x + facing.x * (range * 0.7) + (Math.random() - 0.5), 
      1.0 + (Math.random() - 0.5) * 0.4, 
      player.pos.z + facing.z * (range * 0.7) + (Math.random() - 0.5)
    );
    const spread = (Math.random() - 0.5) * 1.2;
    p.vel = new THREE.Vector3(
      facing.x * 6 + facing.z * spread * 5, 
      Math.random() * 4 + 1, 
      facing.z * 6 - facing.x * spread * 5
    );
    p.maxLife = p.life = 0.22 + Math.random() * 0.15;
    p.mesh.scale.setScalar(0.4 + Math.random() * 0.5);
    particles.push(p);
  }
}
function spawnAfterimage() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.45, depthWrite: false }));
  m.position.set(player.pos.x, 0.95, player.pos.z);
  m.rotation.y = player.group.rotation.y;
  scene.add(m); fx.push({ mesh: m, life: 0.28, maxLife: 0.28 });
}
function shake(a) { G.shakeMag = Math.max(G.shakeMag || 0, a); }

function updateFX(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 20 * dt; p.life -= dt;
    const s = Math.max(0, p.life / p.maxLife);
    p.mesh.scale.setScalar(s);
    if (p.life <= 0) { p.mesh.visible = false; freeParts.push(p); particles.splice(i, 1); }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    const s = Math.max(0, f.life / f.maxLife);

    if (f.group) {
      // Slashing crescent animation: expands, rotates slightly along swing, and fades
      const prog = 1 - s;
      f.slashMat.opacity = 0.95 * s;
      f.innerMat.opacity = 0.8 * s;
      const expand = 0.8 + prog * 0.35;
      f.group.scale.set(expand, expand, expand);
      f.group.rotation.y = f.baseAngle + (prog * 0.45 * f.dir);
      if (f.life <= 0) {
        disposeGroup(f.group);
        fx.splice(i, 1);
      }
    } else {
      f.mesh.material.opacity = (f.maxLife === 0.14 ? 0.28 : 0.85) * s;
      if (f.grow) f.mesh.scale.setScalar(THREE.MathUtils.lerp(f.max || 1, 0.2, s));
      if (f.life <= 0) { 
        scene.remove(f.mesh); 
        f.mesh.geometry.dispose(); 
        f.mesh.material.dispose(); 
        fx.splice(i, 1); 
      }
    }
  }
  if (G.shakeMag > 0) {
    G.shakeX = (Math.random() - 0.5) * G.shakeMag;
    G.shakeY = (Math.random() - 0.5) * G.shakeMag;
    G.shakeMag = Math.max(0, G.shakeMag - dt * 4);
  } else { G.shakeX = G.shakeY = 0; }
}

function worldToScreen(x, y, z) {
  tmp2.set(x, y, z).project(camera);
  return [(tmp2.x * 0.5 + 0.5) * innerWidth, (-tmp2.y * 0.5 + 0.5) * innerHeight, tmp2.z];
}
function floatText(pos, text, color, scale = 1) {
  const [sx, sy, sz] = worldToScreen(pos.x, (pos.y || 1) + 1.3, pos.z);
  if (sz > 1) return;
  const el = document.createElement('div');
  el.className = 'dmg'; el.textContent = text; el.style.color = color;
  el.style.left = sx + 'px'; el.style.top = sy + 'px'; el.style.fontSize = (11 * scale) + 'px';
  dom.dmglayer.appendChild(el);
  el.animate(
    [{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-44px)', opacity: 0 }],
    { duration: 650, easing: 'ease-out' }).onfinish = () => el.remove();
}

// ============================================================= XP / ORBS
let orbGeo, orbMat;
function spawnOrb(pos, value) {
  if (!orbGeo) { orbGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34); orbMat = new THREE.MeshBasicMaterial({ color: 0x45d6a0 }); }
  const mesh = new THREE.Mesh(orbGeo, orbMat);
  mesh.position.set(pos.x, 0.5, pos.z); scene.add(mesh);
  orbs.push({ mesh, value, t: Math.random() * 6 });
}
function updateOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const d = o.mesh.position.distanceTo(player.pos);
    o.t += dt; o.mesh.rotation.y += dt * 4;
    o.mesh.position.y = 0.5 + Math.sin(o.t * 4) * 0.12;
    if (d < P.pickupRange) o.mesh.position.lerp(player.pos, 1 - Math.pow(0.0004, dt));
    if (d < 0.9) {
      Audio.playXp();
      addXp(o.value);
      burst(o.mesh.position, 0x45d6a0, 4);
      scene.remove(o.mesh);
      orbs.splice(i, 1);
    }
  }
}
function xpForLevel(l) { return Math.round(XP.base * Math.pow(XP.growth, l - 1)); }
function addXp(v) {
  G.xp += v;
  while (G.xp >= G.xpNeed) {
    G.xp -= G.xpNeed; G.level++; G.xpNeed = xpForLevel(G.level); G.pendingLevels++;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * XP.perLevelHeal);
    
    // Powerup & Level-up Effects
    Audio.playLevelUp();
    floatText(player.pos, 'LEVEL UP!', '#ffd24a', 1.8);
    ringBurst(player.pos, 5.5, 0xffd24a);
    burst(player.pos, 0xffd24a, 24);
    burst(player.pos, 0x45d6a0, 16);
    shake(0.35);
    triggerPowerupFlash('#ffd24a');
  }
  maybeDraft();
}
function maybeDraft() {
  if (G.pendingLevels > 0 && !G.drafting && G.mode === 'playing') openDraft();
}

// ============================================================= PERKS
function eligiblePerks() {
  const melee = CLASSES[G.class] && CLASSES[G.class].melee;
  return PERKS.filter((p) => {
    if (p.requires && !WPN[p.requires]) return false;
    if (p.type === 'addweapon' && WPN[p.weapon]) return false;
    if (p.type === 'addweapon' && melee) return false;   // a swordsman never picks up ranged weapons
    if (p.type === 'weaponmod' && !WPN[p.weapon]) return false;
    return true;
  });
}
function openDraft() {
  G.drafting = true;
  const pool = eligiblePerks().slice();
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  G.draftChoices = picks;
  dom.perkdraft.innerHTML = picks.map((p, i) => `
    <div class="perkcard perk-${p.rarity || 'common'}" data-i="${i}">
      <span class="rarity-badge">${(p.rarity || 'common').toUpperCase()}</span>
      <div class="picon">${getIcon(p.icon, 36)}</div>
      <div class="ptitle">${p.title}</div>
      <div class="pdesc">${p.desc}</div>
      <div class="pkey">[ ${i + 1} ]</div>
    </div>`).join('');
  dom.perkdraft.querySelectorAll('.perkcard').forEach((c) =>
    c.addEventListener('click', () => pickDraft(+c.dataset.i)));
  dom.perkdraft.classList.add('show');
}
function pickDraft(i) {
  if (!G.drafting) return;
  const perk = G.draftChoices[i]; if (!perk) return;
  applyPerk(perk);
  G.pendingLevels--; G.drafting = false;
  dom.perkdraft.classList.remove('show'); dom.perkdraft.innerHTML = '';

  // Visual Powerup Acquisition FX & Audio
  Audio.playLevelUp();
  ringBurst(player.pos, 4.2, 0x38bdf8);
  burst(player.pos, 0x38bdf8, 20);
  shake(0.25);
  triggerPowerupFlash('#38bdf8');
  floatText(player.pos, `+ ${perk.title}`, '#38bdf8', 1.4);

  maybeDraft();
}
function triggerPowerupFlash(color = '#ffd24a') {
  if (!dom.powerupFlash) return;
  dom.powerupFlash.style.background = `radial-gradient(circle, ${color}55 0%, ${color}00 70%)`;
  dom.powerupFlash.animate([
    { opacity: 0.85 },
    { opacity: 0 }
  ], { duration: 420, easing: 'ease-out' });
}
function applyPerk(p) {
  switch (p.type) {
    case 'stat': P[p.stat] *= p.mul; break;
    case 'weaponmod': {
      const w = WPN[p.weapon]; if (!w) break;
      if (p.mul != null) w[p.field] *= p.mul;
      if (p.add != null) w[p.field] = (w[p.field] || 0) + p.add;
      if (p.extraField) w[p.extraField] = (w[p.extraField] || 0) * (p.extraMul || 1);
      break;
    }
    case 'global': if (p.field === 'cd') modifiers.cdMul *= p.mul; break;
    case 'addweapon': if (!WPN[p.weapon]) WPN[p.weapon] = cloneWeapon(p.weapon); break;
    case 'maxhp': player.maxHp += p.add; player.hp = player.maxHp; break;
    case 'regen': modifiers.regen += p.add; break;
    case 'thorns': modifiers.thorns += p.add; break;
    case 'xpmul': modifiers.xpMul *= p.mul; break;
    case 'lifesteal': modifiers.lifesteal += p.add; break;
    case 'glass': modifiers.dmgMul *= p.dmgMul; player.maxHp += p.hp; player.hp = Math.min(player.hp, player.maxHp); break;
    case 'crit': modifiers.crit = (modifiers.crit || 0.12) + p.add; break;
  }
}

// ============================================================= WAVES / MAPS
function startWave(n) {
  const spec = waveSpec(n);
  G.wave = n; G.spec = spec; G.waveActive = true;
  G.waitingForPortal = false;

  if (spec.mapIndex !== G.mapIndex) {       // entered a new biome
    G.mapIndex = spec.mapIndex;
    clearField();
    applyBiome(spec.mapIndex); buildArena(spec.mapIndex);
    player.pos.set(0, 0, 0);
  }

  Audio.playDungeonMusic(spec.mapIndex);

  if (dom.wavesub) dom.wavesub.textContent = `${MAPS[spec.mapIndex].name} · ${MAPS[spec.mapIndex].subtitle}`;

  const slayerTag = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();

  if (spec.isBoss) {
    G.toSpawn = 0;
    spawnBoss(MAPS[spec.mapIndex].boss);
    const bossName = (BOSSES[MAPS[spec.mapIndex].boss]?.name || 'TITAN').toUpperCase();
    showWaveBanner('MONARCH CONFRONTATION', `${slayerTag} VS ${bossName}`);
    const bChallenger = $('boss-challenger-tag');
    if (bChallenger) bChallenger.textContent = `VS ${slayerTag}`;
    Audio.playWaveStart(true);
  } else if (n === 1) {
    G.toSpawn = spec.count; G.spawnTimer = 0.4;
    showWaveBanner('EXPEDITION COMMENCED', `${slayerTag} · REALM I: SANCTUM`);
    Audio.playWaveStart(false);
  } else {
    G.toSpawn = spec.count; G.spawnTimer = 0.4;
    showWaveBanner('WAVE ' + n, `${slayerTag} · ${MAPS[spec.mapIndex].name}`);
    Audio.playWaveStart(false);
  }
}

function updateWaves(dt) {
  if (!G.waveActive) {
    if (G.waitingForPortal) return; // Player must physically enter the Waygate to descend!
    G.betweenTimer -= dt;
    if (G.betweenTimer <= 0) startWave(G.wave + 1);
    return;
  }
  if (!G.spec.isBoss && G.toSpawn > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      const table = MAPS[G.mapIndex].spawnTable;
      spawnEnemy(table[(Math.random() * table.length) | 0]);
      G.toSpawn--; G.spawnTimer = G.spec.spawnRate;
    }
  }
  const cleared = G.spec.isBoss ? (G.boss === null) : (G.toSpawn === 0 && enemies.length === 0);
  if (cleared) {
    G.waveActive = false;
    if (G.spec.isBoss) {
      G.waitingForPortal = true;
      return;
    }
    G.betweenTimer = 2.5;
    const slayerTag = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();
    showWaveBanner('WAVE CLEAR', `${slayerTag} ADVANCES TO NEXT ENCOUNTER`);
  }
}

function bossDefeated() {
  const isFinalBoss = G.mapIndex >= 2;
  const slayerTag = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();
  const bossName = (BOSSES[MAPS[G.mapIndex].boss]?.name || 'TITAN').toUpperCase();
  showWaveBanner('MONARCH PURGED', `${slayerTag} CONQUERS ${bossName}`);
  Audio.playLevelUp();
  for (let i = enemies.length - 1; i >= 0; i--) { if (!enemies[i].isBoss) { releaseEnemy(enemies[i]); enemies.splice(i, 1); } }
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);

  G.waitingForPortal = true;
  setTimeout(() => {
    spawnRealmPortal(0, 0, G.mapIndex + 1);
  }, 1000);
}

function showWaveBanner(title, sub = '') {
  if (dom.wavebanner && dom.wbtitle) {
    dom.wbtitle.textContent = title;
    if (dom.wbsub) dom.wbsub.textContent = sub;
    dom.wavebanner.classList.remove('show');
    void dom.wavebanner.offsetWidth; // force reflow
    dom.wavebanner.classList.add('show');
    clearTimeout(G.waveBannerTimer);
    G.waveBannerTimer = setTimeout(() => {
      if (dom.wavebanner) dom.wavebanner.classList.remove('show');
    }, 2400);
  }
}
function banner(text, sub) { showWaveBanner(text, sub); }
function bannerBoss(name) { showWaveBanner('BOSS ENCOUNTER', name.toUpperCase()); }

// ============================================================= MINIMAP RADAR
let minimapCtx = null;
function updateMinimap() {
  if (!dom.minimap || !player) return;
  if (!minimapCtx) minimapCtx = dom.minimap.getContext('2d');
  const ctx = minimapCtx;
  const w = dom.minimap.width, h = dom.minimap.height;
  const cx = w / 2, cy = h / 2;
  const scale = 38 / (ARENA.size / 2); // map world pos to radar canvas

  ctx.clearRect(0, 0, w, h);

  // Background radar grid ring
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle crosshairs
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(cx, 8); ctx.lineTo(cx, h - 8);
  ctx.moveTo(8, cy); ctx.lineTo(w - 8, cy);
  ctx.stroke();

  // Draw XP gems (small emerald dots)
  ctx.fillStyle = '#45d6a0';
  for (let i = 0; i < orbs.length; i++) {
    const o = orbs[i];
    const ox = cx + o.mesh.position.x * scale;
    const oy = cy + o.mesh.position.z * scale;
    ctx.fillRect(ox - 1, oy - 1, 2, 2);
  }

  // Draw Enemies (crimson pings)
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const ex = cx + e.mesh.position.x * scale;
    const ey = cy + e.mesh.position.z * scale;

    if (e.isBoss) {
      const pulse = 3.5 + Math.sin(G.time * 8) * 1.5;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }
  }

  // Draw Realm Waygate on minimap (golden beacon)
  if (realmPortal && realmPortal.active) {
    const rx = cx + realmPortal.pos.x * scale;
    const ry = cy + realmPortal.pos.z * scale;
    const rPulse = 4.2 + Math.sin(G.time * 6) * 1.5;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(rx, ry, rPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw Player (cyan radar ping with forward heading tick)
  const px = cx + player.pos.x * scale;
  const py = cy + player.pos.z * scale;

  if (player.facing) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + player.facing.x * 6, py + player.facing.z * 6);
    ctx.stroke();
  }

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(px, py, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ============================================================= HUD
function fmt(t) { const m = (t / 60) | 0, s = (t % 60) | 0; return m + ':' + (s < 10 ? '0' : '') + s; }
function updateHUD() {
  const hp = Math.max(0, player ? player.hp : 0), mhp = player ? player.maxHp : 1;
  dom.hpfill.style.width = (hp / mhp * 100) + '%';
  dom.hplabel.textContent = Math.round(hp) + ' / ' + Math.round(mhp);
  dom.xpfill.style.width = (G.xp / G.xpNeed * 100) + '%';
  dom.lvl.textContent = G.level; dom.kills.textContent = G.kills;
  dom.time.textContent = fmt(G.time);
  dom.wave.textContent = 'WAVE ' + G.wave + (G.spec && G.spec.isBoss ? ' ·BOSS' : '');
  const cut = G.time - 1;
  while (G.dmgWindow.length && G.dmgWindow[0].t < cut) G.dmgWindow.shift();
  let sum = 0; for (const d of G.dmgWindow) sum += d.amt;
  if (dom.dps) dom.dps.textContent = Math.round(sum);

  // Dynamic Atmospheric & Health Vignette
  if (dom.vignette) {
    if (hp / mhp < 0.3) {
      dom.vignette.classList.add('danger');
    } else {
      dom.vignette.classList.remove('danger');
    }
  }

  // Boss bar with delayed ghost fill
  if (G.boss && G.boss.alive && G.boss.hp > 0) {
    if (dom.bossbar) {
      dom.bossbar.style.display = 'flex';
      if (dom.bossname) dom.bossname.textContent = G.boss.name;
      if (dom.bosstitle) dom.bosstitle.textContent = G.boss.title || 'ENCOUNTER';
      const pct = Math.max(0, Math.min(100, (G.boss.hp / G.boss.maxHp) * 100));
      if (dom.bossfill) dom.bossfill.style.width = pct + '%';
      G.bossGhostPct = THREE.MathUtils.lerp(G.bossGhostPct != null ? G.bossGhostPct : pct, pct, 0.08);
      if (dom.bossghostfill) dom.bossghostfill.style.width = G.bossGhostPct + '%';
      if (dom.bossval) dom.bossval.textContent = `${Math.round(G.boss.hp)} / ${Math.round(G.boss.maxHp)}`;

      // Boss Sequence Cast Bar
      if (dom.bossSeqCast) {
        if (G.boss.state === 'telegraph' && G.boss.activeAttack) {
          dom.bossSeqCast.classList.add('show');
          if (dom.bossSeqName) dom.bossSeqName.textContent = `CASTING: ${G.boss.activeAttack.name.toUpperCase()}`;
          const castPct = Math.max(0, Math.min(100, ((G.boss.telegraphDur - G.boss.stateTimer) / (G.boss.telegraphDur || 1)) * 100));
          if (dom.bossSeqFill) dom.bossSeqFill.style.width = castPct + '%';
        } else if (G.boss.state === 'executing' && G.boss.activeAttack) {
          dom.bossSeqCast.classList.add('show');
          if (dom.bossSeqName) dom.bossSeqName.textContent = `UNLEASHING: ${G.boss.activeAttack.name.toUpperCase()}`;
          if (dom.bossSeqFill) dom.bossSeqFill.style.width = '100%';
        } else {
          dom.bossSeqCast.classList.remove('show');
        }
      }
    }
  } else {
    if (dom.bossbar) dom.bossbar.style.display = 'none';
    if (dom.bossSeqCast) dom.bossSeqCast.classList.remove('show');
  }

  // Combo Streak Box
  if (G.combo > 1 && G.comboTimer > 0) {
    if (dom.combobox) {
      dom.combobox.classList.add('show');
      if (dom.combocount) dom.combocount.textContent = `COMBO x${G.combo}`;
      const bonus = Math.min(100, (G.combo - 1) * 10);
      if (dom.comborate) dom.comborate.textContent = `+${bonus}% XP`;
    }
  } else {
    if (dom.combobox) dom.combobox.classList.remove('show');
  }

  updateMinimap();
  updateSpecialsHUD();
}

// ============================================================= SPECIAL ABILITIES SYSTEM
function initHeroSpecials(cls) {
  const list = CLASSES[cls]?.specials || [];
  G.specials = list.map((s, idx) => ({
    ...s,
    idx,
    curCd: 0,
    el: null,
  }));
  renderSpecialsHUD();
}

function renderSpecialsHUD() {
  if (!G.specials) return;
  if (dom.specials) {
    dom.specials.innerHTML = G.specials.map((s) => `
      <div class="skill-slot" data-key="${s.key}" data-idx="${s.idx}" title="${s.name} (${s.key.toUpperCase()}): ${s.desc}">
        <div class="skill-key">${s.key.toUpperCase()}</div>
        <div class="skill-icon">${getIcon(s.icon, 22)}</div>
        <div class="skill-name">${s.name}</div>
        <div class="skill-cd-overlay"></div>
      </div>
    `).join('');

    dom.specials.querySelectorAll('.skill-slot').forEach((slot) => {
      slot.onclick = () => useSpecial(+slot.dataset.idx);
    });
  }

  // Mobile Touch Buttons Icon Sync
  ['q', 'e', 'r'].forEach((key, idx) => {
    const s = G.specials[idx];
    const iconEl = $(`tb-icon-${key}`);
    if (iconEl && s) iconEl.innerHTML = getIcon(s.icon, 20);
  });
}

function updateSpecials(dt) {
  if (!G.specials) return;
  for (const s of G.specials) {
    if (s.curCd > 0) {
      s.curCd = Math.max(0, s.curCd - dt);
    }
  }
}

function updateSpecialsHUD() {
  if (!G.specials) return;
  const slots = dom.specials?.querySelectorAll('.skill-slot') || [];
  slots.forEach((slot, idx) => {
    const s = G.specials[idx];
    if (!s) return;
    const overlay = slot.querySelector('.skill-cd-overlay');
    if (s.curCd > 0) {
      const pct = (s.curCd / s.cd) * 100;
      overlay.style.height = `${pct}%`;
      slot.classList.remove('skill-ready');
    } else {
      overlay.style.height = '0%';
      slot.classList.add('skill-ready');
    }
  });

  // Mobile Touch CD Overlays (Q, E, R)
  ['q', 'e', 'r'].forEach((key, idx) => {
    const s = G.specials[idx];
    const cdEl = $(`touch-cd-${key}`);
    if (cdEl && s) {
      const pct = s.curCd > 0 ? (s.curCd / s.cd) * 100 : 0;
      cdEl.style.height = `${pct}%`;
    }
  });

  // Mobile Touch Dash CD
  if (player && P) {
    const dashCdEl = $('touch-dash-cd');
    if (dashCdEl) {
      const dashPct = Math.max(0, Math.min(100, (player.dashCd / P.dashCd) * 100));
      dashCdEl.style.height = `${dashPct}%`;
    }
  }

  // Mobile Portal Descent Button
  const portalBtn = $('touch-portal-btn');
  if (portalBtn) {
    const near = realmPortal && realmPortal.active && player && player.pos.distanceTo(realmPortal.pos) < 4.0;
    if (near) portalBtn.classList.add('show');
    else portalBtn.classList.remove('show');
  }
}

function autoAimNearestEnemy(maxDist = 18) {
  if (!player || !enemies || enemies.length === 0) return;
  let closest = null;
  let minDist = maxDist;
  for (let i = 0; i < enemies.length; i++) {
    const m = enemies[i];
    if (!m.alive) continue;
    const d = player.pos.distanceTo(m.pos);
    if (d < minDist) {
      minDist = d;
      closest = m;
    }
  }
  if (closest) {
    tmp.subVectors(closest.pos, player.pos);
    tmp.y = 0;
    if (tmp.lengthSq() > 0.001) {
      player.facing.copy(tmp.normalize());
      player.group.rotation.y = Math.atan2(player.facing.x, player.facing.z);
    }
  }
}

function useSpecial(idx) {
  if (G.mode !== 'playing' || G.drafting || !G.specials) return;
  const s = G.specials[idx];
  if (!s || s.curCd > 0) return;

  // Auto-aim toward nearest hostile so one-handed mobile play hits targets reliably
  autoAimNearestEnemy(18);

  const heroCls = G.class || 'knight';
  const success = EXECUTE_SPECIAL[heroCls]?.[idx]?.(s);
  if (success !== false) {
    s.curCd = s.cd * (modifiers?.cdMul || 1);
    floatText(player.pos, s.name.toUpperCase(), '#ffd24a', 1.3);

    // Audio SFX for hero abilities
    const soundMap = {
      knight: ['aegis', 'solar', 'wrath'],
      archer: ['bow', 'whirl', 'supernova'],
      mage: ['singularity', 'glacial', 'supernova'],
    };
    const sfx = soundMap[heroCls]?.[idx] || 'solar';
    Audio.playSpecialSound(sfx);
  }
}

// ============================================================= SPECIAL MOVES & SPECTACULAR VFX
const activeSpecials = [];

function updateSpecialEntities(dt) {
  for (let i = activeSpecials.length - 1; i >= 0; i--) {
    const s = activeSpecials[i];
    s.life -= dt;
    if (s.update) s.update(dt);
    if (s.life <= 0) {
      if (s.onExpire) s.onExpire();
      if (s.mesh) scene.remove(s.mesh);
      if (s.dispose) s.dispose();
      activeSpecials.splice(i, 1);
    }
  }
}

const EXECUTE_SPECIAL = {
  knight: [
    // -------------------------------------------------------------
    // 0: AEGIS RUSH (Golden Tower Shield Juggernaut)
    // -------------------------------------------------------------
    (s) => {
      const dir = player.facing.clone().normalize();
      const shieldG = new THREE.Group();
      
      // Radiant Glowing Golden Aegis Shield
      const shieldMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 2.2, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffea38, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
      );
      const shieldSun = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.09, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      shieldSun.position.z = 0.1;
      shieldG.add(shieldMesh, shieldSun);
      shieldG.position.copy(player.pos).addScaledVector(dir, 1.4);
      shieldG.position.y = 1.2;
      shieldG.rotation.y = Math.atan2(dir.x, dir.z);
      scene.add(shieldG);

      ringBurst(player.pos, 4.0, 0xffd700);
      shake(0.45);
      triggerAttack('sword');

      const hitSet = new Set();
      let rushTimer = 0.24;

      activeSpecials.push({
        life: 0.24,
        mesh: shieldG,
        update: (dt) => {
          rushTimer -= dt;
          // Unstoppable high-speed charge
          player.pos.addScaledVector(dir, 32 * dt);
          const lim = ARENA.size / 2 - 1.5;
          player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
          player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);

          shieldG.position.copy(player.pos).addScaledVector(dir, 1.4);
          shieldG.position.y = 1.2;
          spawnAfterimage();

          // Concussive Shield Ram
          for (const e of enemies) {
            if (!e.alive || hitSet.has(e)) continue;
            if (player.pos.distanceTo(e.mesh.position) < 4.2) {
              hitSet.add(e);
              damageEnemy(e, 65);
              e.stun = 1.8;
              e.slow = 1.8;
              e.mesh.position.addScaledVector(dir, 10);
              burst(e.mesh.position, 0xffd700, 14);
              ringBurst(e.mesh.position, 3.8, 0xffea38);
              shake(0.4);
            }
          }
        },
        onExpire: () => {
          ringBurst(player.pos, 4.8, 0xffd700);
          burst(player.pos, 0xffec40, 20);
        },
        dispose: () => {
          shieldG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    },

    // -------------------------------------------------------------
    // 1: SOLAR TEMPEST (Sacred Sun Seal & Orbiting Blade Storm)
    // -------------------------------------------------------------
    (s) => {
      triggerAttack('sword');
      shake(0.4);

      // 1. Runic Sacred Sun Seal on the Arena Floor
      const sealG = new THREE.Group();
      const sunRing = new THREE.Mesh(
        new THREE.RingGeometry(2.2, 6.8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
      );
      sunRing.rotation.x = -Math.PI / 2;
      const sunCore = new THREE.Mesh(
        new THREE.CircleGeometry(2.0, 24),
        new THREE.MeshBasicMaterial({ color: 0xffea38, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      sunCore.rotation.x = -Math.PI / 2;
      sealG.add(sunRing, sunCore);
      sealG.position.set(player.pos.x, 0.08, player.pos.z);
      scene.add(sealG);

      // 2. Three Orbiting Golden Energy Blade Crescents
      const bladesG = new THREE.Group();
      bladesG.position.set(player.pos.x, 1.2, player.pos.z);
      const crescents = [];
      for (let i = 0; i < 3; i++) {
        const cr = new THREE.Mesh(
          new THREE.TorusGeometry(2.2, 0.16, 8, 24, Math.PI * 0.95),
          new THREE.MeshBasicMaterial({ color: 0xffec40, side: THREE.DoubleSide })
        );
        cr.rotation.x = Math.PI / 2;
        bladesG.add(cr);
        crescents.push(cr);
      }
      scene.add(bladesG);

      let rotAngle = 0;
      let tickT = 0;
      const totalDur = 2.6;

      activeSpecials.push({
        life: totalDur,
        update: (dt) => {
          rotAngle += 16 * dt;
          tickT += dt;

          const prog = 1 - (activeSpecials.find(x => x.mesh === bladesG)?.life || 0) / totalDur;
          const radius = 2.4 + prog * 3.8;

          sealG.position.set(player.pos.x, 0.08, player.pos.z);
          sealG.rotation.y += dt * 1.5;

          bladesG.position.set(player.pos.x, 1.2, player.pos.z);
          for (let i = 0; i < 3; i++) {
            const a = rotAngle + (i / 3) * Math.PI * 2;
            crescents[i].position.set(Math.cos(a) * radius, Math.sin(a * 2) * 0.25, Math.sin(a) * radius);
            crescents[i].rotation.z = a + Math.PI / 2;
          }

          // Gravitational Whirlwind Suction toward Knight
          for (const e of enemies) {
            if (!e.alive) continue;
            tmp.set(player.pos.x - e.mesh.position.x, 0, player.pos.z - e.mesh.position.z);
            const dist = tmp.length();
            if (dist < 7.8 && dist > 1.2) {
              tmp.normalize();
              e.mesh.position.addScaledVector(tmp, 8.5 * dt);
            }
          }

          // Rapid Slicing Damage Pulses
          if (tickT >= 0.35) {
            tickT = 0;
            for (const e of enemies) {
              if (!e.alive) continue;
              if (player.pos.distanceTo(e.mesh.position) < radius + 1.2) {
                damageEnemy(e, 22);
                burst(e.mesh.position, 0xffea38, 5);
              }
            }
            shake(0.2);
          }
        },
        onExpire: () => {
          // Solar Nova Detonation
          ringBurst(player.pos, 7.8, 0xffd700);
          burst(player.pos, 0xffea38, 36);
          shake(0.65);
          scene.remove(sealG);
          scene.remove(bladesG);
        },
        dispose: () => {
          sealG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          bladesG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    },

    // -------------------------------------------------------------
    // 2: WRATH OF HEAVENS (Colossal 14m Divine Sword from the Sky)
    // -------------------------------------------------------------
    (s) => {
      const targetPos = player.pos.clone();
      shake(0.4);
      triggerAttack('sword');

      // Colossal Divine Blade Mesh dropping from clouds
      const swordG = new THREE.Group();
      const bladeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 12, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xffea38 })
      );
      bladeMesh.position.y = 6;
      const fullerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 11, 0.45),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      fullerMesh.position.y = 6;
      const guardMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.8, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      guardMesh.position.y = 12;
      swordG.add(bladeMesh, fullerMesh, guardMesh);

      swordG.position.set(targetPos.x, 32, targetPos.z);
      scene.add(swordG);

      let landed = false;
      let swordY = 32;

      activeSpecials.push({
        life: 2.2,
        mesh: swordG,
        update: (dt) => {
          if (!landed) {
            swordY -= 85 * dt;
            swordG.position.y = swordY;
            burst(swordG.position, 0xffd700, 4);

            if (swordY <= 0) {
              swordY = 0;
              swordG.position.y = 0;
              landed = true;

              // Earth-Shattering Impact
              ringBurst(targetPos, 9.5, 0xffd700);
              ringBurst(targetPos, 6.5, 0xffea38);
              ringBurst(targetPos, 3.5, 0xffffff);
              burst(targetPos, 0xffea38, 45);
              shake(1.1);
              triggerPowerupFlash('#ffd700');

              // Incinerate all enemies in holy radius
              for (const e of enemies) {
                if (!e.alive) continue;
                if (targetPos.distanceTo(e.mesh.position) < 9.5) {
                  damageEnemy(e, 160);
                  burst(e.mesh.position, 0xffea38, 16);
                }
              }

              // Knight Sovereign Avatar Buff
              player.iframes = 4.5;
              player.hp = Math.min(player.maxHp, player.hp + 40);
              floatText(player.pos, '+40 HP · SOVEREIGN WRATH', '#60a5fa', 1.6);

              // Floating Golden Sovereign Halo over Knight's Helmet
              const halo = new THREE.Mesh(
                new THREE.TorusGeometry(0.55, 0.06, 8, 24),
                new THREE.MeshBasicMaterial({ color: 0xffea38 })
              );
              halo.rotation.x = Math.PI / 2;
              halo.position.set(0, 0.72, 0);
              player.parts.head.add(halo);

              setTimeout(() => {
                player.parts.head.remove(halo);
                halo.geometry.dispose();
                halo.material.dispose();
              }, 4500);
            }
          } else {
            // Lingering impaled sword dissolving
            swordG.scale.subScalar(dt * 0.45);
            if (swordG.scale.x <= 0.1) swordG.visible = false;
          }
        },
        dispose: () => {
          swordG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    }
  ],

  archer: [
    // -------------------------------------------------------------
    // 0: SCATTERSHOT (7 Piercing Arrows + Splintering Ricochet Bolts)
    // -------------------------------------------------------------
    (s) => {
      const count = 7;
      const baseDir = player.facing.clone().normalize();

      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 0.15;
        const d = baseDir.clone().applyAxisAngle(UP, offset);

        spawnProjectile({
          kind: 'arrow',
          from: 'player',
          dir: d,
          speed: 34,
          dmg: 32,
          pierce: 3,
          life: 1.3,
          color: 0xef233c,
          onHit: (hitPos) => {
            // Splinter into 3 Ricocheting Shrapnel Bolts!
            burst(hitPos, 0xef233c, 8);
            for (let j = 0; j < 3; j++) {
              const ang = Math.random() * Math.PI * 2;
              const rdir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
              spawnProjectile({
                kind: 'arrow',
                from: 'player',
                origin: hitPos,
                dir: rdir,
                speed: 30,
                dmg: 16,
                pierce: 1,
                life: 0.65,
                color: 0xff4d6d
              });
            }
          }
        });
      }

      triggerAttack('bow');
      shake(0.25);
      burst(player.pos, 0xef233c, 12);
      return true;
    },

    // -------------------------------------------------------------
    // 1: SHADOW VAULT & TOXIC CALTROPS (Backflip + Poison Bleed Zone)
    // -------------------------------------------------------------
    (s) => {
      const launchPos = player.pos.clone();
      const back = player.facing.clone().normalize().multiplyScalar(-8.5);
      player.pos.add(back);
      const lim = ARENA.size / 2 - 1.5;
      player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
      player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);

      // Crimson Smoke Poof at Launch Point
      burst(launchPos, 0xdc2626, 26);
      burst(launchPos, 0x1f2937, 26);
      ringBurst(launchPos, 4.5, 0xef233c);
      shake(0.35);

      // 10 Physical Spiked 3D Metallic Caltrops on the floor
      const caltropsG = new THREE.Group();
      caltropsG.position.copy(launchPos);
      const caltropMat = new THREE.MeshBasicMaterial({ color: 0xef233c });
      for (let i = 0; i < 10; i++) {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), caltropMat);
        c.position.set((Math.random() - 0.5) * 5.2, 0.1, (Math.random() - 0.5) * 5.2);
        c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        caltropsG.add(c);
      }
      scene.add(caltropsG);

      // Lingering Corrosive Smoke Zone
      let smokeTimer = 0;
      activeSpecials.push({
        life: 4.5,
        mesh: caltropsG,
        update: (dt) => {
          smokeTimer += dt;
          if (smokeTimer >= 0.2) {
            smokeTimer = 0;
            burst(launchPos, 0x991b1b, 3);
          }

          // Cripple and Bleed enemies entering the zone
          for (const e of enemies) {
            if (!e.alive) continue;
            if (launchPos.distanceTo(e.mesh.position) < 5.2) {
              e.slow = 4.0;
              e.bleedT = 4.0;
              e.bleedDmg = 12;
              if (!e.caltropSnared) {
                e.caltropSnared = true;
                damageEnemy(e, 40);
                burst(e.mesh.position, 0xef233c, 8);
              }
            }
          }
        },
        dispose: () => {
          caltropsG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    },

    // -------------------------------------------------------------
    // 2: SKYFALL BARRAGE (Target Reticle + 48 Flaming Arrows Rain)
    // -------------------------------------------------------------
    (s) => {
      triggerAttack('bow');
      shake(0.35);

      // Flare Beacon arrow shot upward
      burst(player.pos, 0xef233c, 20);
      const targetPos = player.pos.clone().addScaledVector(player.facing, 4.5);

      // Glowing Pulsing Targeting Reticle on the Floor
      const reticleG = new THREE.Group();
      reticleG.position.set(targetPos.x, 0.08, targetPos.z);
      const reticleRing = new THREE.Mesh(
        new THREE.RingGeometry(6.8, 7.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xef233c, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      reticleRing.rotation.x = -Math.PI / 2;
      const crossX = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xef233c }));
      const crossZ = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 14.8), new THREE.MeshBasicMaterial({ color: 0xef233c }));
      reticleG.add(reticleRing, crossX, crossZ);
      scene.add(reticleG);

      let arrowCount = 48;
      let spawnT = 0;
      let delay = 0.45;

      activeSpecials.push({
        life: 2.8,
        mesh: reticleG,
        update: (dt) => {
          reticleG.rotation.y += dt * 1.5;
          if (delay > 0) { delay -= dt; return; }

          spawnT += dt;
          if (spawnT >= 0.045 && arrowCount > 0) {
            spawnT = 0;
            arrowCount--;

            const rx = (Math.random() - 0.5) * 13.5;
            const rz = (Math.random() - 0.5) * 13.5;
            const impactP = new THREE.Vector3(targetPos.x + rx, 0, targetPos.z + rz);
            const dropOrigin = new THREE.Vector3(impactP.x + (Math.random() - 0.5) * 2, 22, impactP.z + 4);

            tmp.set(impactP.x - dropOrigin.x, -dropOrigin.y, impactP.z - dropOrigin.z).normalize();
            spawnProjectile({
              kind: 'arrow',
              from: 'player',
              origin: dropOrigin,
              dir: tmp.clone(),
              speed: 36,
              dmg: 28,
              pierce: 1,
              life: 0.8,
              color: 0xef233c,
              onHit: () => {
                detonate(impactP, 2.4, 28);
                burst(impactP, 0xdc2626, 6);
                ringBurst(impactP, 2.2, 0xff4d6d);
              }
            });
            shake(0.18);
          }
        },
        dispose: () => {
          reticleG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    }
  ],

  mage: [
    // -------------------------------------------------------------
    // 0: COSMIC SINGULARITY (Gravitational Black Hole + Implosion)
    // -------------------------------------------------------------
    (s) => {
      const centerPos = player.pos.clone().addScaledVector(player.facing, 6.0);
      burst(player.pos, 0x38bdf8, 16);
      shake(0.35);

      // Gravitational Black Hole Mesh with Accretion Disks
      const holeG = new THREE.Group();
      holeG.position.copy(centerPos);
      holeG.position.y = 1.3;

      const voidCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x08020f })
      );
      const ringCyan = new THREE.Mesh(
        new THREE.TorusGeometry(1.65, 0.08, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      ringCyan.rotation.x = Math.PI / 3;
      const ringViolet = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 2.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      ringViolet.rotation.x = -Math.PI / 4;
      holeG.add(voidCore, ringCyan, ringViolet);
      scene.add(holeG);

      let tickTimer = 0;

      activeSpecials.push({
        life: 3.5,
        mesh: holeG,
        update: (dt) => {
          ringCyan.rotation.z += dt * 5;
          ringViolet.rotation.z -= dt * 4;
          tickTimer += dt;

          // Continuous Gravitational Vacuum Physics Pulling Enemies
          for (const e of enemies) {
            if (!e.alive) continue;
            tmp.set(centerPos.x - e.mesh.position.x, 0, centerPos.z - e.mesh.position.z);
            const dist = tmp.length();
            if (dist < 8.8) {
              tmp.normalize();
              e.mesh.position.addScaledVector(tmp, 11 * dt);
            }
          }

          // Gravitational Crushing Ticks
          if (tickTimer >= 0.35) {
            tickTimer = 0;
            for (const e of enemies) {
              if (!e.alive) continue;
              if (centerPos.distanceTo(e.mesh.position) < 4.2) {
                damageEnemy(e, 16);
                burst(e.mesh.position, 0x38bdf8, 4);
              }
            }
            shake(0.18);
          }
        },
        onExpire: () => {
          // Final Cataclysmic Supernova Implosion!
          ringBurst(centerPos, 7.5, 0x38bdf8);
          ringBurst(centerPos, 5.0, 0xa855f7);
          burst(centerPos, 0xffffff, 35);
          shake(0.75);

          for (const e of enemies) {
            if (!e.alive) continue;
            if (centerPos.distanceTo(e.mesh.position) < 7.5) {
              damageEnemy(e, 65);
              tmp.copy(e.mesh.position).sub(centerPos).normalize();
              e.mesh.position.addScaledVector(tmp, 8); // Outward blast knockback
            }
          }
        },
        dispose: () => {
          holeG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    },

    // -------------------------------------------------------------
    // 1: GLACIAL SHATTER (Ring of 10 Ice Spires + Freeze Solid)
    // -------------------------------------------------------------
    (s) => {
      const centerPos = player.pos.clone();
      ringBurst(centerPos, 7.5, 0x38bdf8);
      burst(centerPos, 0xbae6fd, 25);
      shake(0.45);

      // 10 Jagged 3D Ice Spires Erupting from the Arena Floor
      const iceG = new THREE.Group();
      iceG.position.copy(centerPos);
      const iceMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const rad = 6.8 + (Math.random() - 0.5) * 1.2;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 5), iceMat);
        spire.position.set(Math.cos(ang) * rad, 1.4, Math.sin(ang) * rad);
        spire.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * 3, (Math.random() - 0.5) * 0.35);
        iceG.add(spire);
      }
      scene.add(iceG);

      // Impale & Freeze Solid all enemies caught in radius
      for (const e of enemies) {
        if (!e.alive) continue;
        if (centerPos.distanceTo(e.mesh.position) < 7.8) {
          damageEnemy(e, 55);
          e.frozen = 3.5;
          e.slow = 3.5;
          burst(e.mesh.position, 0x38bdf8, 12);
        }
      }

      activeSpecials.push({
        life: 3.5,
        mesh: iceG,
        onExpire: () => {
          // Glacial Shatter Detonation!
          burst(centerPos, 0xbae6fd, 40);
          ringBurst(centerPos, 7.8, 0x38bdf8);
          shake(0.55);

          for (const e of enemies) {
            if (!e.alive) continue;
            if (centerPos.distanceTo(e.mesh.position) < 8.2) {
              damageEnemy(e, 45);
              burst(e.mesh.position, 0xbae6fd, 8);
            }
          }
        },
        dispose: () => {
          iceG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    },

    // -------------------------------------------------------------
    // 2: CELESTIAL SUPERNOVA (Apocalyptic Descending Star + Wipe)
    // -------------------------------------------------------------
    (s) => {
      const impactPos = player.pos.clone();
      shake(0.5);

      // Gigantic Descending Celestial Star Mesh
      const starG = new THREE.Group();
      starG.position.set(impactPos.x, 32, impactPos.z);

      const coreSphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.0, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
      ring1.rotation.x = Math.PI / 3;
      ring2.rotation.y = Math.PI / 4;
      starG.add(coreSphere, ring1, ring2);
      scene.add(starG);

      let starY = 32;
      let starLanded = false;

      activeSpecials.push({
        life: 2.2,
        mesh: starG,
        update: (dt) => {
          ring1.rotation.z += dt * 6;
          ring2.rotation.z -= dt * 5;

          if (!starLanded) {
            starY -= 75 * dt;
            starG.position.y = starY;
            burst(starG.position, 0xa855f7, 5);

            if (starY <= 1) {
              starLanded = true;
              starG.visible = false;

              // Apocalyptic Cosmic Supernova Impact!
              triggerPowerupFlash('#a855f7');
              ringBurst(impactPos, 12.5, 0xffffff);
              ringBurst(impactPos, 9.5, 0x38bdf8);
              ringBurst(impactPos, 6.5, 0xa855f7);
              burst(impactPos, 0xffffff, 50);
              shake(1.2);

              // Vaporize ALL enemy bullets across the entire arena
              for (const p of projectiles) scene.remove(p.mesh);
              projectiles.length = 0;

              // Annihilate enemies in cosmic radius
              for (const e of enemies) {
                if (!e.alive) continue;
                if (impactPos.distanceTo(e.mesh.position) < 12.5) {
                  damageEnemy(e, 220);
                  burst(e.mesh.position, 0xa855f7, 18);
                }
              }

              // Heal Zili + Float Text
              player.hp = Math.min(player.maxHp, player.hp + 30);
              floatText(player.pos, '+30 HP · CELESTIAL SUPERNOVA', '#38bdf8', 1.6);
            }
          }
        },
        dispose: () => {
          starG.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      });
      return true;
    }
  ]
};

// ============================================================= SPEEDLINES FX
let speedlinesCtx = null;
function updateSpeedlines() {
  const c = dom.speedlines;
  if (!c) return;
  if (!speedlinesCtx) speedlinesCtx = c.getContext('2d');

  if (c.width !== innerWidth || c.height !== innerHeight) {
    c.width = innerWidth;
    c.height = innerHeight;
  }

  const speed = player ? player.vel.length() : 0;
  const isDashing = player && player.dashT > 0;
  
  if (isDashing || speed > 8.5) {
    c.style.opacity = isDashing ? '0.85' : '0.45';
    speedlinesCtx.clearRect(0, 0, c.width, c.height);

    const cx = c.width / 2;
    const cy = c.height / 2;
    const count = isDashing ? 32 : 16;
    speedlinesCtx.strokeStyle = isDashing ? 'rgba(165, 243, 252, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    speedlinesCtx.lineWidth = isDashing ? 2.5 : 1.5;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const innerDist = (Math.min(cx, cy) * 0.45) + Math.random() * 80;
      const len = 70 + Math.random() * 140;

      speedlinesCtx.beginPath();
      speedlinesCtx.moveTo(cx + Math.cos(angle) * innerDist, cy + Math.sin(angle) * innerDist);
      speedlinesCtx.lineTo(cx + Math.cos(angle) * (innerDist + len), cy + Math.sin(angle) * (innerDist + len));
      speedlinesCtx.stroke();
    }
  } else {
    c.style.opacity = '0';
  }
}

// ============================================================= STATE
function clearField() {
  for (const e of enemies) {
    if (e.isBoss) {
      clearBossTelegraphs(e);
      disposeGroup(e.mesh);
    } else {
      e.mesh.visible = false;
      (freeEnemy[e.type] || (freeEnemy[e.type] = [])).push(e);
    }
  }
  enemies.length = 0; G.boss = null;
  for (const o of orbs) scene.remove(o.mesh); orbs.length = 0;
  for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0;
  for (const s of activeSpecials) {
    if (s.mesh) scene.remove(s.mesh);
    if (s.dispose) s.dispose();
  }
  activeSpecials.length = 0;
}
function resetActors() {
  clearField();
  removeRealmPortal();
  for (const p of particles) p.mesh.visible = false, freeParts.push(p); particles.length = 0;
  for (const f of fx) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); } fx.length = 0;
}

function startRun(cls) {
  cls = cls || G.class || 'knight';
  const C = CLASSES[cls];
  resetActors();

  const activeName = (getSavedName(cls) || '').trim() || 'Sovereign Slayer';

  Object.assign(G, {
    mode: 'playing', time: 0, wave: 0, kills: 0, mapIndex: 0,
    level: 1, xp: 0, xpNeed: xpForLevel(1), pendingLevels: 0, drafting: false,
    boss: null, bossGhostPct: 100, combo: 0, comboTimer: 0, dmgWindow: [], shakeMag: 0, waveActive: false, betweenTimer: 0,
    waitingForPortal: false,
    class: cls, classWeapon: C.weapon,
    playerName: activeName,
  });
  P = { speed: PLAYER.speed * C.speedMul, dashCd: PLAYER.dashCd, pickupRange: PLAYER.pickupRange };
  modifiers = { cdMul: 1, dmgMul: 1, xpMul: 1, regen: 0, thorns: 0, lifesteal: 0, crit: 0.12 };
  initWeapons(C.weapon);
  createPlayer(cls);
  player.hp = player.maxHp = Math.round(PLAYER.hp * C.hpMul);
  player.pos.set(0, 0, 0); player.vel.set(0, 0, 0);
  player.dashT = player.dashCd = player.iframes = player.hitCd = player.flash = 0;
  for (const m of player.tint) m.emissive.setRGB(0, 0, 0);
  initHeroSpecials(cls);
  applyBiome(0); buildArena(0);

  // HUD Sovereign Handle Badge
  const hudSlayerName = $('hud-slayer-name');
  if (hudSlayerName) hudSlayerName.textContent = activeName;
  const hudSlayerCls = $('hud-slayer-cls');
  if (hudSlayerCls) hudSlayerCls.textContent = (cls || 'knight').toUpperCase();
  const hsbIcon = $('hsb-user-icon');
  if (hsbIcon) hsbIcon.innerHTML = getIcon('user', 13);

  dom.menu.classList.remove('show'); dom.gameover.classList.remove('show');
  dom.pause.classList.remove('show'); dom.classselect.classList.remove('show');
  if (dom.victorymodal) dom.victorymodal.classList.remove('show');
  const gm = $('guidemodal'); if (gm) gm.classList.remove('show');
  const hoc = $('hall-of-champions-modal'); if (hoc) hoc.classList.remove('show');
  
  Audio.stopHomescreenMusic(0.4);
  Audio.playDungeonMusic(0);

  // Activate in-game mobile HUD controls
  document.body.classList.add('in-game');
  const touchCtrl = $('touch-controls');
  if (touchCtrl) touchCtrl.classList.remove('touch-hidden');

  startWave(1);
}

function gameOver() {
  G.mode = 'over';
  Audio.stopDungeonMusic(1.5);
  removeRealmPortal();

  // Deactivate in-game mobile HUD controls
  document.body.classList.remove('in-game');
  const touchCtrl = $('touch-controls');
  if (touchCtrl) touchCtrl.classList.add('touch-hidden');
  touchAxis.x = 0;
  touchAxis.z = 0;

  let titans = 0;
  if (G.wave > 30) titans = 3;
  else if (G.wave > 20) titans = 2;
  else if (G.wave > 10) titans = 1;

  const finalScore = calculateScore(G.wave, G.kills, titans, G.time);
  const stats = getPlayerStats();
  const best = Math.max(G.wave, stats.bestWave);
  const homeRec = $('home-record');
  if (homeRec) homeRec.textContent = 'WAVE ' + best;

  const slayerTag = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();
  dom.gotitle.textContent = `SOVEREIGN ${slayerTag} FALLEN`;
  dom.gostats.innerHTML = `Reached <b style="color:#ffd24a">Wave ${G.wave}</b> · ${MAPS[G.mapIndex].name}<br/>` +
    `${G.kills} foes vanquished · ${titans} monarchs slain · ${fmt(G.time)} survived<br/>` +
    `<span style="color:#38bdf8;font-size:9px;margin-top:6px;display:inline-block">EXPEDITION SCORE: <b>${finalScore.toLocaleString()} PTS</b></span>`;

  // Score Submission setup
  const goScoreDisplay = $('go-score-display');
  if (goScoreDisplay) goScoreDisplay.textContent = `${finalScore.toLocaleString()} PTS`;

  const goInput = $('go-player-name');
  if (goInput) goInput.value = G.playerName || getSavedName(G.selectedClass);

  const goForm = $('go-submit-form');
  const goSuccess = $('go-submit-success');
  const goBtn = $('go-submit-btn');

  if (goForm) goForm.style.display = 'flex';
  if (goSuccess) goSuccess.classList.remove('show');
  if (goBtn) {
    goBtn.disabled = false;
    goBtn.textContent = 'SUBMIT GLORY';
    goBtn.onclick = async () => {
      const name = (goInput?.value || '').trim() || getSavedName(G.selectedClass);
      goBtn.disabled = true;
      goBtn.textContent = 'SEALING...';
      const res = await submitScore({
        name,
        cls: G.selectedClass || 'knight',
        wave: G.wave,
        kills: G.kills,
        titans,
        time: Math.floor(G.time),
        score: finalScore,
      });
      const homeInput = $('home-player-name-input');
      if (homeInput) homeInput.value = name;
      const landingInput = $('landing-player-name');
      if (landingInput) landingInput.value = name;
      updateLandingCareerBadge(name);
      if (goForm) goForm.style.display = 'none';
      if (goSuccess) {
        goSuccess.classList.add('show');
        const msg = $('go-success-msg');
        if (msg) {
          msg.textContent = res.isNewBest
            ? `NEW PERSONAL BEST FOR ${name.toUpperCase()}! RANK #${res.rank || 1}`
            : `RECORD PRESERVED FOR ${name.toUpperCase()}! RANK #${res.rank || 1}`;
        }
      }
    };
  }

  dom.gameover.classList.add('show');
}
function togglePause() {
  if (G.mode === 'playing') {
    G.mode = 'paused';
    Audio.pauseDungeonMusic();
    dom.pause.classList.add('show');
    const pName = $('pause-slayer-name');
    if (pName) pName.textContent = (G.playerName || getSavedName() || 'SOVEREIGN').toUpperCase();
    const pMeta = $('pause-slayer-meta');
    if (pMeta) pMeta.textContent = `WAVE ${G.wave} · ${(G.selectedClass || G.class || 'knight').toUpperCase()} · ${G.kills} FOES SLAIN`;
    const bgmIcon = $('pause-bgm-icon');
    if (bgmIcon) bgmIcon.innerHTML = getIcon('sound', 16);
    const bgmTitle = $('pause-bgm-title');
    if (bgmTitle) {
      if (G.mapIndex === 0) bgmTitle.textContent = 'REALM I: FORGOTTEN SANCTUM';
      else if (G.mapIndex === 1) bgmTitle.textContent = 'REALM II: THE INFERNO';
      else bgmTitle.textContent = 'REALM III: ABYSSAL VOID';
    }
  }
  else if (G.mode === 'paused') {
    G.mode = 'playing';
    dom.pause.classList.remove('show');
    Audio.resumeDungeonMusic();
  }
}
function bindUI() {
  $('startbtn').onclick = () => { Audio.initAudio(); startRun(G.selectedClass || 'knight'); };
  $('restartbtn').onclick = () => { Audio.initAudio(); startRun(G.selectedClass || 'knight'); };
  $('resumebtn').onclick = togglePause;

  // Hall of Champions modal triggers
  const lbOpenBtn = $('leaderboard-open-btn');
  if (lbOpenBtn) lbOpenBtn.onclick = () => openLeaderboardModal('all');
  const goLbBtn = $('go-leaderboard-btn');
  if (goLbBtn) goLbBtn.onclick = () => openLeaderboardModal('all');
  const vicLbBtn = $('vic-leaderboard-btn');
  if (vicLbBtn) vicLbBtn.onclick = () => openLeaderboardModal('all');
  const pauseLbBtn = $('pause-leaderboard-btn');
  if (pauseLbBtn) pauseLbBtn.onclick = () => openLeaderboardModal('all');
  const hocOkBtn = $('hoc-ok-btn');
  if (hocOkBtn) hocOkBtn.onclick = closeLeaderboardModal;

  // Victory screen buttons
  if (dom.vicEndlessBtn) {
    dom.vicEndlessBtn.onclick = () => {
      dom.victorymodal.classList.remove('show');
      G.mode = 'playing';
      startWave(31);
    };
  }
  if (dom.vicMenuBtn) {
    dom.vicMenuBtn.onclick = () => {
      dom.victorymodal.classList.remove('show');
      G.mode = 'menu';
      dom.menu.classList.add('show');
      document.body.classList.remove('in-game');
      const touchCtrl = $('touch-controls');
      if (touchCtrl) touchCtrl.classList.add('touch-hidden');
      touchAxis.x = 0;
      touchAxis.z = 0;
      createPlayer(G.selectedClass || 'knight');
      Audio.stopDungeonMusic(0.5);
      Audio.playHomescreenMusic();
    };
  }

  initHomeUI();

  // Initialize and bind Mute Toggle button
  if (dom.mutebtn) {
    const updateMuteIcon = () => {
      dom.mutebtn.innerHTML = Audio.isMuted() ? getIcon('sound_off', 16) : getIcon('sound', 16);
    };
    dom.mutebtn.onclick = () => {
      Audio.toggleMute();
      updateMuteIcon();
    };
    updateMuteIcon();
  }

  // User gesture listener to unlock Web Audio context safely
  const unlockAudio = () => {
    Audio.initAudio();
    if (G.mode === 'menu') {
      Audio.playHomescreenMusic();
    }
    removeEventListener('pointerdown', unlockAudio);
    removeEventListener('keydown', unlockAudio);
    removeEventListener('touchstart', unlockAudio);
  };
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);
  addEventListener('touchstart', unlockAudio);
}

function initHomeUI() {
  const crestIcon = $('brand-crest-icon');
  if (crestIcon) crestIcon.innerHTML = getIcon('crown', 20);
  const iconKnight = $('rc-icon-knight');
  if (iconKnight) iconKnight.innerHTML = getIcon('shield', 22);
  const iconMage = $('rc-icon-mage');
  if (iconMage) iconMage.innerHTML = getIcon('magic', 22);
  const iconArcher = $('rc-icon-archer');
  if (iconArcher) iconArcher.innerHTML = getIcon('bow', 22);

  // Leaderboard & overlay vector icons hydration
  const lbTrophy = $('lb-trophy-icon');
  if (lbTrophy) lbTrophy.innerHTML = getIcon('trophy', 15);
  const hocCrest = $('hoc-crest-icon');
  if (hocCrest) hocCrest.innerHTML = getIcon('trophy', 22);
  const hocRefresh = $('hoc-refresh-icon');
  if (hocRefresh) hocRefresh.innerHTML = getIcon('refresh', 13);
  const goSkull = $('go-skull-icon');
  if (goSkull) goSkull.innerHTML = getIcon('skull', 22);
  const vicCrest = $('vic-crest-icon');
  if (vicCrest) vicCrest.innerHTML = getIcon('crown', 28);
  const goSuccessIcon = $('go-success-icon');
  if (goSuccessIcon) goSuccessIcon.innerHTML = getIcon('check', 16);
  const vicSuccessIcon = $('vic-success-icon');
  if (vicSuccessIcon) vicSuccessIcon.innerHTML = getIcon('check', 16);

  // Player Champion Identity Header & Landing Registry Console
  const pidIcon = $('pid-user-icon');
  if (pidIcon) pidIcon.innerHTML = getIcon('user', 14);
  const aicCrest = $('aic-crest-icon');
  if (aicCrest) aicCrest.innerHTML = getIcon('crown', 16);
  const aicDice = $('aic-dice-icon');
  if (aicDice) aicDice.innerHTML = getIcon('dice', 14);

  // Mobile Top HUD vector icons
  const mobCrest = $('mob-crest-icon');
  if (mobCrest) mobCrest.innerHTML = getIcon('crown', 18);
  const mobUser = $('mob-user-icon');
  if (mobUser) mobUser.innerHTML = getIcon('user', 12);
  const mobLbTrophy = $('mob-lb-trophy-icon');
  if (mobLbTrophy) mobLbTrophy.innerHTML = getIcon('trophy', 14);
  const mobCodex = $('mob-codex-icon');
  if (mobCodex) mobCodex.innerHTML = getIcon('dossier', 14);
  const mobPrevIcon = $('mob-prev-icon');
  if (mobPrevIcon) mobPrevIcon.innerHTML = getIcon('chevron_left', 16);
  const mobNextIcon = $('mob-next-icon');
  if (mobNextIcon) mobNextIcon.innerHTML = getIcon('chevron_right', 16);
  const mobDrawerChev = $('mob-drawer-chevron');
  if (mobDrawerChev) mobDrawerChev.innerHTML = getIcon('chevron_down', 14);
  const mobIconTabStats = $('mob-icon-tab-stats');
  if (mobIconTabStats) mobIconTabStats.innerHTML = getIcon('shield', 13);
  const mobIconTabSkills = $('mob-icon-tab-skills');
  if (mobIconTabSkills) mobIconTabSkills.innerHTML = getIcon('zap', 13);
  const mobIconTabRealms = $('mob-icon-tab-realms');
  if (mobIconTabRealms) mobIconTabRealms.innerHTML = getIcon('portal', 13);
  const mobIconKnight = $('mob-icon-knight');
  if (mobIconKnight) mobIconKnight.innerHTML = getIcon('shield', 14);
  const mobIconMage = $('mob-icon-mage');
  if (mobIconMage) mobIconMage.innerHTML = getIcon('magic', 14);
  const mobIconArcher = $('mob-icon-archer');
  if (mobIconArcher) mobIconArcher.innerHTML = getIcon('bow', 14);

  const homeNameInput = $('home-player-name-input');
  const landingNameInput = $('landing-player-name');
  const mobNameInput = $('mob-player-name-input');
  const currentSavedName = getSavedName(G.selectedClass || 'knight');

  if (homeNameInput) homeNameInput.value = currentSavedName;
  if (landingNameInput) landingNameInput.value = currentSavedName;
  if (mobNameInput) mobNameInput.value = currentSavedName;
  updateLandingCareerBadge(currentSavedName);

  const syncNameInputs = (newVal) => {
    const clean = newVal.trim();
    if (homeNameInput && homeNameInput.value !== newVal) homeNameInput.value = newVal;
    if (landingNameInput && landingNameInput.value !== newVal) landingNameInput.value = newVal;
    if (mobNameInput && mobNameInput.value !== newVal) mobNameInput.value = newVal;
    if (clean) {
      setSavedName(clean);
      updateLandingCareerBadge(clean);
    }
  };

  if (homeNameInput) {
    homeNameInput.oninput = () => syncNameInputs(homeNameInput.value);
  }
  if (landingNameInput) {
    landingNameInput.oninput = () => syncNameInputs(landingNameInput.value);
  }
  if (mobNameInput) {
    mobNameInput.oninput = () => syncNameInputs(mobNameInput.value);
  }

  // Randomize Runic Slayer Handle Button
  const randomizeBtn = $('aic-randomize-btn');
  if (randomizeBtn) {
    randomizeBtn.onclick = () => {
      const activeCls = G.selectedClass || 'knight';
      const runicTitle = getRandomRunicName(activeCls);
      syncNameInputs(runicTitle);
      Audio.playGem();
      if (landingNameInput) {
        landingNameInput.style.transform = 'scale(1.03)';
        setTimeout(() => { if (landingNameInput) landingNameInput.style.transform = 'none'; }, 150);
      }
    };
  }

  const stats = getPlayerStats();
  const homeRec = $('home-record');
  if (homeRec) homeRec.textContent = 'WAVE ' + stats.bestWave;
  const mobRec = $('mob-home-record');
  if (mobRec) mobRec.textContent = 'WAVE ' + stats.bestWave;

  // Unified Hero Selection Handler (Desktop + Mobile)
  const HERO_CLASSES = ['knight', 'mage', 'archer'];
  function switchHeroClass(cls) {
    G.selectedClass = cls;
    document.querySelectorAll('.roster-card').forEach((c) => c.classList.toggle('active', c.dataset.cls === cls));
    document.querySelectorAll('.mob-class-chip').forEach((c) => c.classList.toggle('active', c.dataset.cls === cls));
    createPlayer(cls);
    updateHeroDetailsCard(cls);
    const currentName = (landingNameInput?.value || mobNameInput?.value || '').trim();
    if (!currentName || currentName === 'Vanguard Sovereign' || currentName === 'Astral Sorcerer' || currentName === 'Verdant Ranger') {
      const defaultName = getSavedName(cls);
      syncNameInputs(defaultName);
    }
    if (cls === 'knight') Audio.playSpecialSound('aegis');
    else if (cls === 'mage') Audio.playSpecialSound('singularity');
    else Audio.playBow();
  }

  const rosterCards = document.querySelectorAll('.roster-card');
  rosterCards.forEach((card) => {
    card.addEventListener('click', () => switchHeroClass(card.dataset.cls));
  });

  // Mobile Carousel Buttons (< and >)
  const mobPrevBtn = $('mob-hero-prev-btn');
  if (mobPrevBtn) {
    mobPrevBtn.onclick = () => {
      const curIdx = HERO_CLASSES.indexOf(G.selectedClass || 'knight');
      const prevIdx = (curIdx - 1 + HERO_CLASSES.length) % HERO_CLASSES.length;
      switchHeroClass(HERO_CLASSES[prevIdx]);
    };
  }
  const mobNextBtn = $('mob-hero-next-btn');
  if (mobNextBtn) {
    mobNextBtn.onclick = () => {
      const curIdx = HERO_CLASSES.indexOf(G.selectedClass || 'knight');
      const nextIdx = (curIdx + 1) % HERO_CLASSES.length;
      switchHeroClass(HERO_CLASSES[nextIdx]);
    };
  }

  // Mobile Bottom Command Deck Chips
  document.querySelectorAll('.mob-class-chip').forEach((chip) => {
    chip.addEventListener('click', () => switchHeroClass(chip.dataset.cls));
  });

  // Mobile Start / Deploy Button
  const mobStartBtn = $('mob-startbtn');
  if (mobStartBtn) {
    mobStartBtn.onclick = () => {
      Audio.initAudio();
      startRun(G.selectedClass || 'knight');
    };
  }

  // Mobile Tactical Drawer Tabs
  const mobTabBtns = document.querySelectorAll('.mob-tab-btn');
  const mobTabPanes = document.querySelectorAll('.mob-tab-pane');
  mobTabBtns.forEach((btn) => {
    btn.onclick = () => {
      mobTabBtns.forEach((b) => b.classList.remove('active'));
      mobTabPanes.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = $(`mob-pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
      const card = $('mob-dossier-card');
      if (card && card.classList.contains('minimized')) {
        card.classList.remove('minimized');
        const chev = $('mob-drawer-chevron');
        if (chev) chev.innerHTML = getIcon('chevron_down', 14);
      }
    };
  });

  // Mobile Drawer Toggle (Hide/Show to appreciate 3D Character)
  const mobDrawerToggle = $('mob-drawer-toggle');
  if (mobDrawerToggle) {
    mobDrawerToggle.onclick = () => {
      const card = $('mob-dossier-card');
      if (card) {
        card.classList.toggle('minimized');
        const isMin = card.classList.contains('minimized');
        const chev = $('mob-drawer-chevron');
        if (chev) chev.innerHTML = isMin ? getIcon('chevron_up', 14) : getIcon('chevron_down', 14);
      }
    };
  }

  // Mobile Top HUD Modal Triggers
  const mobLbBtn = $('mob-leaderboard-btn');
  if (mobLbBtn) mobLbBtn.onclick = () => openLeaderboardModal('all');
  const mobGuideBtn = $('mob-guide-btn');
  if (mobGuideBtn) mobGuideBtn.onclick = () => guideModal?.classList.add('show');

  const guideOpen = $('guide-open-btn');
  const guideClose = $('guide-close-btn');
  const guideOk = $('guide-ok-btn');
  const guideModal = $('guidemodal');
  if (guideOpen) guideOpen.onclick = () => guideModal?.classList.add('show');
  if (guideClose) guideClose.onclick = () => guideModal?.classList.remove('show');
  if (guideOk) guideOk.onclick = () => guideModal?.classList.remove('show');

  // Populate active champion on initial load
  updateHeroDetailsCard(G.selectedClass || 'knight');
}

function updateHeroDetailsCard(cls) {
  const c = CLASSES[cls];
  if (!c) return;

  const archetypeBadge = $('hero-archetype-badge');
  const displayName = $('hero-display-name');
  const displayTitle = $('hero-display-title');
  const loreBio = $('hero-lore-bio');

  const barDur = $('stat-bar-dur');
  const valDur = $('stat-val-dur');
  const barMob = $('stat-bar-mob');
  const valMob = $('stat-val-mob');
  const barDmg = $('stat-bar-dmg');
  const valDmg = $('stat-val-dmg');

  const hpcName = $('hpc-name');
  const hpcDesc = $('hpc-desc');

  // Mobile overlay elements
  const mobBadge = $('mob-hero-badge');
  const mobName = $('mob-hero-name');
  const mobTitle = $('mob-hero-title');
  const mobDurFill = $('mob-bar-dur');
  const mobDurVal = $('mob-val-dur');
  const mobMobFill = $('mob-bar-mob');
  const mobMobVal = $('mob-val-mob');
  const mobDmgFill = $('mob-bar-dmg');
  const mobDmgVal = $('mob-val-dmg');
  const mobHpcN = $('mob-hpc-name');
  const mobHpcD = $('mob-hpc-desc');

  const wfcIcon = $('wfc-icon');
  const wfcName = $('wfc-name');
  const wfcType = $('wfc-type');
  const wfcDmg = $('wfc-dmg');
  const wfcArc = $('wfc-arc');

  const abIconQ = $('ab-icon-q');
  const abNameQ = $('ab-name-q');
  const abCdQ = $('ab-cd-q');
  const abDescQ = $('ab-desc-q');

  const abIconE = $('ab-icon-e');
  const abNameE = $('ab-name-e');
  const abCdE = $('ab-cd-e');
  const abDescE = $('ab-desc-e');

  const abIconR = $('ab-icon-r');
  const abNameR = $('ab-name-r');
  const abCdR = $('ab-cd-r');
  const abDescR = $('ab-desc-r');

  if (cls === 'knight') {
    if (archetypeBadge) archetypeBadge.textContent = 'VANGUARD SOVEREIGN';
    if (displayName) displayName.textContent = 'IMPERIUN';
    if (displayTitle) displayTitle.textContent = 'The Royal Sovereign';
    if (loreBio) loreBio.textContent = 'Clad in full golden plate armour with royal crimson cape and lion crest. Stood as the unbroken bulwark during the Siege of Sol-Keth.';

    if (barDur) barDur.style.width = '95%';
    if (valDur) valDur.textContent = 'HIGH';
    if (barMob) barMob.style.width = '65%';
    if (valMob) valMob.textContent = 'MID';
    if (barDmg) barDmg.style.width = '88%';
    if (valDmg) valDmg.textContent = 'BURST';

    if (hpcName) hpcName.textContent = 'Bulwark of the Crown';
    if (hpcDesc) hpcDesc.textContent = '+30% Maximum Health pool and +50% knockback resistance against charging fiends.';

    // Mobile sync
    if (mobBadge) mobBadge.textContent = 'VANGUARD SOVEREIGN';
    if (mobName) mobName.textContent = 'IMPERIUN';
    if (mobTitle) mobTitle.textContent = 'The Royal Sovereign';
    if (mobDurFill) mobDurFill.style.width = '95%';
    if (mobDurVal) mobDurVal.textContent = 'HIGH';
    if (mobMobFill) mobMobFill.style.width = '65%';
    if (mobMobVal) mobMobVal.textContent = 'MID';
    if (mobDmgFill) mobDmgFill.style.width = '88%';
    if (mobDmgVal) mobDmgVal.textContent = 'BURST';
    if (mobHpcN) mobHpcN.textContent = 'Bulwark:';
    if (mobHpcD) mobHpcD.textContent = '+30% Max HP & +50% knockback res.';

    if (wfcIcon) wfcIcon.innerHTML = getIcon('sword', 20);
    if (wfcName) wfcName.textContent = 'Sword Sweep';
    if (wfcType) wfcType.textContent = 'Melee Arc Cleave';
    if (wfcDmg) wfcDmg.textContent = '24';
    if (wfcArc) wfcArc.textContent = '240°';
  } else if (cls === 'mage') {
    if (archetypeBadge) archetypeBadge.textContent = 'ASTRAL ENCHANTRESS';
    if (displayName) displayName.textContent = 'ZILI';
    if (displayTitle) displayTitle.textContent = 'The Astral Sorceress';
    if (loreBio) loreBio.textContent = 'Adorned in a silver silk corset and flowing cloak. She channels ancient cosmic starfire to disintegrate encroaching horrors.';

    if (barDur) barDur.style.width = '70%';
    if (valDur) valDur.textContent = 'MID';
    if (barMob) barMob.style.width = '75%';
    if (valMob) valMob.textContent = 'SWIFT';
    if (barDmg) barDmg.style.width = '95%';
    if (valDmg) valDmg.textContent = 'EXTREME';

    if (hpcName) hpcName.textContent = 'Cosmic Starfire';
    if (hpcDesc) hpcDesc.textContent = 'Explosive astral projectile impact with piercing area-of-effect detonations.';

    // Mobile sync
    if (mobBadge) mobBadge.textContent = 'ASTRAL ENCHANTRESS';
    if (mobName) mobName.textContent = 'ZILI';
    if (mobTitle) mobTitle.textContent = 'The Astral Sorceress';
    if (mobDurFill) mobDurFill.style.width = '70%';
    if (mobDurVal) mobDurVal.textContent = 'MID';
    if (mobMobFill) mobMobFill.style.width = '75%';
    if (mobMobVal) mobMobVal.textContent = 'SWIFT';
    if (mobDmgFill) mobDmgFill.style.width = '95%';
    if (mobDmgVal) mobDmgVal.textContent = 'EXTREME';
    if (mobHpcN) mobHpcN.textContent = 'Starfire:';
    if (mobHpcD) mobHpcD.textContent = 'Piercing AoE explosive starbursts.';

    if (wfcIcon) wfcIcon.innerHTML = getIcon('magic', 20);
    if (wfcName) wfcName.textContent = 'Energy Ball';
    if (wfcType) wfcType.textContent = 'Piercing Astral Orb';
    if (wfcDmg) wfcDmg.textContent = '22';
    if (wfcArc) wfcArc.textContent = 'AoE 1.7m';
  } else if (cls === 'archer') {
    if (archetypeBadge) archetypeBadge.textContent = 'SHADOW STALKER';
    if (displayName) displayName.textContent = 'AREN';
    if (displayTitle) displayTitle.textContent = 'The Ghost Ranger';
    if (loreBio) loreBio.textContent = 'Silent wanderer cloaked in a peaked scarlet hood and leather quiver. His arrows strike unseen with deadly hunting precision.';

    if (barDur) barDur.style.width = '65%';
    if (valDur) valDur.textContent = 'LEAN';
    if (barMob) barMob.style.width = '95%';
    if (valMob) valMob.textContent = 'AGILE';
    if (barDmg) barDmg.style.width = '85%';
    if (valDmg) valDmg.textContent = 'PRECISION';

    if (hpcName) hpcName.textContent = 'Windrunner Pace';
    if (hpcDesc) hpcDesc.textContent = '+12% Base Movement speed and rapid bow tension draw allowing constant kiting.';

    // Mobile sync
    if (mobBadge) mobBadge.textContent = 'SHADOW STALKER';
    if (mobName) mobName.textContent = 'AREN';
    if (mobTitle) mobTitle.textContent = 'The Ghost Ranger';
    if (mobDurFill) mobDurFill.style.width = '65%';
    if (mobDurVal) mobDurVal.textContent = 'LEAN';
    if (mobMobFill) mobMobFill.style.width = '95%';
    if (mobMobVal) mobMobVal.textContent = 'AGILE';
    if (mobDmgFill) mobDmgFill.style.width = '85%';
    if (mobDmgVal) mobDmgVal.textContent = 'PRECISION';
    if (mobHpcN) mobHpcN.textContent = 'Windrunner:';
    if (mobHpcD) mobHpcD.textContent = '+12% Move speed & rapid bow draws.';

    if (wfcIcon) wfcIcon.innerHTML = getIcon('bow', 20);
    if (wfcName) wfcName.textContent = 'Auto Bow';
    if (wfcType) wfcType.textContent = 'Piercing Hunting Draw';
    if (wfcDmg) wfcDmg.textContent = '16';
    if (wfcArc) wfcArc.textContent = 'Range 16m';
  }

  // Populate 3 special talent cards from config (Desktop & Mobile)
  if (c.specials && c.specials.length >= 3) {
    if (abIconQ) abIconQ.innerHTML = getIcon(c.specials[0].icon, 18);
    if (abNameQ) abNameQ.textContent = c.specials[0].name;
    if (abCdQ) abCdQ.textContent = `${c.specials[0].cd}s CD`;
    if (abDescQ) abDescQ.textContent = c.specials[0].desc;

    const mobAbNameQ = $('mob-ab-name-q');
    const mobAbDescQ = $('mob-ab-desc-q');
    const mobAbCdQ = $('mob-ab-cd-q');
    if (mobAbNameQ) mobAbNameQ.textContent = c.specials[0].name;
    if (mobAbDescQ) mobAbDescQ.textContent = c.specials[0].desc;
    if (mobAbCdQ) mobAbCdQ.textContent = `${c.specials[0].cd}s CD`;

    if (abIconE) abIconE.innerHTML = getIcon(c.specials[1].icon, 18);
    if (abNameE) abNameE.textContent = c.specials[1].name;
    if (abCdE) abCdE.textContent = `${c.specials[1].cd}s CD`;
    if (abDescE) abDescE.textContent = c.specials[1].desc;

    const mobAbNameE = $('mob-ab-name-e');
    const mobAbDescE = $('mob-ab-desc-e');
    const mobAbCdE = $('mob-ab-cd-e');
    if (mobAbNameE) mobAbNameE.textContent = c.specials[1].name;
    if (mobAbDescE) mobAbDescE.textContent = c.specials[1].desc;
    if (mobAbCdE) mobAbCdE.textContent = `${c.specials[1].cd}s CD`;

    if (abIconR) abIconR.innerHTML = getIcon(c.specials[2].icon, 18);
    if (abNameR) abNameR.textContent = c.specials[2].name;
    if (abCdR) abCdR.textContent = `${c.specials[2].cd}s CD`;
    if (abDescR) abDescR.textContent = c.specials[2].desc;

    const mobAbNameR = $('mob-ab-name-r');
    const mobAbDescR = $('mob-ab-desc-r');
    const mobAbCdR = $('mob-ab-cd-r');
    if (mobAbNameR) mobAbNameR.textContent = c.specials[2].name;
    if (mobAbDescR) mobAbDescR.textContent = c.specials[2].desc;
    if (mobAbCdR) mobAbCdR.textContent = `${c.specials[2].cd}s CD`;
  }
}

function openClassSelect() {
  dom.menu.classList.remove('show');
  dom.classcards.innerHTML = Object.entries(CLASSES).map(([id, c]) => `
    <div class="perkcard" data-cls="${id}" style="width:250px">
      <div class="picon">${getIcon(c.icon, 36)}</div>
      <div class="ptitle">${c.name}</div>
      <div style="font-size:8px;color:#ffd24a;margin-top:-6px;letter-spacing:0.5px">${c.title || ''}</div>
      <div class="pdesc">${c.desc}</div>
      <div class="pkey" style="margin-top:6px;display:flex;align-items:center;gap:6px">Weapon: ${getIcon(WEAPONS[c.weapon].icon, 16)} ${WEAPONS[c.weapon].name}</div>
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #334155;font-size:7px;color:#94a3b8;line-height:1.7;text-align:left">
        <div><b style="color:#ffd24a">[Q]</b> ${getIcon(c.specials[0].icon, 12)} ${c.specials[0].name}</div>
        <div><b style="color:#ffd24a">[E]</b> ${getIcon(c.specials[1].icon, 12)} ${c.specials[1].name}</div>
        <div><b style="color:#ffd24a">[R]</b> ${getIcon(c.specials[2].icon, 12)} ${c.specials[2].name}</div>
      </div>
    </div>`).join('');
  dom.classcards.querySelectorAll('.perkcard').forEach((el) =>
    el.addEventListener('click', () => startRun(el.dataset.cls)));
  dom.classselect.classList.add('show');
}

// ============================================================= LIVING ENVIRONMENT LOOP
function updateEnvironment(dt) {
  const t = G.time;

  // 1. Braziers, Torches, and Beacon Pulsing
  for (const b of envAnim.braziers) {
    const flicker = Math.sin(t * 7 + b.phase) * 0.28 + Math.cos(t * 13 + b.phase * 2) * 0.12;
    b.light.intensity = Math.max(0.6, b.baseInt + flicker);
    if (b.flame) {
      const s = 1 + flicker * 0.22;
      b.flame.scale.set(s, s * (b.type === 'inferno' ? 1.4 : 1.1), s);
      b.flame.rotation.y += dt * 1.5;
    }
  }

  // 2. Whispering Forest Trees Wind Swaying
  for (const tr of envAnim.trees) {
    const sway = Math.sin(t * tr.speed + tr.phase) * 0.045;
    tr.group.rotation.z = sway;
    tr.group.rotation.x = Math.cos(t * (tr.speed * 0.8) + tr.phase) * 0.035;
  }

  // 3. The Inferno Bubbling Molten Lava
  for (const lv of envAnim.lava) {
    const pulse = 1 + Math.sin(t * 2.8 + lv.phase) * 0.08;
    lv.mesh.scale.set(pulse, pulse, 1);
    if (lv.mesh.material && lv.mesh.material.color) {
      const g = 0.22 + Math.sin(t * 4 + lv.phase) * 0.1;
      lv.mesh.material.color.setRGB(1.0, Math.max(0.12, g), 0.0);
    }
  }

  // 4. The Abyssal Void Hovering / Spinning Cosmic Crystals
  for (const cr of envAnim.crystals) {
    cr.mesh.rotation.y += dt * cr.rotSpeed;
    cr.mesh.rotation.x += dt * (cr.rotSpeed * 0.6);
    cr.mesh.position.y = cr.baseY + Math.sin(t * 2.2 + cr.phase) * 0.35;
  }

  // 5. Cosmic Void Gravitational Rings
  for (const rn of envAnim.runes) {
    rn.mesh.rotation.z += dt * rn.rot;
    const pulse = 1 + Math.sin(t * 2.5 + rn.phase) * 0.09;
    rn.mesh.scale.set(pulse, pulse, 1);
  }

  // 6. Ambient Spores, Embers, and Void Motes
  const m = envAnim.motes;
  if (m && m.points) {
    const pos = m.points.geometry.attributes.position.array;
    for (let i = 0; i < m.count; i++) {
      const v = m.vels[i];
      // Vertical drift
      pos[i * 3 + 1] += v.vy * dt;
      // Slight atmospheric swirling
      pos[i * 3] += (v.vx + Math.sin(t * 1.5 + v.phase) * 0.6) * dt;
      pos[i * 3 + 2] += (v.vz + Math.cos(t * 1.5 + v.phase) * 0.6) * dt;

      // Wrap around bounds
      if (pos[i * 3 + 1] > 8.5) {
        pos[i * 3 + 1] = 0.4;
        pos[i * 3] = (Math.random() - 0.5) * m.lim * 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * m.lim * 2;
      }
      if (Math.abs(pos[i * 3]) > m.lim) pos[i * 3] *= -0.95;
      if (Math.abs(pos[i * 3 + 2]) > m.lim) pos[i * 3 + 2] *= -0.95;
    }
    m.points.geometry.attributes.position.needsUpdate = true;
  }

  // 7. Hanging Crypt Lantern Sways & Flickers
  for (const l of envAnim.lanterns) {
    if (l.flame) {
      l.flame.position.x = Math.sin(t * 1.8 + l.phase) * 0.12;
      l.flame.position.z = Math.cos(t * 1.4 + l.phase) * 0.12;
      const flicker = 1.0 + Math.sin(t * 8 + l.phase) * 0.22;
      l.light.intensity = flicker;
    }
  }

  // 8. Bioluminescent Fungi Breathing
  for (const sh of envAnim.shrooms) {
    const pulse = 1.0 + Math.sin(t * 2.8 + sh.phase) * 0.12;
    sh.group.scale.set(pulse, pulse, pulse);
  }

  // 9. Volcanic Floor Vent Geyser Bursts
  for (const v of envAnim.vents) {
    v.timer -= dt;
    if (v.timer <= 0) {
      v.timer = 1.8 + Math.random() * 2.2;
      v.light.intensity = 3.5;
      burst(new THREE.Vector3(v.pos.x + (Math.random() - 0.5) * 0.8, 0.4, v.pos.z + (Math.random() - 0.5) * 0.8), 0xff7b00, 4);
    } else {
      v.light.intensity = THREE.MathUtils.lerp(v.light.intensity, 0.8, dt * 3);
    }
  }
}

// ============================================================= LOOP
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (G.mode === 'playing' && !G.drafting) {
    G.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateWeapons(dt);
    updateProjectiles(dt);
    updateOrbs(dt);
    updateWaves(dt);
    updateFX(dt);
    updateEnvironment(dt);
    updateSpecials(dt);
    updateSpecialEntities(dt);
    updateRealmPortal(dt);
  } else if (G.mode === 'menu' || G.drafting || G.mode === 'paused') {
    // Keep ambient atmosphere alive even in menu / pause
    G.time += dt * 0.5;
    updateEnvironment(dt * 0.5);
    updateRealmPortal(dt * 0.5);
    if (G.mode === 'menu') animateMenuHero(dt);
  }
  if (player) { updateCamera(dt); updateLights(); }
  updateHUD();
  updateSpeedlines();
  if (innerWidth && innerHeight) composer.render();   // skip when pane is hidden (0-size)
}

function animateMenuHero(dt) {
  if (!player || !player.parts) return;
  const p = player.parts;
  const t = G.time * 2.2;
  if (p.torso) p.torso.position.y = 1.35 + Math.sin(t) * 0.035;
  if (p.armL) p.armL.rotation.x = Math.sin(t * 0.7) * 0.08;
  if (p.armR) p.armR.rotation.x = -Math.sin(t * 0.7) * 0.08;
  if (p.head) p.head.rotation.y = Math.sin(t * 0.4) * 0.12;
  if (p.cloak) p.cloak.rotation.x = 0.22 + Math.sin(t * 1.4) * 0.06;
}

// ============================================================= DEBUG (dev only)
window.__LBS = {
  G, enemies, projectiles, orbs,
  PERKS, WEAPONS, PLAYER, ENEMIES, BOSSES, MAPS,
  get player() { return player; },
  get WPN() { return WPN; },
  get modifiers() { return modifiers; },
  get P() { return P; },
  get realmPortal() { return realmPortal; },
  applyPerk, spawnEnemy, spawnBoss, damageEnemy, killEnemy, hitPlayer,
  startRun, startWave, addXp, nearest, FIRE, initWeapons, waveSpec, xpForLevel,
  spawnRealmPortal, enterRealmPortal,
};












