const crypto = require('crypto');
const express = require('express');

const router = express.Router();
const SECRET = process.env.MINIGAME_SECRET || 'dev-secret-change';
const SEASON_LENGTH_DAYS = 30;
const DAILY_CAPS = { coins: 1200, xp: 3000, boosts: 3 };

const sessions = new Map();
const playerDaily = new Map();
const leaderboard = [];

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}

function getSeasonWindow(referenceTs = Date.now()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const seasonMs = SEASON_LENGTH_DAYS * dayMs;
  const seasonIndex = Math.floor(referenceTs / seasonMs);
  const start = seasonIndex * seasonMs;
  return { start, end: start + seasonMs };
}

function scoreSanity(summary) {
  const expectedMax = summary.durationMs * 0.6 + summary.enemiesDefeated * 500 + summary.pickupsCollected * 300;
  return summary.score <= expectedMax;
}

function durationBounds(summary) { return summary.durationMs >= 15000 && summary.durationMs <= 30 * 60 * 1000; }

function actionFrequencyCheck(summary) {
  const actionsPerSecond = summary.actions.length / Math.max(summary.durationMs / 1000, 1);
  return actionsPerSecond <= 15 && summary.shotsFired <= summary.actions.length;
}

function computeRewards(score) {
  if (score >= 12000) return { coins: 450, xp: 1200, boostHours: 2 };
  if (score >= 7000) return { coins: 250, xp: 700, boostHours: 1 };
  if (score >= 3000) return { coins: 120, xp: 350, boostHours: 0 };
  return { coins: 40, xp: 120, boostHours: 0 };
}

router.post('/session', (req, res) => {
  const playerId = String(req.body.playerId || 'guest');
  const sessionId = crypto.randomUUID();
  const issuedAt = Date.now();
  const payload = { sessionId, playerId, issuedAt, expiresAt: issuedAt + 10 * 60 * 1000 };
  const token = signSession(payload);
  sessions.set(sessionId, { ...payload, used: false });
  res.json({ token, sessionId, expiresAt: payload.expiresAt });
});

router.post('/run-summary', (req, res) => {
  const summary = req.body;
  const decoded = verifySession(summary.sessionToken || '');
  if (!decoded) return res.status(401).json({ error: 'invalid_session_token' });
  const active = sessions.get(decoded.sessionId);
  if (!active || active.used || Date.now() > active.expiresAt) return res.status(400).json({ error: 'expired_or_used_session' });

  const valid = scoreSanity(summary) && durationBounds(summary) && actionFrequencyCheck(summary);
  if (!valid) return res.status(422).json({ error: 'anti_tamper_validation_failed' });

  active.used = true;
  const reward = computeRewards(summary.score);
  const dailyKey = `${decoded.playerId}:${new Date().toISOString().slice(0, 10)}`;
  const daily = playerDaily.get(dailyKey) || { coins: 0, xp: 0, boosts: 0 };
  const finalReward = {
    coins: Math.max(0, Math.min(reward.coins, DAILY_CAPS.coins - daily.coins)),
    xp: Math.max(0, Math.min(reward.xp, DAILY_CAPS.xp - daily.xp)),
    boostHours: daily.boosts < DAILY_CAPS.boosts ? reward.boostHours : 0,
  };

  daily.coins += finalReward.coins;
  daily.xp += finalReward.xp;
  daily.boosts += finalReward.boostHours > 0 ? 1 : 0;
  playerDaily.set(dailyKey, daily);

  const season = getSeasonWindow();
  leaderboard.push({
    playerId: decoded.playerId,
    score: summary.score,
    at: Date.now(),
    seasonStart: season.start,
    cheatFlags: [],
  });

  return res.json({ ok: true, reward: finalReward, capsRemaining: { coins: DAILY_CAPS.coins - daily.coins, xp: DAILY_CAPS.xp - daily.xp } });
});

router.get('/leaderboard', (req, res) => {
  const now = Date.now();
  const season = getSeasonWindow(now);
  const minDuration = Number(req.query.minDurationMs || 30000);
  const rows = leaderboard
    .filter((entry) => entry.seasonStart === season.start)
    .filter((entry) => !entry.cheatFlags.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((entry, index) => ({ rank: index + 1, playerId: entry.playerId, score: entry.score, at: entry.at, minDuration }));
  res.json({ seasonStart: season.start, seasonEnd: season.end, entries: rows });
});

module.exports = { minigameRouter: router, getSeasonWindow };
