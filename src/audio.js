// audio.js — Procedural Web Audio API sound synthesizer for Last Block Standing
// Zero external files, instantaneous latency, rich retro-arcade & orchestral soundscapes.

let ctx = null;
let masterGain = null;
let isMutedState = false;
let xpStreak = 0;
let xpStreakTimer = null;

// Pentatonic scale frequencies for musical arcade XP pickups
const XP_NOTES = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 1046.50];

export function initAudio() {
  if (ctx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    ctx = new AudioContextClass();
    masterGain = ctx.createGain();
    
    // Check saved mute state
    isMutedState = localStorage.getItem('lbs_muted') === 'true';
    masterGain.gain.setValueAtTime(isMutedState ? 0 : 0.45, ctx.currentTime);
    masterGain.connect(ctx.destination);
  } catch (e) {
    console.warn('Web Audio not supported:', e);
  }
}

function ensureContext() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx && !isMutedState;
}

export function isMuted() {
  return isMutedState;
}

export function toggleMute() {
  isMutedState = !isMutedState;
  localStorage.setItem('lbs_muted', isMutedState);
  if (ctx && masterGain) {
    masterGain.gain.setValueAtTime(isMutedState ? 0 : 0.45, ctx.currentTime);
  }
  updateBgmVolume();
  return isMutedState;
}

// ------------------------------------------------------------- SOUND GENERATORS

// 1. Dash whoosh (filtered white noise + sine sweep)
export function playDash() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(150, now + 0.16);

  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.16);
}

// 2. Sword slash whoosh
export function playSword() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(540, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.14);
}

// 3. Bow release twang
export function playBow() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);

  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.12);
}

// 4. Magic projectile cast
export function playMagic() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.22);

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.22);
}

// 5. Enemy hit impact (punchy crunch)
export function playHit(isCrit = false) {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = isCrit ? 'square' : 'triangle';
  osc.frequency.setValueAtTime(isCrit ? 360 : 180, now);
  osc.frequency.exponentialRampToValueAtTime(isCrit ? 80 : 40, now + (isCrit ? 0.18 : 0.09));

  gain.gain.setValueAtTime(isCrit ? 0.6 : 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + (isCrit ? 0.18 : 0.09));

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + (isCrit ? 0.18 : 0.09));
}

// 6. Player hurt sound
export function playHurt() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.18);
}

// 7. XP gem pickup (ascending musical pentatonic chimes)
export function playXp() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  clearTimeout(xpStreakTimer);
  const freq = XP_NOTES[xpStreak % XP_NOTES.length];
  xpStreak = Math.min(xpStreak + 1, XP_NOTES.length - 1);
  xpStreakTimer = setTimeout(() => { xpStreak = 0; }, 1400);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.12);
}

// 8. Level Up triumphant fanfare
export function playLevelUp() {
  if (!ensureContext()) return;
  const notes = [392, 523.25, 659.25, 783.99, 1046.50];
  const now = ctx.currentTime;

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + idx * 0.07);

    gain.gain.setValueAtTime(0.35, now + idx * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.07 + 0.35);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now + idx * 0.07);
    osc.stop(now + idx * 0.07 + 0.35);
  });
}

// 9. Explosion / TNT detonate
export function playExplosion() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

  gain.gain.setValueAtTime(0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.45);
}

// 10. Wave start bell / horn
export function playWaveStart(isBoss = false) {
  if (!ensureContext()) return;
  const now = ctx.currentTime;
  const chords = isBoss ? [110, 164.81, 220] : [220, 330, 440];

  chords.forEach(freq => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isBoss ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(isBoss ? 0.45 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + (isBoss ? 0.9 : 0.5));

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + (isBoss ? 0.9 : 0.5));
  });
}

// 11. Hero Special Moves soundscapes
export function playSpecialSound(kind) {
  if (!ensureContext()) return;
  const now = ctx.currentTime;

  if (kind === 'aegis') {
    // Heavy metal shield crash + bass swell
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.4);

  } else if (kind === 'solar') {
    // Resonant golden whirlwind
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.5);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.55);

  } else if (kind === 'wrath') {
    // Thunderous celestial crash
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth'; osc2.type = 'sine';
    osc1.frequency.setValueAtTime(140, now); osc1.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    osc2.frequency.setValueAtTime(880, now); osc2.frequency.exponentialRampToValueAtTime(110, now + 0.8);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc1.connect(gain); osc2.connect(gain); gain.connect(masterGain);
    osc1.start(now); osc2.start(now); osc1.stop(now + 0.8); osc2.stop(now + 0.8);

  } else if (kind === 'singularity') {
    // Deep gravitational drone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.6);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.7);

  } else if (kind === 'glacial') {
    // Sharp glass/ice crack
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now); osc.stop(now + 0.25);

  } else if (kind === 'supernova') {
    // Apocalyptic sub-bass explosion
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now); osc.stop(now + 1.2);
  }
}

