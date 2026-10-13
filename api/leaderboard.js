// api/leaderboard.js — Vercel Serverless Function for Voxel Souls Leaderboard
// Supports Vercel KV / Upstash Redis REST if configured, with resilient global in-memory fallback.

const SEEDED_CHAMPIONS = [
  { id: 'seed-1', name: 'Aurelius Dawnshield', cls: 'knight', wave: 42, score: 68420, kills: 184, titans: 3, time: 845, date: '2026-10-12', isSeed: true },
  { id: 'seed-2', name: 'Zili Voidwalker', cls: 'mage', wave: 38, score: 61200, kills: 192, titans: 3, time: 780, date: '2026-10-12', isSeed: true },
  { id: 'seed-3', name: 'Kael Shadowstride', cls: 'archer', wave: 35, score: 55800, kills: 165, titans: 3, time: 710, date: '2026-10-11', isSeed: true },
  { id: 'seed-4', name: 'Seraphina Sunfire', cls: 'mage', wave: 31, score: 49100, kills: 144, titans: 3, time: 640, date: '2026-10-11', isSeed: true },
  { id: 'seed-5', name: 'Lord Malakor', cls: 'knight', wave: 27, score: 41900, kills: 128, titans: 2, time: 580, date: '2026-10-10', isSeed: true },
  { id: 'seed-6', name: 'Sylas Windrunner', cls: 'archer', wave: 24, score: 36500, kills: 112, titans: 2, time: 520, date: '2026-10-10', isSeed: true },
  { id: 'seed-7', name: 'Ignis Emberheart', cls: 'mage', wave: 21, score: 32400, kills: 98, titans: 2, time: 460, date: '2026-10-09', isSeed: true },
  { id: 'seed-8', name: 'Valerius Bulwark', cls: 'knight', wave: 19, score: 28600, kills: 86, titans: 1, time: 410, date: '2026-10-09', isSeed: true },
  { id: 'seed-9', name: 'Lyra Nightbloom', cls: 'archer', wave: 15, score: 22900, kills: 74, titans: 1, time: 340, date: '2026-10-08', isSeed: true },
  { id: 'seed-10', name: 'Torin the Initiate', cls: 'knight', wave: 11, score: 17400, kills: 56, titans: 1, time: 260, date: '2026-10-08', isSeed: true },
];

if (!globalThis.__LBS_LEADERBOARD) {
  globalThis.__LBS_LEADERBOARD = [...SEEDED_CHAMPIONS];
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
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      }
    } catch (e) {
      console.warn('KV fetch error, falling back to memory:', e.message);
    }
  }

  return globalThis.__LBS_LEADERBOARD;
}

async function saveStoredScores(scores) {
  globalThis.__LBS_LEADERBOARD = scores;

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
        body: JSON.stringify(JSON.stringify(scores)),
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
        filtered = filtered.filter((s) => s.cls === filterCls);
      }

      // Sort: highest score first, then highest wave, then lowest time
      filtered.sort((a, b) => b.score - a.score || b.wave - a.wave || a.time - b.time);
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

      const newEntry = {
        id: 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        name,
        cls,
        wave,
        kills,
        titans,
        time,
        score,
        date: new Date().toISOString().slice(0, 10),
        isUser: true,
      };

      const currentScores = await getStoredScores();
      const existingIndex = currentScores.findIndex(
        (s) => s.name.trim().toLowerCase() === name.toLowerCase()
      );

      let recordedEntry = newEntry;
      let isNewBest = true;

      if (existingIndex !== -1) {
        const existing = currentScores[existingIndex];
        if (score >= existing.score) {
          // New Personal Best for this player
          recordedEntry = {
            ...existing,
            ...newEntry,
            id: existing.id || newEntry.id,
          };
          currentScores[existingIndex] = recordedEntry;
        } else {
          // Existing record is higher, preserve their highest achievement
          recordedEntry = existing;
          isNewBest = false;
        }
      } else {
        currentScores.push(newEntry);
      }

      currentScores.sort((a, b) => b.score - a.score || b.wave - a.wave || a.time - b.time);
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
