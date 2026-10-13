// config.js — all tunables & data tables. Systems read from here so balancing = edit data.

export const PLAYER = {
  hp: 100,
  speed: 7.6,          // increased from 6.5 for agile, fluid locomotion
  accel: 20,           // balanced responsiveness for smooth gliding feel
  radius: 0.5,
  dashSpeed: 30,
  dashDur: 0.16,       // seconds
  dashCd: 0.8,
  dashIframes: 0.24,
  pickupRange: 3.2,
  invulnAfterHit: 0.5,
};

// Auto-attack weapons. The player starts with `sword`; perks add/upgrade others.
export const WEAPONS = {
  sword: {
    name: 'Sword Sweep', icon: 'sword',
    dmg: 24, cd: 0.6, range: 3.2, arc: Math.PI * 1.35, knockback: 6,
  },
  bow: {
    name: 'Auto Bow', icon: 'bow',
    dmg: 16, cd: 0.75, speed: 26, range: 16, pierce: 0, knockback: 2,
  },
  tnt: {
    name: 'TNT Lob', icon: 'tnt',
    dmg: 40, cd: 2.2, aoe: 3.4, range: 10, knockback: 10,
  },
  snowball: {
    name: 'Snowball Nova', icon: 'ice', dmg: 10, cd: 1.1, count: 6, speed: 20, range: 10, slow: 0.5, slowDur: 1.2,
  },
  magic: {
    name: 'Energy Ball', icon: 'magic', dmg: 22, cd: 0.68, speed: 18, range: 15, pierce: 1, aoe: 1.7, knockback: 3,
  },
};

// Starting classes — unique heroes with custom skins, silhouettes, and mechanics.
export const CLASSES = {
  knight: { 
    name: 'Imperiun', 
    title: 'The Royal Sovereign',
    weapon: 'sword', 
    icon: 'shield', 
    hpMul: 1.3, 
    speedMul: 1.0, 
    melee: true,
    desc: 'Clad in magnificent full golden plate armour, lion crest & billowing royal crimson cape. High durability (+30% HP) with devastating sword sweeps.',
    specials: [
      { key: 'q', name: 'Aegis Rush', icon: 'shield', cd: 6, desc: 'Manifests a towering golden shield of light and charges forward, slamming and stunning enemies in your path.' },
      { key: 'e', name: 'Solar Tempest', icon: 'sword', cd: 10, desc: 'Summons a sacred sun seal and orbiting golden blade storm that vacuums in nearby enemies and shreds them.' },
      { key: 'r', name: 'Wrath of Heavens', icon: 'crown', cd: 18, desc: 'Calls down a colossal 14m divine blade from the sky, causing a cataclysmic holy fissure and granting golden avatar armor.' }
    ]
  },
  archer: { 
    name: 'Aren', 
    title: 'The Ghost Ranger',
    weapon: 'bow', 
    icon: 'bow', 
    hpMul: 0.85, 
    speedMul: 1.12,
    desc: 'Donned in a deep scarlet peaked hood, shoulder mantle & leather arrow quiver. Agile marksman (+12% speed) drawing piercing hunting arrows.',
    specials: [
      { key: 'q', name: 'Scattershot', icon: 'target', cd: 5, desc: 'Fires 7 high-velocity crimson arrows that splinter into seeking ricochet shrapnel upon impact.' },
      { key: 'e', name: 'Shadow Vault', icon: 'wind', cd: 8, desc: 'Flips backwards into crimson smoke, scattering toxic caltrops that cripple and inflict corrosive bleed.' },
      { key: 'r', name: 'Skyfall Barrage', icon: 'rain', cd: 16, desc: 'Launches a flare beacon, unleashing an apocalyptic rain of 48 flaming crimson arrows from the sky.' }
    ]
  },
  mage: { 
    name: 'Zili', 
    title: 'The Astral Sorceress',
    weapon: 'magic', 
    icon: 'magic', 
    hpMul: 0.9, 
    speedMul: 1.0,
    desc: 'Graceful elven sorceress in a wide flared silver gown, silken corset & flowing silver cloak. Channels cosmic starfire that explodes on impact.',
    specials: [
      { key: 'q', name: 'Singularity', icon: 'blackhole', cd: 6, desc: 'Launches a gravitational black hole that pulls all nearby enemies into its crushing event horizon.' },
      { key: 'e', name: 'Glacial Shatter', icon: 'ice', cd: 9, desc: 'Erupts a ring of 10 jagged 3D ice spires, freezing enemies completely solid before shattering into shards.' },
      { key: 'r', name: 'Supernova', icon: 'supernova', cd: 18, desc: 'Summons a gigantic celestial star from deep space, obliterating all bullets and detonating in an apocalyptic shockwave.' }
    ]
  },
};

