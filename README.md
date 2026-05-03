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
- In-browser backend simulation with:
  - server metrics ingestion (CPU/RAM/players/state),
  - websocket-like streams for console + queue + metrics,
  - historical timeseries query API for charting,
  - notification center events (provisioning/reward/abuse/system),
  - backup/file/plugin/mod management API surfaces.

## Mock API surface

Open the site and use `window.blockPulseApi` from DevTools:

- `blockPulseApi.metrics.ingest(payload)` / `blockPulseApi.metrics.query(metric, options)`
- `blockPulseApi.streams.subscribeConsole(callback)` / `subscribeQueue` / `subscribeMetrics`
- `blockPulseApi.notifications.create(...)` / `list(...)`
- `blockPulseApi.backupManager.createBackup(reason)` / `listBackups()`
- `blockPulseApi.artifacts.files()` / `plugins()` / `mods()`

## Run locally

Open `index.html` in your browser.
