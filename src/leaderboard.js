// src/leaderboard.js — Client-Side Hall of Champions & Vercel API Client
import { getIcon } from './icons.js';

export const SEEDED_CHAMPIONS = [
  { id: 'seed-1', name: 'Aurelius Dawnshield', cls: 'knight', wave: 42, score: 68420, kills: 184, titans: 3, time: 845, date: 'OCT 12' },
  { id: 'seed-2', name: 'Zili Voidwalker', cls: 'mage', wave: 38, score: 61200, kills: 192, titans: 3, time: 780, date: 'OCT 12' },
  { id: 'seed-3', name: 'Kael Shadowstride', cls: 'archer', wave: 35, score: 55800, kills: 165, titans: 3, time: 710, date: 'OCT 11' },
  { id: 'seed-4', name: 'Seraphina Sunfire', cls: 'mage', wave: 31, score: 49100, kills: 144, titans: 3, time: 640, date: 'OCT 11' },
  { id: 'seed-5', name: 'Lord Malakor', cls: 'knight', wave: 27, score: 41900, kills: 128, titans: 2, time: 580, date: 'OCT 10' },
  { id: 'seed-6', name: 'Sylas Windrunner', cls: 'archer', wave: 24, score: 36500, kills: 112, titans: 2, time: 520, date: 'OCT 10' },
  { id: 'seed-7', name: 'Ignis Emberheart', cls: 'mage', wave: 21, score: 32400, kills: 98, titans: 2, time: 460, date: 'OCT 09' },
  { id: 'seed-8', name: 'Valerius Bulwark', cls: 'knight', wave: 19, score: 28600, kills: 86, titans: 1, time: 410, date: 'OCT 09' },
  { id: 'seed-9', name: 'Lyra Nightbloom', cls: 'archer', wave: 15, score: 22900, kills: 74, titans: 1, time: 340, date: 'OCT 08' },
  { id: 'seed-10', name: 'Torin the Initiate', cls: 'knight', wave: 11, score: 17400, kills: 56, titans: 1, time: 260, date: 'OCT 08' },
];

const LOCAL_STORAGE_KEY = 'lbs_leaderboard';
const STATS_STORAGE_KEY = 'lbs_player_stats';
const NAME_STORAGE_KEY = 'lbs_saved_name';

let cachedScores = null;
let currentFilter = 'all';

export function calculateScore(wave, kills, titans, time) {
  const w = Math.max(1, wave || 1);
  const k = Math.max(0, kills || 0);
  const t = Math.max(0, titans || 0);
  const s = Math.max(1, time || 1);
  return (w * 1200) + (k * 65) + (t * 5000) + Math.min(3000, Math.floor(s * 5));
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function getPlayerStats() {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { bestWave: 1, highScore: 0, totalTitans: 0, totalKills: 0, expeditions: 0 };
}

export function updatePlayerStats(newEntry) {
  const stats = getPlayerStats();
  stats.bestWave = Math.max(stats.bestWave, newEntry.wave);
  stats.highScore = Math.max(stats.highScore, newEntry.score);
  stats.totalTitans += (newEntry.titans || 0);
  stats.totalKills += (newEntry.kills || 0);
  stats.expeditions += 1;
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (_) {}
  return stats;
}

export function getSavedName(defaultCls = 'knight') {
  try {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch (_) {}
  if (defaultCls === 'mage') return 'Astral Sorcerer';
  if (defaultCls === 'archer') return 'Verdant Ranger';
  return 'Vanguard Sovereign';
}

export function setSavedName(name) {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name.trim());
  } catch (_) {}
}

export function getLocalScores() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (_) {}
  return [...SEEDED_CHAMPIONS];
}

export function saveLocalScores(scores) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(scores));
  } catch (_) {}
}