// Enemy archetypes → Minecraft mobs, each a distinct pressure type.
export const ENEMIES = {
  zombie:   { name: 'Zombie',   hp: 40,  speed: 3.4, dmg: 10, xp: 3,  radius: 0.5, tex: 'zombie',   behavior: 'chase',  size: [0.9,1.8,0.9] },
  skeleton: { name: 'Skeleton', hp: 28,  speed: 3.0, dmg: 8,  xp: 4,  radius: 0.5, tex: 'skeleton', behavior: 'archer', range: 11, shotCd: 1.6, projSpeed: 14, size: [0.85,1.8,0.85] },
  creeper:  { name: 'Creeper',  hp: 34,  speed: 4.2, dmg: 45, xp: 6,  radius: 0.5, tex: 'creeper',  behavior: 'bomber', fuse: 0.9, aoe: 3.0, size: [0.8,1.7,0.8] },
  spider:   { name: 'Spider',   hp: 20,  speed: 6.8, dmg: 7,  xp: 3,  radius: 0.55, tex: 'spider',  behavior: 'flank',  size: [1.4,0.8,1.4] },
};

// Bosses — one per realm, spawned on the realm's final wave (10 / 20 / 30).
// Each titan commands a distinct 3-Attack Sequence rotation with custom telegraphs & mechanics.
export const BOSSES = {
  zombieKing: { 
    name: 'Zombie King', 
    title: 'Ancient Undead Monarch', 
    hp: 2800, speed: 2.8, dmg: 36, xp: 220, radius: 1.4, tex: 'zombie', size: [2.4, 4.4, 2.4],
    attacks: [
      { id: 'earthshaker', name: 'Cataclysmic Slam', desc: 'Leaps skyward and crashes down with expanding emerald shockwaves and stone spikes.', telegraph: 1.0 },
      { id: 'tomb_legion', name: 'Tomb Legion Fissures', desc: 'Erupts necrotic spirit geysers under the player and summons armoured crypt guards.', telegraph: 1.1 },
      { id: 'monarch_charge', name: 'Sovereign Bull Rush', desc: 'Locks aim with a crimson trajectory and charges at high speed with a 360° cleave.', telegraph: 0.9 }
    ]
  },
  blazeLord: { 
    name: 'Blaze Lord', 
    title: 'Molten Core Sovereign', 
    hp: 4800, speed: 2.6, dmg: 44, xp: 340, radius: 1.4, tex: 'skeleton', size: [2.4, 4.6, 2.4],
    attacks: [
      { id: 'spiral_nova', name: 'Volcanic Spiral Nova', desc: 'Channels an Archimedean spiral of rotating fireballs in an intense bullet hell.', telegraph: 0.95 },
      { id: 'meteor_strike', name: 'Brimstone Meteors', desc: 'Locks multiple impact reticles on the ground, calling down devastating flaming meteors.', telegraph: 1.1 },
      { id: 'infernal_vortex', name: 'Solar Heat Vortex', desc: 'Draws the player inward with intense thermal gravity before detonating outward.', telegraph: 1.3 }
    ]
  },
  warden: { 
    name: 'The Warden', 
    title: 'Ender of Dimensions', 
    hp: 8500, speed: 3.2, dmg: 65, xp: 550, radius: 1.6, tex: 'creeper', size: [2.8, 5.2, 2.8],
    attacks: [
      { id: 'void_blink', name: 'Null-Blink Scythe', desc: 'Dematerializes and blinks directly behind the player, sweeping a 180° cosmic void blade.', telegraph: 0.75 },
      { id: 'death_ray', name: 'Abyssal Oblivion Beam', desc: 'Locks a crimson targeting laser and sweeps a massive dimensional disintegrator beam.', telegraph: 1.0 },
      { id: 'event_horizon', name: 'Dimensional Singularity', desc: 'Summons a cosmic black hole emitting radial cross-pulsing void spheres before collapsing.', telegraph: 1.2 }
    ]
  },
};

