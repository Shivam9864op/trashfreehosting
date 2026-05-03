# BlockPulse — AI Powered Free Minecraft Hosting

Futuristic Gen-Z style landing page and dashboard concept for an AI-powered free
Minecraft hosting platform. The experience is designed to feel premium,
community-driven, and instantly addictive with neon cyberpunk aesthetics.

## What's included

- Modern hero section with AI setup messaging and animated server cards
- Dashboard preview with glassmorphism panels and glowing stats
- Boost Coins reward system and anti-abuse highlights
- Premium plan layout and community discovery sections
- Responsive, mobile-friendly layout with animated particles

## Run locally

Open `index.html` in your browser.

## Mini-game module + reward gateway

### Frontend module
- `frontend/minigame/client.js` implements an endless runner/shooter loop with:
  - auto-forward progression speed
  - left/right movement and space-to-shoot
  - wave spawning, pickups, score, and score multiplier decay
  - run summary emission with detailed action telemetry

### Backend gateway
- `backend/minigameGateway.js` provides:
  - `POST /api/minigame/session` for signed session token issuance
  - `POST /api/minigame/run-summary` for anti-tamper validation and reward payout
  - `GET /api/minigame/leaderboard` for season-windowed leaderboard with anti-cheat filters

Validation checks include score sanity ceilings, run duration bounds, and action frequency thresholds.
Rewards include coins/XP/temporary boosts with daily caps.

Run backend locally:

```bash
cd backend
npm install
npm start
```
