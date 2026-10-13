// src/leaderboard.js — Client-Side Hall of Champions & Real-Player Codex
import { getIcon } from './icons.js';

const KNOWN_SEED_NAMES = new Set([
  'aurelius dawnshield', 'zili voidwalker', 'kael shadowstride',
  'seraphina sunfire', 'lord malakor', 'sylas windrunner',
  'ignis emberheart', 'valerius bulwark', 'lyra nightbloom', 'torin the initiate'
]);

export function isSeedEntry(s) {
  if (!s || typeof s !== 'object') return true;
  if (s.isSeed === true) return true;
  if (typeof s.id === 'string' && s.id.startsWith('seed-')) return true;
  const name = String(s.name || '').trim().toLowerCase();
  if (KNOWN_SEED_NAMES.has(name)) return true;
  return false;
}

export function sanitizeRealScores(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => !isSeedEntry(item));
}

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
  stats.bestWave = Math.max(stats.bestWave, newEntry.wave || 1);
  stats.highScore = Math.max(stats.highScore, newEntry.score || 0);
  stats.totalTitans += (newEntry.titans || 0);
  stats.totalKills += (newEntry.kills || 0);
  stats.expeditions = (stats.expeditions || 0) + 1;
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
      if (Array.isArray(parsed)) {
        const cleaned = sanitizeRealScores(parsed);
        if (cleaned.length !== parsed.length) {
          saveLocalScores(cleaned);
        }
        return cleaned;
      }
    }
  } catch (_) {}
  return [];
}