// Three roguelite themed zones (10 waves each; wave%10===0 is the boss encounter).
export const MAPS = [
  { 
    name: 'FORGOTTEN SANCTUM', 
    subtitle: 'Overgrown Forest Crypt & Ancient Colonnades',
    floor: 'dungeon_moss_flagstone', 
    wall: 'mossy_brick', 
    pillar: 'dungeon_crypt_brick',
    fog: 0x08130d, 
    sky: 0x0a1811, 
    light: 0xa8f5c8, 
    ground: 0x050d08, 
    accent: 0x4ade80, 
    theme: 'forest',
    boss: 'zombieKing', 
    spawnTable: ['spider', 'zombie', 'spider', 'skeleton', 'zombie'] 
  },
  { 
    name: 'THE INFERNO', 
    subtitle: 'Brimstone Bastion & Molten Chasms',
    floor: 'scorched_basalt', 
    wall: 'brimstone_wall', 
    pillar: 'brimstone_wall',
    fog: 0x220703, 
    sky: 0x330903, 
    light: 0xff6a28, 
    ground: 0x140302, 
    accent: 0xf97316, 
    theme: 'inferno',
    boss: 'blazeLord', 
    spawnTable: ['creeper', 'skeleton', 'zombie', 'creeper', 'spider'] 
  },
  { 
    name: 'THE ABYSSAL VOID', 
    subtitle: 'Cosmic Citadel & Null-Space Rifts',
    floor: 'void_nexus', 
    wall: 'void_pillar', 
    pillar: 'void_pillar',
    fog: 0x070312, 
    sky: 0x0b041a, 
    light: 0xd8b4fe, 
    ground: 0x030108, 
    accent: 0xa855f7, 
    theme: 'void',
    boss: 'warden', 
    spawnTable: ['creeper', 'skeleton', 'spider', 'creeper', 'spider', 'skeleton', 'zombie'] 
  },
];

export const ARENA = { size: 86, wallH: 13, spawnRing: 26 };

// Progressive roguelite difficulty curve: ~2x compounding stat jumps across waves & punishing titans.
export function waveSpec(wave) {
  const mapIndex = Math.min(2, Math.floor((wave - 1) / 10));
  const isBoss = wave % 10 === 0;
  const inMap = ((wave - 1) % 10) + 1;        // 1..10 within current realm

  // Realm tier baseline jumps:
  // Realm 1 (Forgotten Sanctum): 1.0x baseline
  // Realm 2 (The Inferno): 2.4x baseline jump
  // Realm 3 (The Abyssal Void): 4.2x baseline jump
  const realmTierMult = mapIndex === 0 ? 1.0 : (mapIndex === 1 ? 2.4 : 4.2);
  const endlessMult = wave > 30 ? Math.pow(1.18, wave - 30) : 1.0;

  // 2x Stronger each wave curve:
  // Wave 1: 1.0x baseline
  // Wave 2: ~2.15x (literally >2x of Wave 1)
  // Wave 3: ~3.85x
  // Wave 4: ~6.2x
  // Wave 5: ~9.4x
  // Wave 10: ~32x
  const inMapStep = (inMap - 1);
  const hpScale = (1 + inMapStep * 1.05) * Math.pow(1.16, inMapStep) * realmTierMult * endlessMult;

  // Punishing Damage Scaling (foes hit significantly harder each wave)
  const baseDmgMult = mapIndex === 0 
    ? (1 + inMapStep * 0.42) * Math.pow(1.08, inMapStep)
    : (mapIndex === 1 ? (2.2 + inMapStep * 0.55) : (3.8 + inMapStep * 0.75));
  const dmgScale = baseDmgMult * endlessMult;

  // Speed Scaling: relentless pursuit
  const spdScale = 1 + Math.min(0.85, (wave - 1) * 0.028);

  // High Mob Swarm Density & Rapid Spawn cadence
  const count = isBoss ? 0 : Math.round((9 + inMap * 3.2 + mapIndex * 7) * (wave > 30 ? 1.4 : 1.0));
  const spawnRate = Math.max(0.14, 0.90 - inMap * 0.06 - mapIndex * 0.10);

  // Snipers: faster projectile arrows and reduced shot cooldowns
  const shotCdScale = Math.max(0.42, 1 - (wave - 1) * 0.03);
  const projSpeedScale = 1 + Math.min(0.75, (wave - 1) * 0.022);

  // Titan Boss Scaling: significantly reinforced monarch stats
  const bossHpScale = (mapIndex === 0 ? 2.2 : (mapIndex === 1 ? 3.4 : 5.0)) * endlessMult;
  const bossDmgScale = (mapIndex === 0 ? 1.75 : (mapIndex === 1 ? 2.85 : 4.2)) * endlessMult;

  // Elite Champion spawn chance: starts at wave 3, scaling up to 45%
  const eliteChance = wave >= 3 ? Math.min(0.45, 0.12 + (wave - 3) * 0.025) : 0;

  return {
    wave, mapIndex, isBoss, inMap, count,
    hpScale, dmgScale, spdScale, spawnRate,
    shotCdScale, projSpeedScale, bossHpScale, bossDmgScale, eliteChance
  };
}

export const XP = {
  base: 10,            // xp to reach level 2
  growth: 1.35,        // each level needs growth× more
  perLevelHeal: 0.12,  // heal 12% max hp on level up
};