// 12. Realm Descent Waygate spawned
export function playPortalSpawn() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;
  const freqs = [174, 261.63, 392, 523.25];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, now + i * 0.08);
    gain.gain.setValueAtTime(0.35, now + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(now + i * 0.08); osc.stop(now + 1.8);
  });
}

// 13. Dimensional Warp through Waygate
export function playPortalWarp() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(80, now);
  osc1.frequency.exponentialRampToValueAtTime(880, now + 0.8);
  gain1.gain.setValueAtTime(0.7, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.85);
  osc1.connect(gain1); gain1.connect(masterGain);
  osc1.start(now); osc1.stop(now + 0.85);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(220, now + 0.4);
  osc2.frequency.exponentialRampToValueAtTime(45, now + 1.4);
  gain2.gain.setValueAtTime(0.8, now + 0.4);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
  osc2.connect(gain2); gain2.connect(masterGain);
  osc2.start(now + 0.4); osc2.stop(now + 1.4);
}

// 14. Grand Victory Fanfare
export function playVictory() {
  if (!ensureContext()) return;
  const now = ctx.currentTime;
  const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t = now + i * 0.12;
    osc.frequency.setValueAtTime(f, t);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(t); osc.stop(t + 1.5);
  });
}

// ============================================================= BACKGROUND MUSIC (BGM)
let bgmAudio = null;
let bgmGain = null;
let bgmSourceNode = null;
let currentBgmTrack = null;
let bgmFadeTimer = null;
const BGM_VOLUME = 0.50;

export function initBgm() {
  if (typeof window === 'undefined') return;
  if (!bgmAudio) {
    bgmAudio = new Audio();
    bgmAudio.src = './assets/audio/dungeon_forest.mp3';
    bgmAudio.loop = true;
    bgmAudio.preload = 'auto';
    bgmAudio.volume = isMutedState ? 0 : BGM_VOLUME;

    // Connect to Web Audio graph if available
    try {
      if (ctx && !bgmSourceNode) {
        bgmSourceNode = ctx.createMediaElementSource(bgmAudio);
        bgmGain = ctx.createGain();
        bgmGain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
        bgmSourceNode.connect(bgmGain);
        bgmGain.connect(masterGain || ctx.destination);
      }
    } catch (e) {
      // Fallback to direct audio element volume control
      console.warn('MediaElementSource routing skipped, using direct element volume:', e.message);
    }
  }
}

export function playDungeonMusic(mapIndex = 0) {
  if (typeof window === 'undefined') return;
  initAudio();
  initBgm();

  if (mapIndex === 0) {
    if (!bgmAudio) return;

    if (currentBgmTrack !== 'dungeon_forest') {
      bgmAudio.src = './assets/audio/dungeon_forest.mp3';
      bgmAudio.loop = true;
      currentBgmTrack = 'dungeon_forest';
    }

    bgmAudio.volume = isMutedState ? 0 : BGM_VOLUME;
    if (bgmGain && ctx) {
      bgmGain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
    }

    if (bgmAudio.paused) {
      const playPromise = bgmAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio play waiting for user gesture:', err.message);
        });
      }
    }
  } else {
    // Other dungeons fade out first dungeon's music
    stopDungeonMusic(1.2);
  }
}

export function pauseDungeonMusic() {
  if (bgmAudio && !bgmAudio.paused) {
    bgmAudio.pause();
  }
}

export function resumeDungeonMusic() {
  if (bgmAudio && bgmAudio.paused && currentBgmTrack === 'dungeon_forest') {
    bgmAudio.volume = isMutedState ? 0 : BGM_VOLUME;
    if (bgmGain && ctx) {
      bgmGain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
    }
    const playPromise = bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  }
}

export function stopDungeonMusic(fadeSec = 0.5) {
  if (!bgmAudio || bgmAudio.paused) return;

  if (fadeSec > 0) {
    const startVol = bgmAudio.volume;
    const steps = 12;
    const stepTime = (fadeSec * 1000) / steps;
    let step = 0;

    clearInterval(bgmFadeTimer);
    bgmFadeTimer = setInterval(() => {
      step++;
      const factor = Math.max(0, 1 - step / steps);
      if (bgmAudio) bgmAudio.volume = startVol * factor;
      if (bgmGain && ctx) {
        bgmGain.gain.setValueAtTime(BGM_VOLUME * factor, ctx.currentTime);
      }
      if (step >= steps) {
        clearInterval(bgmFadeTimer);
        if (bgmAudio) {
          bgmAudio.pause();
          bgmAudio.currentTime = 0;
          bgmAudio.volume = isMutedState ? 0 : BGM_VOLUME;
        }
        currentBgmTrack = null;
      }
    }, stepTime);
  } else {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    currentBgmTrack = null;
  }
}

export function updateBgmVolume() {
  if (bgmAudio) {
    bgmAudio.volume = isMutedState ? 0 : BGM_VOLUME;
  }
  if (bgmGain && ctx) {
    bgmGain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
  }
}

