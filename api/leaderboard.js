// api/leaderboard.js — Vercel Serverless Function for Voxel Souls Leaderboard
// Pure Real-Player Codex (No synthetic/mock seeds).
// Supports Vercel KV / Upstash Redis REST if configured, with resilient global in-memory fallback.

const KNOWN_SEED_NAMES = new Set([
  'aurelius dawnshield', 'zili voidwalker', 'kael shadowstride',
  'seraphina sunfire', 'lord malakor', 'sylas windrunner',
  'ignis emberheart', 'valerius bulwark', 'lyra nightbloom', 'torin the initiate'
]);

function isSeedEntry(s) {
  if (!s || typeof s !== 'object') return true;
  if (s.isSeed === true) return true;
  if (typeof s.id === 'string' && s.id.startsWith('seed-')) return true;
  const name = String(s.name || '').trim().toLowerCase();
  if (KNOWN_SEED_NAMES.has(name)) return true;
  return false;
}

function sanitizeRealScores(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => !isSeedEntry(item));
}

if (!globalThis.__LBS_LEADERBOARD) {
  globalThis.__LBS_LEADERBOARD = [];
}

async function getStoredScores() {
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const res = await fetch(`${kvUrl}/get/lbs_leaderboard`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          const parsed = JSON.parse(json.result);
          if (Array.isArray(parsed)) {
            const cleaned = sanitizeRealScores(parsed);
            // If KV had old mock seeds, purge them permanently by saving the cleaned real list back
            if (cleaned.length !== parsed.length) {
              await saveStoredScores(cleaned);
            }
            return cleaned;
          }
        }
      }
    } catch (e) {
      console.warn('KV fetch error, falling back to memory:', e.message);
    }
  }

  globalThis.__LBS_LEADERBOARD = sanitizeRealScores(globalThis.__LBS_LEADERBOARD);
  return globalThis.__LBS_LEADERBOARD;
}

async function saveStoredScores(scores) {
  globalThis.__LBS_LEADERBOARD = sanitizeRealScores(scores);

  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/set/lbs_leaderboard`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(globalThis.__LBS_LEADERBOARD)),
      });
    } catch (e) {
      console.warn('KV save error:', e.message);
    }
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const scores = await getStoredScores();
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const filterCls = url.searchParams.get('cls');
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

      let filtered = [...scores];
      if (filterCls && filterCls !== 'all') {
        filtered = filtered.filter((s) => s.cls === filterCls || s.favCls === filterCls);
      }

      // Sort: highest score first, then highest wave, then total kills, then lowest time
      filtered.sort((a, b) => b.score - a.score || b.wave - a.wave || (b.totalKills || 0) - (a.totalKills || 0) || a.time - b.time);
      filtered = filtered.slice(0, limit);

      return res.status(200).json({
        success: true,
        count: filtered.length,
        total: scores.length,
        data: filtered,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) {}
      }

      if (!body) {
        return res.status(400).json({ success: false, error: 'Missing request body' });
      }

      const name = String(body.name || 'Anonymous Slayer').trim().slice(0, 24).replace(/[<>]/g, '');
      const cls = ['knight', 'mage', 'archer'].includes(body.cls) ? body.cls : 'knight';
      const wave = Math.max(1, parseInt(body.wave || '1', 10));
      const kills = Math.max(0, parseInt(body.kills || '0', 10));
      const titans = Math.max(0, parseInt(body.titans || '0', 10));
      const time = Math.max(1, parseInt(body.time || '1', 10));

      // Calculate or verify score
      const calcScore = (wave * 1200) + (kills * 65) + (titans * 5000) + Math.min(3000, Math.floor(time * 5));
      const score = Math.max(calcScore, parseInt(body.score || '0', 10));

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

      const currentScores = await getStoredScores();
      const existingIndex = currentScores.findIndex(
        (s) => s.name.trim().toLowerCase() === name.toLowerCase()
      );

      let recordedEntry = null;
      let isNewBest = false;

      if (existingIndex !== -1) {
        const existing = currentScores[existingIndex];
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

        // Calculate favored class
        let favCls = existing.favCls || cls;
        let maxCount = 0;
        for (const [c, cnt] of Object.entries(classesPlayed)) {
          if (cnt > maxCount) {
            maxCount = cnt;
            favCls = c;
          }
        }

        const history = [runItem, ...(existing.history || [])].slice(0, 5);

        recordedEntry = {
          ...existing,
          name: existing.name || name,
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

        currentScores[existingIndex] = recordedEntry;
      } else {
        isNewBest = true;
        recordedEntry = {
          id: 'player-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name,
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
        currentScores.push(recordedEntry);
      }

      currentScores.sort((a, b) => b.score - a.score || b.wave - a.wave || (b.totalKills || 0) - (a.totalKills || 0) || a.time - b.time);
      const trimmed = currentScores.slice(0, 100);

      await saveStoredScores(trimmed);

      const rank = trimmed.findIndex((s) => s.name.trim().toLowerCase() === name.toLowerCase()) + 1;

      return res.status(201).json({
        success: true,
        rank: rank > 0 ? rank : null,
        entry: recordedEntry,
        isNewBest,
        message: isNewBest ? `New personal best recorded for ${name}!` : `Existing best preserved for ${name}`,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