// Perk pool. Drafted 1-of-3 on level up. Rarity: common, rare, epic, legendary.
export const PERKS = [
  { id: 'swiftboots', icon: 'boot', rarity: 'common', title: 'Swift Boots', desc: '+18% move speed.', type: 'stat', stat: 'speed', mul: 1.18 },
  { id: 'sharpsword', icon: 'sword', rarity: 'common', title: 'Sharpness', desc: '+30% sword damage.', type: 'weaponmod', weapon: 'sword', field: 'dmg', mul: 1.3 },
  { id: 'wideswing', icon: 'whirl', rarity: 'rare', title: 'Wide Swing', desc: '+40% sword sweep range.', type: 'weaponmod', weapon: 'sword', field: 'range', mul: 1.4 },
  { id: 'frenzy', icon: 'zap', rarity: 'rare', title: 'Frenzy', desc: '-20% attack cooldown (all weapons).', type: 'global', field: 'cd', mul: 0.8 },
  { id: 'getbow', icon: 'bow', rarity: 'rare', title: 'Take Up the Bow', desc: 'Gain the Auto Bow — fires rapid piercing arrows.', type: 'addweapon', weapon: 'bow' },
  { id: 'gettnt', icon: 'tnt', rarity: 'rare', title: 'Pocket TNT', desc: 'Gain TNT Lob — detonates on impact.', type: 'addweapon', weapon: 'tnt' },
  { id: 'getsnow', icon: 'ice', rarity: 'rare', title: 'Snow Nova', desc: 'Gain Snowball Nova — freezes and slows enemies.', type: 'addweapon', weapon: 'snowball' },
  { id: 'multishot', icon: 'target', rarity: 'epic', title: 'Multishot', desc: 'Bow fires +2 arrows per volley.', type: 'weaponmod', weapon: 'bow', field: 'count', add: 2, requires: 'bow' },
  { id: 'pierce', icon: 'arrow', rarity: 'common', title: 'Piercing Arrows', desc: 'Arrows pierce +2 enemies.', type: 'weaponmod', weapon: 'bow', field: 'pierce', add: 2, requires: 'bow' },
  { id: 'biggerboom', icon: 'boom', rarity: 'rare', title: 'Bigger Boom', desc: '+50% TNT blast radius.', type: 'weaponmod', weapon: 'tnt', field: 'aoe', mul: 1.5, requires: 'tnt' },
  { id: 'vigor', icon: 'heart', rarity: 'common', title: 'Vigor', desc: '+30 max HP and heal to full.', type: 'maxhp', add: 30 },
  { id: 'regen', icon: 'leaf', rarity: 'rare', title: 'Regeneration', desc: 'Regenerate 1.8 HP every second.', type: 'regen', add: 1.8 },
  { id: 'thorns', icon: 'shield', rarity: 'common', title: 'Spiked Thorns', desc: 'Reflect 50% of contact damage.', type: 'thorns', add: 0.5 },
  { id: 'magnet', icon: 'magnet', rarity: 'common', title: 'Gravity Magnet', desc: '+120% XP pickup range.', type: 'stat', stat: 'pickupRange', mul: 2.2 },
  { id: 'greed', icon: 'gem', rarity: 'rare', title: 'Gem Collector', desc: '+25% XP from all kills.', type: 'xpmul', mul: 1.25 },
  { id: 'dasher', icon: 'wind', rarity: 'rare', title: 'Phantom Dash', desc: '-35% dash cooldown.', type: 'stat', stat: 'dashCd', mul: 0.65 },
  { id: 'lifesteal', icon: 'drop', rarity: 'epic', title: 'Vampiric Touch', desc: 'Heal 1 HP per 10 damage dealt.', type: 'lifesteal', add: 1 / 10 },
  { id: 'glasscannon', icon: 'glass', rarity: 'epic', title: 'Glass Cannon', desc: '+45% all damage, -15 max HP.', type: 'glass', dmgMul: 1.45, hp: -15 },
  { id: 'whirlwind', icon: 'whirl', rarity: 'legendary', title: 'Whirlwind Cleave', desc: 'Sword strikes in a full 360° circle around you.', type: 'weaponmod', weapon: 'sword', field: 'arc', add: 2.1, requires: 'sword' },
  { id: 'heavyblade', icon: 'heavy', rarity: 'legendary', title: 'Heavy Sovereign Blade', desc: '+40% sword damage and double knockback.', type: 'weaponmod', weapon: 'sword', field: 'dmg', mul: 1.4, extraField: 'knockback', extraMul: 2, requires: 'sword' },
  { id: 'critmaster', icon: 'star', rarity: 'epic', title: 'Deadly Precision', desc: '+20% Critical Strike Chance (2x damage).', type: 'crit', add: 0.2 },
];