export function saveLocalScores(scores) {
  try {
    const cleaned = sanitizeRealScores(scores);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (_) {}
}

export async function fetchLeaderboardScores(cls = 'all') {
  try {
    const query = cls && cls !== 'all' ? `?cls=${cls}` : '';
    const res = await fetch(`/api/leaderboard${query}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const cleaned = sanitizeRealScores(json.data);
        cachedScores = cleaned;
        saveLocalScores(cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('API unreachable, using local storage fallback:', err.message);
  }

  // Resilient real fallback
  const local = getLocalScores();
  cachedScores = local;
  let filtered = [...local];
  if (cls && cls !== 'all') {
    filtered = filtered.filter((s) => s.cls === cls || s.favCls === cls);
  }
  filtered.sort((a, b) => b.score - a.score || b.wave - a.wave || (b.totalKills || 0) - (a.totalKills || 0) || a.time - b.time);
  return filtered;
}

export async function submitScore(entry) {
  const cleanName = (entry.name || '').trim() || getSavedName(entry.cls);
  setSavedName(cleanName);
  updatePlayerStats(entry);

  const cls = entry.cls || 'knight';
  const wave = entry.wave || 1;
  const kills = entry.kills || 0;
  const titans = entry.titans || 0;
  const time = entry.time || 1;
  const score = entry.score || calculateScore(wave, kills, titans, time);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

  const runItem = {
    wave,
    kills,
    titans,
    time,
    score,
    cls,
    date: dateStr,
    timestamp: Date.now(),
  };

  // 1. Identify by player name and aggregate complete player profile in local storage
  const local = getLocalScores();
  const existingIdx = local.findIndex(
    (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
  );

  let fullEntry = null;
  let isNewBest = false;

  if (existingIdx !== -1) {
    const existing = local[existingIdx];
    const prevBestScore = existing.bestScore ?? existing.score ?? 0;
    isNewBest = score >= prevBestScore;

    const bestScore = Math.max(prevBestScore, score);
    const bestWave = Math.max(existing.bestWave ?? existing.wave ?? 1, wave);
    const bestKills = Math.max(existing.bestKills ?? existing.kills ?? 0, kills);
    const bestTitans = Math.max(existing.bestTitans ?? existing.titans ?? 0, titans);

    const expeditions = (existing.expeditions || 1) + 1;
    const totalKills = (existing.totalKills ?? existing.kills ?? 0) + kills;
    const totalTitans = (existing.totalTitans ?? existing.titans ?? 0) + titans;
    const totalTime = (existing.totalTime ?? existing.time ?? 0) + time;

    const classesPlayed = { ...(existing.classesPlayed || {}) };
    classesPlayed[cls] = (classesPlayed[cls] || 0) + 1;

    let favCls = existing.favCls || cls;
    let maxCount = 0;
    for (const [c, cnt] of Object.entries(classesPlayed)) {
      if (cnt > maxCount) {
        maxCount = cnt;
        favCls = c;
      }
    }

    const history = [runItem, ...(existing.history || [])].slice(0, 5);

    fullEntry = {
      ...existing,
      name: existing.name || cleanName,
      cls: isNewBest ? cls : (existing.cls || favCls),
      favCls,
      score: bestScore,
      bestScore,
      wave: bestWave,
      bestWave,
      kills: bestKills,
      bestKills,
      titans: bestTitans,
      bestTitans,
      time: isNewBest ? time : (existing.time || time),
      totalKills,
      totalTitans,
      totalTime,
      expeditions,
      classesPlayed,
      history,
      lastActive: dateStr,
      date: isNewBest ? dateStr : (existing.date || dateStr),
      isUser: true,
      id: existing.id || ('player-' + Date.now()),
    };

    local[existingIdx] = fullEntry;
  } else {
    isNewBest = true;
    fullEntry = {
      id: 'player-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      cls,
      favCls: cls,
      score,
      bestScore: score,
      wave,
      bestWave: wave,
      kills,
      bestKills: kills,
      titans,
      bestTitans: titans,
      time,
      totalKills: kills,
      totalTitans: titans,
      totalTime: time,
      expeditions: 1,
      classesPlayed: { [cls]: 1 },
      history: [runItem],
      lastActive: dateStr,
      date: dateStr,
      isUser: true,
    };
    local.push(fullEntry);
  }

  local.sort((a, b) => b.score - a.score || b.wave - a.wave || (b.totalKills || 0) - (a.totalKills || 0) || a.time - b.time);
  const trimmed = local.slice(0, 100);
  saveLocalScores(trimmed);
  cachedScores = trimmed;

  const localRank = trimmed.findIndex(
    (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
  ) + 1;

  // 2. Attempt Vercel API submission
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, name: cleanName }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return {
          success: true,
          rank: json.rank || localRank,
          entry: json.entry || fullEntry,
          isNewBest: json.isNewBest ?? isNewBest,
          name: cleanName,
        };
      }
    }
  } catch (err) {
    console.warn('Leaderboard API sync failed, recorded locally:', err.message);
  }

  return { success: true, rank: localRank, entry: fullEntry, isNewBest, name: cleanName, offline: true };
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

// Global toggle for player dossier drawer
window.__toggleHocDossier = (idx) => {
  const dossier = document.getElementById(`hoc-dossier-${idx}`);
  const icon = document.getElementById(`hoc-exp-icon-${idx}`);
  if (!dossier) return;
  const isShown = dossier.style.display === 'block';
  dossier.style.display = isShown ? 'none' : 'block';
  if (icon) {
    icon.innerHTML = isShown ? getIcon('chevron_down', 13) : getIcon('chevron_up', 13);
  }
};

export async function renderLeaderboardContent(tab = 'all') {
  const listEl = document.getElementById('hoc-scores-body');
  const statsBestWave = document.getElementById('hoc-stat-best-wave');
  const statsHighScore = document.getElementById('hoc-stat-high-score');
  const statsTitans = document.getElementById('hoc-stat-titans');
  const statsKills = document.getElementById('hoc-stat-kills');

  const activeName = (getSavedName() || '').trim();

  if (listEl) {
    listEl.innerHTML = `
      <div class="hoc-loading">
        <div class="rwo-ring" style="width:36px;height:36px;margin:12px auto;"></div>
        <span>CONSULTING REAL SLAYER CODEX FOR ${activeName.toUpperCase()}...</span>
      </div>
    `;
  }

  const scores = await fetchLeaderboardScores(tab);

  // Update top player summary cards with the real data carried by active player's name
  const playerEntry = scores.find((s) => s.name.trim().toLowerCase() === activeName.toLowerCase());

  if (playerEntry) {
    if (statsBestWave) statsBestWave.textContent = `WAVE ${playerEntry.bestWave || playerEntry.wave}`;
    if (statsHighScore) statsHighScore.textContent = (playerEntry.bestScore || playerEntry.score).toLocaleString();
    if (statsTitans) statsTitans.textContent = `${playerEntry.totalTitans ?? playerEntry.titans} TITANS`;
    if (statsKills) statsKills.textContent = (playerEntry.totalKills || playerEntry.kills).toLocaleString();
  } else {
    if (statsBestWave) statsBestWave.textContent = 'UNRANKED';
    if (statsHighScore) statsHighScore.textContent = '0 PTS';
    if (statsTitans) statsTitans.textContent = '0 TITANS';
    if (statsKills) statsKills.textContent = '0 FOES';
  }

  if (!listEl) return;

  // Real Empty State: When no genuine slayers have ascended yet
  if (!scores.length) {
    listEl.innerHTML = `
      <div class="hoc-empty-state">
        <div class="hoc-empty-icon">${getIcon('trophy', 38)}</div>
        <div class="hoc-empty-title">THE ABYSSAL CODEX AWAITS ITS FIRST SLAYER</div>
        <div class="hoc-empty-desc">
          Every entry in the Hall of Champions is 100% genuine mortal data. No synthetic champions are seeded.<br>
          Descend into the forgotten realms, slay the hordes, and claim Rank #1.
        </div>
        <button class="btn hoc-empty-start-btn" id="hoc-empty-start-btn">COMMENCE EXPEDITION</button>
      </div>
    `;
    const startBtn = document.getElementById('hoc-empty-start-btn');
    if (startBtn) {
      startBtn.onclick = () => {
        closeLeaderboardModal();
        const mainStart = document.getElementById('startbtn');
        if (mainStart) mainStart.click();
      };
    }
    return;
  }

  listEl.innerHTML = scores.map((s, idx) => {
    const rank = idx + 1;
    let rankBadge = `<span class="hoc-rank-num">#${rank}</span>`;
    let rowTier = '';

    if (rank === 1) {
      rankBadge = `<span class="hoc-rank-badge gold">${getIcon('trophy', 15)} 1ST</span>`;
      rowTier = 'tier-gold';
    } else if (rank === 2) {
      rankBadge = `<span class="hoc-rank-badge silver">${getIcon('medal', 15)} 2ND</span>`;
      rowTier = 'tier-silver';
    } else if (rank === 3) {
      rankBadge = `<span class="hoc-rank-badge bronze">${getIcon('medal', 15)} 3RD</span>`;
      rowTier = 'tier-bronze';
    }

    const clsKey = s.favCls || s.cls || 'knight';
    const clsIcon = clsKey === 'mage' ? getIcon('magic', 13) : (clsKey === 'archer' ? getIcon('bow', 13) : getIcon('sword', 13));
    const clsName = clsKey === 'mage' ? 'ASTRAL' : (clsKey === 'archer' ? 'VERDANT' : 'VANGUARD');

    let realmName = 'REALM I · SANCTUM';
    const peakWave = s.bestWave || s.wave || 1;
    if (peakWave > 30) realmName = 'ENDLESS ASCENT';
    else if (peakWave >= 21) realmName = 'REALM III · VOID';
    else if (peakWave >= 11) realmName = 'REALM II · INFERNO';

    // Player Identification: Match by player name!
    const isPlayerMatch = s.name.trim().toLowerCase() === activeName.toLowerCase() || s.isUser;
    const isUserClass = isPlayerMatch ? 'is-user-run' : '';

    const runsCount = s.expeditions || 1;
    const lifetimeKills = (s.totalKills || s.kills || 0).toLocaleString();
    const lifetimeTitans = s.totalTitans ?? s.titans ?? 0;
    const peakScore = (s.bestScore || s.score || 0).toLocaleString();
    const historyList = Array.isArray(s.history) ? s.history : [];

    return `
      <div class="hoc-row-wrap">
        <div class="hoc-row ${rowTier} ${isUserClass}" onclick="window.__toggleHocDossier('${idx}')" title="Click to view ${s.name}'s complete player dossier">
          <div class="hoc-col rank">${rankBadge}</div>
          <div class="hoc-col player">
            <div class="hoc-player-name">
              ${s.name}
              ${isPlayerMatch ? `<span class="hoc-you-badge">YOU</span>` : ''}
            </div>
            <div class="hoc-player-sub">${realmName} · WAVE ${peakWave} · ${runsCount} ${runsCount === 1 ? 'RUN' : 'RUNS'}</div>
          </div>
          <div class="hoc-col cls">
            <span class="hoc-cls-pill cls-${clsKey}">${clsIcon} ${clsName}</span>
          </div>
          <div class="hoc-col stats">
            <span class="hoc-stat-badge" title="Lifetime Monarchs Slain">${getIcon('crown', 12)} ${lifetimeTitans}</span>
            <span class="hoc-stat-badge" title="Lifetime Foes Vanquished">${getIcon('skull', 12)} ${lifetimeKills}</span>
            <span class="hoc-stat-badge time" title="Best Expedition Time">${formatTime(s.time || 0)}</span>
          </div>
          <div class="hoc-col score">
            <span class="hoc-score-val">${peakScore}</span>
            <span class="hoc-score-lbl">PEAK PTS</span>
          </div>
          <div class="hoc-col expand-hint">
            <span class="hoc-exp-icon" id="hoc-exp-icon-${idx}">${getIcon('chevron_down', 13)}</span>
          </div>
        </div>

        <!-- Expandable Player Career Dossier -->
        <div class="hoc-player-dossier" id="hoc-dossier-${idx}" style="display:none">
          <div class="hpd-header">
            <div class="hpd-title-group">
              ${getIcon('dossier', 14)}
              <span class="hpd-title">CHAMPION DOSSIER · ${s.name.toUpperCase()}</span>
            </div>
            <span class="hpd-badge">${runsCount} ${runsCount === 1 ? 'EXPEDITION' : 'EXPEDITIONS'} ARCHIVED</span>
          </div>
          <div class="hpd-grid">
            <div class="hpd-cell">
              <span class="hpd-lbl">PEAK WAVE CONQUERED</span>
              <span class="hpd-val gold">WAVE ${peakWave}</span>
            </div>
            <div class="hpd-cell">
              <span class="hpd-lbl">PEAK EXPEDITION SCORE</span>
              <span class="hpd-val gold">${peakScore} PTS</span>
            </div>
            <div class="hpd-cell">
              <span class="hpd-lbl">LIFETIME FOES VANQUISHED</span>
              <span class="hpd-val">${lifetimeKills}</span>
            </div>
            <div class="hpd-cell">
              <span class="hpd-lbl">MONARCHS SLAIN</span>
              <span class="hpd-val">${lifetimeTitans} TITANS</span>
            </div>
            <div class="hpd-cell">
              <span class="hpd-lbl">FAVORED DISCIPLINE</span>
              <span class="hpd-val">${clsName}</span>
            </div>
            <div class="hpd-cell">
              <span class="hpd-lbl">TOTAL TIME SURVIVED</span>
              <span class="hpd-val">${formatTime(s.totalTime || s.time || 0)}</span>
            </div>
          </div>

          ${historyList.length > 0 ? `
            <div class="hpd-history-box">
              <div class="hpd-history-hdr">RECENT EXPEDITIONS CARRIED BY THIS SLAYER</div>
              <div class="hpd-history-list">
                ${historyList.map((h, hIdx) => `
                  <div class="hpd-history-row">
                    <span class="hpd-h-tag">RUN #${historyList.length - hIdx}</span>
                    <span class="hpd-h-wave">WAVE ${h.wave}</span>
                    <span class="hpd-h-cls">${(h.cls || 'knight').toUpperCase()}</span>
                    <span class="hpd-h-stat">${getIcon('skull', 11)} ${h.kills || 0}</span>
                    <span class="hpd-h-stat">${getIcon('crown', 11)} ${h.titans || 0}</span>
                    <span class="hpd-h-score">${(h.score || 0).toLocaleString()} PTS</span>
                    <span class="hpd-h-date">${h.date || ''}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
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
