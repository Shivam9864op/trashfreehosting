const DEFAULT_API_BASE = "/api/minigame";

export class MiniGameClient {
  constructor({ canvas, apiBase = DEFAULT_API_BASE } = {}) {
    if (!canvas) throw new Error("MiniGameClient requires a canvas element");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.apiBase = apiBase;
    this.player = { x: canvas.width / 2, y: canvas.height - 60, speed: 260, radius: 12 };
    this.session = null;
    this.keys = new Set();
    this.enemies = [];
    this.pickups = [];
    this.bullets = [];
    this.wave = 1;
    this.score = 0;
    this.multiplier = 1;
    this.multiplierDecayTimer = 0;
    this.actions = [];
    this.running = false;
    this.startTs = 0;
    this.lastSpawnTs = 0;
    this.lastFrameTs = 0;
  }

  async start(playerId = "guest") {
    this.session = await this.#createSession(playerId);
    this.running = true;
    this.startTs = performance.now();
    this.lastFrameTs = this.startTs;
    this.#bindInput();
    requestAnimationFrame((ts) => this.#loop(ts));
  }

  async stop() {
    this.running = false;
    const durationMs = Math.floor(performance.now() - this.startTs);
    const summary = {
      sessionToken: this.session?.token,
      score: Math.round(this.score),
      waveReached: this.wave,
      pickupsCollected: this.actions.filter((a) => a.type === "pickup").length,
      shotsFired: this.actions.filter((a) => a.type === "shoot").length,
      enemiesDefeated: this.actions.filter((a) => a.type === "defeat").length,
      durationMs,
      actions: this.actions,
    };
    return this.#submitSummary(summary);
  }

  async #createSession(playerId) {
    const response = await fetch(`${this.apiBase}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!response.ok) throw new Error("Failed to create game session");
    return response.json();
  }

  async #submitSummary(summary) {
    const response = await fetch(`${this.apiBase}/run-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
    });
    if (!response.ok) throw new Error("Run summary rejected");
    return response.json();
  }

  #bindInput() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space") this.#shoot();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  #shoot() {
    this.bullets.push({ x: this.player.x, y: this.player.y - 14, speed: 380 });
    this.actions.push({ type: "shoot", ts: Date.now() });
  }

  #spawnWave(now) {
    const interval = Math.max(420, 1400 - this.wave * 80);
    if (now - this.lastSpawnTs < interval) return;
    this.lastSpawnTs = now;
    const count = Math.min(2 + Math.floor(this.wave / 2), 8);
    for (let i = 0; i < count; i += 1) {
      this.enemies.push({
        x: 20 + Math.random() * (this.canvas.width - 40),
        y: -20 - Math.random() * 180,
        speed: 90 + this.wave * 12,
        hp: 1 + Math.floor(this.wave / 4),
      });
    }
    if (Math.random() > 0.65) {
      this.pickups.push({ x: 20 + Math.random() * (this.canvas.width - 40), y: -20, speed: 110 });
    }
  }

  #loop(ts) {
    if (!this.running) return;
    const dt = (ts - this.lastFrameTs) / 1000;
    this.lastFrameTs = ts;
    this.#update(dt, ts);
    this.#render();
    requestAnimationFrame((nextTs) => this.#loop(nextTs));
  }

  #update(dt, now) {
    const forwardSpeed = 120 + this.wave * 4;
    if (this.keys.has("ArrowLeft")) this.player.x -= this.player.speed * dt;
    if (this.keys.has("ArrowRight")) this.player.x += this.player.speed * dt;
    this.player.x = Math.min(this.canvas.width - this.player.radius, Math.max(this.player.radius, this.player.x));

    this.#spawnWave(now);

    this.enemies.forEach((e) => (e.y += (e.speed + forwardSpeed) * dt));
    this.pickups.forEach((p) => (p.y += (p.speed + forwardSpeed * 0.8) * dt));
    this.bullets.forEach((b) => (b.y -= b.speed * dt));

    this.bullets = this.bullets.filter((b) => b.y > -15);
    this.enemies = this.enemies.filter((e) => e.y < this.canvas.height + 20);
    this.pickups = this.pickups.filter((p) => p.y < this.canvas.height + 20);

    this.#resolveCollisions();

    this.multiplierDecayTimer += dt;
    if (this.multiplierDecayTimer > 4.5) this.multiplier = Math.max(1, this.multiplier - 0.2);
    this.wave = 1 + Math.floor((now - this.startTs) / 10000);
    this.score += dt * (2 + this.wave * this.multiplier);
  }

  #resolveCollisions() {
    this.bullets.forEach((b) => {
      this.enemies.forEach((e) => {
        const hit = Math.hypot(b.x - e.x, b.y - e.y) < 14;
        if (!hit) return;
        e.hp -= 1;
        b.y = -100;
        if (e.hp <= 0) {
          e.y = this.canvas.height + 999;
          this.multiplier = Math.min(6, this.multiplier + 0.35);
          this.multiplierDecayTimer = 0;
          const points = 30 * this.multiplier;
          this.score += points;
          this.actions.push({ type: "defeat", points, ts: Date.now() });
        }
      });
    });

    this.pickups.forEach((p) => {
      const hit = Math.hypot(p.x - this.player.x, p.y - this.player.y) < 20;
      if (!hit) return;
      p.y = this.canvas.height + 999;
      this.multiplier = Math.min(8, this.multiplier + 0.6);
      this.score += 60 * this.multiplier;
      this.actions.push({ type: "pickup", ts: Date.now() });
    });
  }

  #render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#07080f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#2ce5b5";
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff5d7d";
    this.enemies.forEach((e) => ctx.fillRect(e.x - 10, e.y - 10, 20, 20));

    ctx.fillStyle = "#f4ee6b";
    this.pickups.forEach((p) => ctx.fillRect(p.x - 6, p.y - 6, 12, 12));

    ctx.fillStyle = "#8ecaff";
    this.bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 8, 4, 12));

    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.fillText(`Score: ${Math.round(this.score)}`, 8, 18);
    ctx.fillText(`Wave: ${this.wave}`, 8, 36);
    ctx.fillText(`x${this.multiplier.toFixed(1)}`, 8, 54);
  }
}
