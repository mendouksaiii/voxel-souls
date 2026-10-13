// textures.js — procedural 16×16 pixel-art textures (Minecraft-ish), cached as CanvasTextures.
import * as THREE from 'three';

const cache = new Map();

function make(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// deterministic value-noise so textures don't shimmer between calls
function noise(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

function fill(g, col) { g.fillStyle = col; g.fillRect(0, 0, 16, 16); }
function speckle(g, cols, seed, amt = 0.5) {
  const rnd = noise(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rnd() < amt) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
  }
}
function bricks(g, base, mortar, seed) {
  fill(g, base);
  g.fillStyle = mortar;
  for (let y = 0; y <= 16; y += 8) g.fillRect(0, y, 16, 1);
  // offset vertical mortar lines per row
  g.fillRect(8, 0, 1, 8); g.fillRect(0, 8, 1, 8); g.fillRect(8, 8, 1, 8); g.fillRect(0, 0, 1, 8);
  speckle(g, [base, mortar], seed, 0.12);
}

// face/body for a mob cube: body color + 2 eyes + optional mouth
function mob(g, body, shade, eye, opts = {}) {
  fill(g, body);
  speckle(g, [body, shade], opts.seed || 7, opts.rough ?? 0.35);
  // eyes
  g.fillStyle = eye;
  g.fillRect(4, 5, 2, 2); g.fillRect(10, 5, 2, 2);
  if (opts.mouth) { g.fillStyle = opts.mouth; g.fillRect(5, 10, 6, 2); }
  if (opts.creeper) { // creeper face
    g.fillStyle = '#111'; g.fillRect(4,4,3,3); g.fillRect(9,4,3,3);
    g.fillRect(6,8,4,3); g.fillRect(5,10,2,3); g.fillRect(9,10,2,3);
  }
}

// bevel: subtle highlight on top/left, shadow on bottom/right → gives blocks depth
function edges(g) {
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
}

const RECIPES = {
  cobble:      g => { speckle(g, ['#6f737a', '#595d64', '#878c93', '#4c5057'], 11, 1); edges(g); },
  stonebrick:  g => { bricks(g, '#71767e', '#4a4e55', 21); edges(g); },
  mossy:       g => { bricks(g, '#5f6b4d', '#3c4432', 31); speckle(g, ['#4f7a3a', '#3c5e2c'], 33, 0.22); edges(g); },
  mossy_brick: g => { bricks(g, '#3b4d37', '#253522', 35); speckle(g, ['#5b8a42', '#72b050', '#2d4224'], 37, 0.35); edges(g); },
  forest_grass:g => { speckle(g, ['#264e1d', '#346628', '#1e3e16', '#3f7c32', '#1b3314'], 81, 1); speckle(g, ['#62a842', '#a3cf57'], 82, 0.15); },
  netherrack:  g => { speckle(g, ['#5a2420', '#48201c', '#6e2a22', '#3a1714'], 41, 1); edges(g); },
  nether_brick:g => { bricks(g, '#2e1518', '#1b0c0e', 51); speckle(g, ['#4a1f22', '#6b241c'], 53, 0.2); edges(g); },
  endstone:    g => { speckle(g, ['#dcd9a6', '#c9c58e', '#b4b078', '#e7e4b8'], 61, 1); edges(g); },
  obsidian:    g => { speckle(g, ['#0d0818', '#160d28', '#080510', '#1c1033'], 71, 1); speckle(g, ['#5a2b82', '#381b5c'], 73, 0.18); edges(g); },
  void_pillar: g => { bricks(g, '#1a102a', '#0a0514', 75); speckle(g, ['#7b3eb8', '#4b2478', '#a855f7'], 77, 0.22); edges(g); },
  grass:       g => { speckle(g, ['#3f6b2e', '#345c27', '#4a7a36', '#2c4d20'], 81, 1); edges(g); },
  dirt:        g => { speckle(g, ['#5a4228', '#4a3620', '#6a4e30', '#3e2d1a'], 83, 1); edges(g); },
  sand:        g => { speckle(g, ['#cdbb86', '#c0ad75', '#d8c796', '#b6a268'], 85, 1); edges(g); },
  bark:        g => { fill(g, '#4a3420'); for (let x = 0; x < 16; x += 3) { g.fillStyle = (x / 3) % 2 ? '#5a4028' : '#3a2817'; g.fillRect(x, 0, 2, 16); } speckle(g, ['#3a2817', '#5a4028'], 87, 0.22); edges(g); },
  leaves:      g => { speckle(g, ['#2f5a24', '#264a1d', '#376b2a', '#1e3d17', '#448434'], 89, 1); },
  dungeon_moss_flagstone: g => {
    fill(g, '#2a312c');
    speckle(g, ['#202622', '#353e37', '#1b201d', '#3f4b42'], 67, 0.75);
    g.fillStyle = '#141815';
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
    g.fillRect(7, 0, 1, 8); g.fillRect(11, 8, 1, 8);
    g.fillStyle = '#2f5927';
    g.fillRect(0, 1, 3, 1); g.fillRect(6, 7, 3, 2); g.fillRect(10, 8, 2, 2); g.fillRect(1, 8, 2, 1);
    speckle(g, ['#437c35', '#24451c'], 69, 0.28);
    edges(g);
  },
  dungeon_crypt_brick: g => {
    bricks(g, '#2c3530', '#161c18', 73);
    speckle(g, ['#222a25', '#3c4841', '#32572b'], 75, 0.3);
    edges(g);
  },
  scorched_basalt: g => {
    fill(g, '#181212');
    speckle(g, ['#221919', '#100c0c', '#2b1f1e'], 43, 0.8);
    g.fillStyle = '#6e1910';
    g.fillRect(3, 0, 1, 6); g.fillRect(4, 5, 5, 1); g.fillRect(8, 6, 1, 10);
    g.fillStyle = '#ff4d15';
    g.fillRect(3, 2, 1, 2); g.fillRect(5, 5, 2, 1); g.fillRect(8, 8, 1, 3);
    g.fillStyle = '#ffd24a';
    g.fillRect(8, 9, 1, 1);
    edges(g);
  },
  brimstone_wall: g => {
    bricks(g, '#221114', '#0d0607', 55);
    speckle(g, ['#36171a', '#4a1917', '#ff4d15'], 57, 0.24);
    edges(g);
  },
  void_nexus: g => {
    fill(g, '#080412');
    speckle(g, ['#110820', '#04020a', '#180d2c'], 79, 0.75);
    g.fillStyle = 'rgba(168, 85, 247, 0.4)';
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    g.fillRect(4, 4, 8, 1); g.fillRect(4, 11, 8, 1);
    g.fillRect(4, 4, 1, 8); g.fillRect(11, 4, 1, 8);
    g.fillStyle = '#c084fc';
    g.fillRect(7, 7, 2, 2);
    edges(g);
  },
  dungeon_iron_grate: g => {
    fill(g, '#0b0d0c');
    g.fillStyle = '#4c524e';
    for (let x = 2; x < 16; x += 3) g.fillRect(x, 0, 1, 16);
    for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1);
    g.fillStyle = '#1a1f1c';
    for (let x = 2; x < 16; x += 3) for (let y = 3; y < 16; y += 4) g.fillRect(x, y, 1, 1);
  },
  ancient_relic_stone: g => {
    fill(g, '#343d37');
    speckle(g, ['#28312b', '#445148'], 83, 0.6);
    g.fillStyle = '#6ee7b7';
    g.fillRect(5, 3, 6, 1); g.fillRect(8, 3, 1, 10);
    g.fillRect(4, 7, 8, 1); g.fillRect(5, 11, 6, 1);
    edges(g);
  },
  dungeon_floor: g => { fill(g, '#3a3e46'); speckle(g, ['#33373f', '#42464f', '#2d3038'], 91, 0.6);
    g.fillStyle = '#24272d'; g.fillRect(0, 7, 16, 2); g.fillRect(7, 0, 2, 16);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 9, 16, 1); },
  dungeon_wall:  g => { bricks(g, '#474c55', '#282c33', 93); speckle(g, ['#3f4852', '#565c66'], 95, 0.14); edges(g); },
  wood:          g => { fill(g, '#6b4a2a'); for (let y = 0; y < 16; y += 4) { g.fillStyle = '#49311a'; g.fillRect(0, y, 16, 1); } speckle(g, ['#5a3f22', '#7a5530'], 97, 0.3); edges(g); },
  player:      g => mob(g, '#30a7c7', '#2688a3', '#1b2430', { mouth: '#caa07a', seed: 3, rough: 0.2 }),
  zombie:      g => mob(g, '#4f8f3f', '#3c6e30', '#14301a', { mouth: '#223', seed: 5 }),
  skeleton:    g => mob(g, '#d8dadb', '#b4b6b7', '#111', { mouth: '#222', seed: 9, rough: 0.3 }),
  creeper:     g => mob(g, '#5fb94e', '#4a9140', '#111', { creeper: true, seed: 13 }),
  spider:      g => mob(g, '#2a2320', '#171210', '#b43b2a', { seed: 17, rough: 0.5 }),
};

export function tex(name) {
  if (!cache.has(name)) {
    const recipe = RECIPES[name] || RECIPES.cobble;
    cache.set(name, make(16, recipe));
  }
  return cache.get(name);
}

// a soft radial blob for shadows / glows (not pixelated)
export function blob(color = '#000', alpha = 0.5) {
  const key = 'blob:' + color + alpha;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha; g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t); return t;
}

// white rune-circle (tinted by material color) for a glowing floor seal
export function seal() {
  if (cache.has('seal')) return cache.get('seal');
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.translate(128, 128);
  for (const r of [120, 104, 70]) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
  for (let i = 0; i < 24; i++) {                    // outer tick marks
    const a = i / 24 * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a) * 120, Math.sin(a) * 120); g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {                      // inner star/runes
    const a = i / 6 * Math.PI * 2, a2 = (i + 2) / 6 * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * 68, Math.sin(a) * 68); g.lineTo(Math.cos(a2) * 68, Math.sin(a2) * 68); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cache.set('seal', t); return t;
}