export async function fetchLeaderboardScores(cls = 'all') {
  try {
    const query = cls && cls !== 'all' ? `?cls=${cls}` : '';
    const res = await fetch(`/api/leaderboard${query}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        cachedScores = json.data;
        saveLocalScores(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.warn('API unreachable, using local storage fallback:', err.message);
  }

  // Resilient fallback
  const local = getLocalScores();
  cachedScores = local;
  let filtered = [...local];
  if (cls && cls !== 'all') {
    filtered = filtered.filter((s) => s.cls === cls);
  }
  filtered.sort((a, b) => b.score - a.score || b.wave - a.wave || a.time - b.time);
  return filtered;
}

export async function submitScore(entry) {
  setSavedName(entry.name);
  updatePlayerStats(entry);

  // 1. Save locally immediately
  const local = getLocalScores();
  const fullEntry = {
    ...entry,
    id: 'user-' + Date.now(),
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
    isUser: true,
  };
  local.push(fullEntry);
  local.sort((a, b) => b.score - a.score || b.wave - a.wave || a.time - b.time);
  const trimmed = local.slice(0, 100);
  saveLocalScores(trimmed);
  cachedScores = trimmed;

  const localRank = trimmed.findIndex((s) => s.id === fullEntry.id) + 1;

  // 2. Attempt Vercel API submission
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return { success: true, rank: json.rank || localRank, entry: json.entry || fullEntry };
      }
    }
  } catch (err) {
    console.warn('Leaderboard API sync failed, recorded locally:', err.message);
  }

  return { success: true, rank: localRank, entry: fullEntry, offline: true };
}

export function openLeaderboardModal(tab = 'all') {
  const modal = document.getElementById('hall-of-champions-modal');
  if (!modal) return;
  modal.classList.add('show');
  currentFilter = tab;
  updateTabUI(tab);
  renderLeaderboardContent(tab);
}

export function closeLeaderboardModal() {
  const modal = document.getElementById('hall-of-champions-modal');
  if (modal) modal.classList.remove('show');
}

function updateTabUI(tab) {
  document.querySelectorAll('.hoc-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

export async function renderLeaderboardContent(tab = 'all') {
  const listEl = document.getElementById('hoc-scores-body');
  const statsBestWave = document.getElementById('hoc-stat-best-wave');
  const statsHighScore = document.getElementById('hoc-stat-high-score');
  const statsTitans = document.getElementById('hoc-stat-titans');
  const statsKills = document.getElementById('hoc-stat-kills');

  // Update top player summary cards
  const playerStats = getPlayerStats();
  if (statsBestWave) statsBestWave.textContent = `WAVE ${playerStats.bestWave}`;
  if (statsHighScore) statsHighScore.textContent = playerStats.highScore.toLocaleString();
  if (statsTitans) statsTitans.textContent = `${playerStats.totalTitans} TITANS`;
  if (statsKills) statsKills.textContent = `${playerStats.totalKills.toLocaleString()}`;

  if (listEl) {
    listEl.innerHTML = `
      <div class="hoc-loading">
        <div class="rwo-ring" style="width:36px;height:36px;margin:12px auto;"></div>
        <span>CONSULTING THE ABYSSAL CODEX...</span>
      </div>
    `;
  }

  const scores = await fetchLeaderboardScores(tab);

  if (!listEl) return;

  if (!scores.length) {
    listEl.innerHTML = `<div class="hoc-empty">NO EXPEDITIONS RECORDED FOR THIS GUILD YET.</div>`;
    return;
  }

  listEl.innerHTML = scores.map((s, idx) => {
    const rank = idx + 1;
    let rankBadge = `<span class="hoc-rank-num">#${rank}</span>`;
    let rowTier = '';

    if (rank === 1) {
      rankBadge = `<span class="hoc-rank-badge gold">${getIcon('trophy', 16)} 1ST</span>`;
      rowTier = 'tier-gold';
    } else if (rank === 2) {
      rankBadge = `<span class="hoc-rank-badge silver">${getIcon('medal', 16)} 2ND</span>`;
      rowTier = 'tier-silver';
    } else if (rank === 3) {
      rankBadge = `<span class="hoc-rank-badge bronze">${getIcon('medal', 16)} 3RD</span>`;
      rowTier = 'tier-bronze';
    }

    const clsIcon = s.cls === 'mage' ? getIcon('magic', 14) : (s.cls === 'archer' ? getIcon('bow', 14) : getIcon('sword', 14));
    const clsName = s.cls === 'mage' ? 'ASTRAL' : (s.cls === 'archer' ? 'VERDANT' : 'VANGUARD');

    let realmName = 'REALM I · SANCTUM';
    if (s.wave > 30) realmName = 'ENDLESS ASCENT';
    else if (s.wave >= 21) realmName = 'REALM III · VOID';
    else if (s.wave >= 11) realmName = 'REALM II · INFERNO';

    const isUserClass = s.isUser ? 'is-user-run' : '';

    return `
      <div class="hoc-row ${rowTier} ${isUserClass}">
        <div class="hoc-col rank">${rankBadge}</div>
        <div class="hoc-col player">
          <div class="hoc-player-name">
            ${s.name}
            ${s.isUser ? `<span class="hoc-you-badge">YOU</span>` : ''}
          </div>
          <div class="hoc-player-sub">${realmName} · WAVE ${s.wave}</div>
        </div>
        <div class="hoc-col cls">
          <span class="hoc-cls-pill cls-${s.cls}">${clsIcon} ${clsName}</span>
        </div>
        <div class="hoc-col stats">
          <span class="hoc-stat-badge" title="Titans Slain">${getIcon('crown', 12)} ${s.titans}</span>
          <span class="hoc-stat-badge" title="Fiends Slayed">${getIcon('skull', 12)} ${s.kills}</span>
          <span class="hoc-stat-badge time">${formatTime(s.time)}</span>
        </div>
        <div class="hoc-col score">
          <span class="hoc-score-val">${s.score.toLocaleString()}</span>
          <span class="hoc-score-lbl">SCORE</span>
        </div>
      </div>
    `;
  }).join('');
}

export function initLeaderboard() {
  const openBtn = document.getElementById('leaderboard-open-btn');
  const closeBtn = document.getElementById('hoc-close-btn');
  const refreshBtn = document.getElementById('hoc-refresh-btn');
  const modal = document.getElementById('hall-of-champions-modal');

  if (openBtn) openBtn.onclick = () => openLeaderboardModal('all');
  if (closeBtn) closeBtn.onclick = () => closeLeaderboardModal();
  if (refreshBtn) refreshBtn.onclick = () => renderLeaderboardContent(currentFilter);

  // Tab Filtering Click Handlers
  document.querySelectorAll('.hoc-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      currentFilter = tab;
      updateTabUI(tab);
      renderLeaderboardContent(tab);
    };
  });

  // Modal Backdrop Click to Close
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeLeaderboardModal();
    };
  }

  // Pre-load scores silently
  fetchLeaderboardScores('all');
}
