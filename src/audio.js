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
let currentTrackIndex = null;
let bgmFadeTimer = null;
const BGM_VOLUME = 0.50;

// Registry of continuous looped soundtracks per realm / dungeon
const DUNGEON_TRACKS = {
  0: {
    id: 'dungeon_forest',
    name: 'Forgotten Sanctum',
    path: './assets/audio/dungeon_forest.mp3',
    audio: null,
    source: null,
    gain: null,
  },
  1: {
    id: 'dungeon_inferno',
    name: 'The Inferno',
    path: './assets/audio/dungeon_inferno.mp3',
    audio: null,
    source: null,
    gain: null,
  },
};

export function initBgm() {
  if (typeof window === 'undefined') return;

  // Pre-initialize and preload available dungeon audio tracks
  for (const idx of [0, 1]) {
    const track = DUNGEON_TRACKS[idx];
    if (track && !track.audio) {
      track.audio = new Audio();
      track.audio.src = track.path;
      track.audio.loop = true;
      track.audio.preload = 'auto';
      track.audio.volume = isMutedState ? 0 : BGM_VOLUME;

      try {
        if (ctx && !track.source) {
          track.source = ctx.createMediaElementSource(track.audio);
          track.gain = ctx.createGain();
          track.gain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
          track.source.connect(track.gain);
          track.gain.connect(masterGain || ctx.destination);
        }
      } catch (e) {
        // MediaElementSource routing fallback to direct element volume
      }
    }
  }
}

export function playDungeonMusic(mapIndex = 0) {
  if (typeof window === 'undefined') return;
  initAudio();
  initBgm();

  // If entering a dungeon without an assigned soundtrack (e.g., Dungeon 3: Void), fade out previous track cleanly
  if (!(mapIndex in DUNGEON_TRACKS)) {
    stopDungeonMusic(1.2);
    return;
  }

  // If the desired dungeon track is ALREADY the active track
  if (currentTrackIndex === mapIndex) {
    const active = DUNGEON_TRACKS[mapIndex];
    if (active && active.audio) {
      active.audio.loop = true;
      if (active.audio.paused) {
        active.audio.volume = isMutedState ? 0 : BGM_VOLUME;
        if (active.gain && ctx) {
          active.gain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
        }
        const playPromise = active.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn(`Audio play for Dungeon ${mapIndex + 1} waiting for gesture:`, err.message);
          });
        }
      }
    }
    return;
  }

  // If switching from another dungeon track, pause and reset the previous one
  if (currentTrackIndex !== null && DUNGEON_TRACKS[currentTrackIndex]) {
    const prev = DUNGEON_TRACKS[currentTrackIndex];
    if (prev.audio) {
      prev.audio.pause();
      prev.audio.currentTime = 0;
    }
  }

  // Cancel any in-progress fadeout
  if (bgmFadeTimer) {
    clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;
  }

  currentTrackIndex = mapIndex;
  const next = DUNGEON_TRACKS[mapIndex];
  if (next && next.audio) {
    next.audio.loop = true;
    next.audio.volume = isMutedState ? 0 : BGM_VOLUME;
    if (next.gain && ctx) {
      next.gain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
    }

    const playPromise = next.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn(`Audio play for Dungeon ${mapIndex + 1} waiting for user gesture:`, err.message);
      });
    }
  }
}

export function pauseDungeonMusic() {
  if (currentTrackIndex !== null && DUNGEON_TRACKS[currentTrackIndex]) {
    const active = DUNGEON_TRACKS[currentTrackIndex];
    if (active && active.audio && !active.audio.paused) {
      active.audio.pause();
    }
  }
}

export function resumeDungeonMusic() {
  if (currentTrackIndex !== null && DUNGEON_TRACKS[currentTrackIndex]) {
    const active = DUNGEON_TRACKS[currentTrackIndex];
    if (active && active.audio && active.audio.paused) {
      active.audio.volume = isMutedState ? 0 : BGM_VOLUME;
      if (active.gain && ctx) {
        active.gain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
      }
      const playPromise = active.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  }
}

export function stopDungeonMusic(fadeSec = 0.5) {
  if (currentTrackIndex === null || !DUNGEON_TRACKS[currentTrackIndex]) return;
  const active = DUNGEON_TRACKS[currentTrackIndex];
  if (!active || !active.audio || active.audio.paused) return;

  if (fadeSec > 0) {
    const startVol = active.audio.volume;
    const steps = 12;
    const stepTime = (fadeSec * 1000) / steps;
    let step = 0;

    clearInterval(bgmFadeTimer);
    bgmFadeTimer = setInterval(() => {
      step++;
      const factor = Math.max(0, 1 - step / steps);
      if (active.audio) active.audio.volume = startVol * factor;
      if (active.gain && ctx) {
        active.gain.gain.setValueAtTime(BGM_VOLUME * factor, ctx.currentTime);
      }
      if (step >= steps) {
        clearInterval(bgmFadeTimer);
        bgmFadeTimer = null;
        if (active.audio) {
          active.audio.pause();
          active.audio.currentTime = 0;
          active.audio.volume = isMutedState ? 0 : BGM_VOLUME;
        }
        currentTrackIndex = null;
      }
    }, stepTime);
  } else {
    active.audio.pause();
    active.audio.currentTime = 0;
    currentTrackIndex = null;
  }
}

export function updateBgmVolume() {
  for (const idx in DUNGEON_TRACKS) {
    const track = DUNGEON_TRACKS[idx];
    if (track && track.audio) {
      track.audio.volume = isMutedState ? 0 : BGM_VOLUME;
    }
    if (track && track.gain && ctx) {
      track.gain.gain.setValueAtTime(isMutedState ? 0 : BGM_VOLUME, ctx.currentTime);
    }
  }
}

export function getCurrentBgm() {
  if (currentTrackIndex === null || !DUNGEON_TRACKS[currentTrackIndex]) return null;
  return {
    mapIndex: currentTrackIndex,
    name: DUNGEON_TRACKS[currentTrackIndex].name,
    id: DUNGEON_TRACKS[currentTrackIndex].id,
    isPlaying: Boolean(DUNGEON_TRACKS[currentTrackIndex].audio && !DUNGEON_TRACKS[currentTrackIndex].audio.paused),
  };
}


