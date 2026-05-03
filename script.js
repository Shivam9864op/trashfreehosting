const DISCORD_INVITE = "https://discord.gg/blockpulse";
const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const SECTION_VISIBILITY_THRESHOLD = 0.6;
const AUDIO_INITIAL_GAIN = 0.0001;
const AUDIO_PEAK_GAIN = 0.06;
const AUDIO_ATTACK_TIME = 0.01;
const AUDIO_RELEASE_TIME = 0.2;
const QUEUE_ADVANCE_PROBABILITY = 0.6;
const QUEUE_POSITION_DECREMENT = 1;
const QUEUE_LOADING_DELAY = 1200;
const PROVISION_STEP_DELAY = 1200;
const BASE_COIN_AMOUNT = 1060;
const REWARD_EVENT_WINDOW_MS = 20000;
const DAILY_WINDOW_MS = 86400000;
const SESSION_WINDOW_MS = 60000;
const REWARD_SOURCES = {
  dailyClaim: { coins: 180, xp: 120, cooldownMs: 2 * 60 * 60 * 1000, dailyCap: 8 },
  adWatch: { coins: 65, xp: 45, cooldownMs: 10 * 60 * 1000, dailyCap: 12 },
};

const REWARD_COOLDOWN_SECONDS = 45;

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

const financialAuditLog = [];

const createAuditService = () => ({
  log(entry) {
    const record = {
      id: createId("txn"),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    financialAuditLog.push(record);
    return record;
  },
});

const auditService = createAuditService();

const createAdsService = ({ audit }) => {
  const completions = new Map();
  const suspiciousUsers = new Set();
  return {
    verifyRewardWatch({ userId, progress, completedAt }) {
      const now = completedAt || Date.now();
      const previous = completions.get(userId);
      const cooldownBreached = previous && now - previous < REWARD_COOLDOWN_SECONDS * 1000;
      const valid = progress >= 100 && !cooldownBreached;
      if (!valid) suspiciousUsers.add(userId);
      if (valid) completions.set(userId, now);
      return { valid, cooldownBreached, flagged: suspiciousUsers.has(userId) };
    },
    payoutReward({ userId, rewardType, amount }) {
      audit.log({
        service: "adsService",
        type: "ad_reward_payout",
        userId,
        rewardType,
        amount,
        direction: "credit",
      });
    },
  };
};

const createBillingService = ({ audit }) => {
  const subscriptions = new Map();
  const entitlements = new Map();
  return {
    subscribe({ userId, tier = "premium", autoRenew = true }) {
      subscriptions.set(userId, { tier, active: true, autoRenew, renewedAt: Date.now() });
      entitlements.set(userId, { premiumBoost: true, queueSkip: true });
      audit.log({ service: "billingService", type: "subscription_start", userId, tier, direction: "credit" });
    },
    renew(userId) {
      const sub = subscriptions.get(userId);
      if (!sub || !sub.active || !sub.autoRenew) return false;
      sub.renewedAt = Date.now();
      audit.log({ service: "billingService", type: "subscription_renewal", userId, tier: sub.tier, direction: "credit" });
      return true;
    },
    cancel(userId) {
      const sub = subscriptions.get(userId);
      if (!sub) return;
      sub.active = false;
      entitlements.set(userId, { premiumBoost: false, queueSkip: false });
      audit.log({ service: "billingService", type: "subscription_cancel", userId, tier: sub.tier, direction: "debit" });
    },
    hasEntitlement(userId, key) {
      return Boolean(entitlements.get(userId)?.[key]);
    },
  };
};

const createCommerceService = ({ audit }) => {
  const inventory = new Map();
  const refunded = new Set();
  return {
    purchaseCosmetic({ userId, sku, price, kind }) {
      const userInventory = inventory.get(userId) || [];
      userInventory.push({ sku, kind, purchasedAt: Date.now() });
      inventory.set(userId, userInventory);
      audit.log({ service: "commerceService", type: "purchase", userId, sku, price, direction: "debit" });
      return true;
    },
    processRefund({ userId, txnId }) {
      if (refunded.has(txnId)) {
        audit.log({ service: "commerceService", type: "refund_fraud_flag", userId, txnId, direction: "none" });
        return { ok: false, reason: "duplicate_refund_attempt" };
      }
      refunded.add(txnId);
      audit.log({ service: "commerceService", type: "refund", userId, txnId, direction: "credit" });
      return { ok: true };
    },
  };
};

const createQueueService = ({ billing }) => {
  const sponsoredInventory = [
    { id: "sponsor-1", label: "Lunar Shields", impressions: 0 },
    { id: "sponsor-2", label: "NetherVPN", impressions: 0 },
    { id: "sponsor-3", label: "Pixel Crates", impressions: 0 },
  ];
  let pointer = 0;
  return {
    canBypassQueue(userId) {
      return billing.hasEntitlement(userId, "queueSkip");
    },
    canUsePremiumBoost(userId) {
      return billing.hasEntitlement(userId, "premiumBoost");
    },
    getNextSponsoredListing() {
      const listing = sponsoredInventory[pointer % sponsoredInventory.length];
      listing.impressions += 1;
      pointer += 1;
      return listing;
    },
  };
};

const state = {
  userId: "demo-user-001",
  wizard: {
    step: 1,
    edition: "Java",
    type: "SMP",
    ram: 4,
    provisioning: false,
  },
  soundEnabled: true,
  motionEnabled: true,
  notificationsEnabled: true,
  carouselIndex: 0,
  queue: {
    position: 18,
    total: 62,
    waitSeconds: 272,
    elapsedSeconds: 45,
  },
  reward: {
    streak: 4,
    coins: 180,
    xp: 720,
    xpMax: 1000,
  },
  abuse: {
    tokenBindings: new Map(),
    ip: "198.51.100.42",
    accountId: "acct_demo_001",
    deviceId: "device_web_neon",
    sessionFingerprint: "",
    abuseFlags: [],
    seenClaims: new Set(),
    rewardStats: {},
    rateLimits: {},
    recentClaims: [],
    accountClusters: new Map(),
    riskScore: 0,
  },
};

const createAntiAbuseModule = () => {
  const abusePanel = qs("[data-abuse-flags]");
  const riskBadge = qs("[data-risk-score]");
  const redisLikeStore = new Map();
  const randomToken = () => crypto.randomUUID();
  const now = () => Date.now();

  const getFingerprint = () =>
    btoa(
      [navigator.userAgent, navigator.language, screen.width, screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join("|")
    );

  const pushAbuseFlag = (type, severity, details) => {
    const event = { id: randomToken(), type, severity, details, at: new Date().toISOString() };
    state.abuse.abuseFlags.unshift(event);
    localStorage.setItem("abuse_flags", JSON.stringify(state.abuse.abuseFlags.slice(0, 50)));
    renderAbuseFlags();
  };

  const keyFor = (scope, id) => `ratelimit:${scope}:${id}`;
  const consumeRateLimit = (scope, id, max, windowMs) => {
    const key = keyFor(scope, id);
    const history = redisLikeStore.get(key) || [];
    const valid = history.filter((ts) => now() - ts < windowMs);
    if (valid.length >= max) {
      pushAbuseFlag("rate_limit_exceeded", "medium", `${scope}:${id} exceeded ${max}/${windowMs}ms`);
      redisLikeStore.set(key, valid);
      return false;
    }
    valid.push(now());
    redisLikeStore.set(key, valid);
    return true;
  };

  const issueCaptcha = () => {
    const token = randomToken();
    state.abuse.captcha = { token, answer: "human", expiresAt: now() + 90000 };
    return token;
  };

  const verifyCaptcha = (response, token) => {
    const challenge = state.abuse.captcha;
    const valid =
      challenge &&
      challenge.token === token &&
      challenge.expiresAt > now() &&
      String(response || "").toLowerCase().trim() === challenge.answer;
    if (!valid) pushAbuseFlag("captcha_failed", "high", "Captcha verification failed");
    return valid;
  };

  const bindSession = () => {
    state.abuse.sessionFingerprint = getFingerprint();
    state.abuse.tokenBindings.set("session_token", state.abuse.sessionFingerprint);
  };

  const verifySessionTokenBinding = (token = "session_token") => {
    const expected = state.abuse.tokenBindings.get(token);
    const matches = expected && expected === getFingerprint();
    if (!matches) pushAbuseFlag("token_binding_mismatch", "high", `Token ${token} failed fingerprint check`);
    return matches;
  };

  const checkCooldownAndDailyCap = (source) => {
    const sourceRule = REWARD_SOURCES[source];
    if (!sourceRule) return false;
    const stats = state.abuse.rewardStats[source] || { lastClaimAt: 0, claims: [] };
    const claims = stats.claims.filter((ts) => now() - ts < DAILY_WINDOW_MS);
    if (claims.length >= sourceRule.dailyCap) {
      pushAbuseFlag("daily_cap_reached", "low", `${source} cap reached`);
      return false;
    }
    if (stats.lastClaimAt && now() - stats.lastClaimAt < sourceRule.cooldownMs) {
      pushAbuseFlag("cooldown_active", "low", `${source} cooldown in effect`);
      return false;
    }
    return true;
  };

  const scoreAnomaly = () => {
    const recent = state.abuse.recentClaims.filter((c) => now() - c.at < SESSION_WINDOW_MS);
    let score = 0;
    if (recent.length > 4) score += 30;
    const accountLinks = Array.from(state.abuse.accountClusters.values()).filter((v) => v.deviceId === state.abuse.deviceId);
    if (accountLinks.length > 2) score += 35;
    const impossibleTiming = recent.some((entry, i) => i > 0 && entry.at - recent[i - 1].at < 500);
    if (impossibleTiming) score += 45;
    state.abuse.riskScore = Math.min(100, score);
    if (score >= 60) pushAbuseFlag("anomaly_detected", "high", `Heuristic risk score: ${score}`);
    renderAbuseFlags();
    return score;
  };

  const claimReward = ({ claimId, source, captchaResponse, captchaToken }) => {
    if (state.abuse.seenClaims.has(claimId)) {
      pushAbuseFlag("replay_detected", "high", `Duplicate claim id ${claimId}`);
      return { ok: false, reason: "replay_detected" };
    }
    const rateOk =
      consumeRateLimit("ip", state.abuse.ip, 8, SESSION_WINDOW_MS) &&
      consumeRateLimit("account", state.abuse.accountId, 6, SESSION_WINDOW_MS) &&
      consumeRateLimit("device", state.abuse.deviceId, 6, SESSION_WINDOW_MS);
    if (!rateOk) return { ok: false, reason: "rate_limited" };
    if (!verifySessionTokenBinding()) return { ok: false, reason: "token_binding_failed" };
    const riskScore = scoreAnomaly();
    if (riskScore >= 40) {
      if (!verifyCaptcha(captchaResponse, captchaToken)) return { ok: false, reason: "captcha_required" };
    }
    if (!checkCooldownAndDailyCap(source)) return { ok: false, reason: "cooldown_or_cap" };

    const rule = REWARD_SOURCES[source];
    state.abuse.seenClaims.add(claimId);
    const stats = state.abuse.rewardStats[source] || { claims: [] };
    stats.lastClaimAt = now();
    stats.claims = [...(stats.claims || []), now()];
    state.abuse.rewardStats[source] = stats;
    state.abuse.recentClaims.push({ claimId, source, at: now() });
    state.reward.streak += 1;
    state.reward.coins += rule.coins;
    state.reward.xp = Math.min(state.reward.xpMax, state.reward.xp + rule.xp);
    return { ok: true };
  };

  const renderAbuseFlags = () => {
    if (riskBadge) riskBadge.textContent = `${state.abuse.riskScore}`;
    if (!abusePanel) return;
    abusePanel.innerHTML = "";
    state.abuse.abuseFlags.slice(0, 12).forEach((flag) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${flag.type}</strong> <span class=\"muted\">(${flag.severity})</span><br><span class=\"muted mono\">${flag.at}</span><p>${flag.details}</p>`;
      abusePanel.appendChild(li);
    });
  };

  const seedFromStorage = () => {
    const stored = localStorage.getItem("abuse_flags");
    if (stored) state.abuse.abuseFlags = JSON.parse(stored);
  };

  seedFromStorage();
  bindSession();
  state.abuse.accountClusters.set("acct_demo_001", { deviceId: "device_web_neon" });
  state.abuse.accountClusters.set("acct_demo_002", { deviceId: "device_web_neon" });
  renderAbuseFlags();
  return { claimReward, issueCaptcha, renderAbuseFlags };
};

const adsService = createAdsService({ audit: auditService });
const billingService = createBillingService({ audit: auditService });
const commerceService = createCommerceService({ audit: auditService });
const queueService = createQueueService({ billing: billingService });
billingService.subscribe({ userId: state.userId, tier: "premium" });

const particleContainer = qs("#particles");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const createParticles = () => {
  if (!particleContainer) return;
  particleContainer.innerHTML = "";
  const count = Math.min(50, Math.floor(window.innerWidth / 25));
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    const size = Math.random() * 6 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 120}%`;
    particle.style.animationDuration = `${8 + Math.random() * 10}s`;
    particle.style.animationDelay = `${Math.random() * -10}s`;
    particleContainer.appendChild(particle);
  }
};

const animateValue = (element, target, duration = 1200) => {
  if (!element) return;
  const start = Number(element.textContent.replace(/[^0-9.-]/g, "")) || 0;
  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.floor(start + (target - start) * progress);
    element.textContent = value.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const animateCounters = () => {
  qsa("[data-count]").forEach((counter) => {
    const target = Number(counter.dataset.count || 0);
    animateValue(counter, target);
  });
  qsa("[data-score]").forEach((score) => {
    const target = Number(score.dataset.score || 0);
    animateValue(score, target);
  });
};

const showToast = (message) => {
  const container = qs(".toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, 2600);
};

const setBodyMotion = () => {
  document.body.classList.toggle("motion-off", !state.motionEnabled || prefersReducedMotion);
};

const getAudioContext = () => {
  if (state.audioContext !== undefined) return state.audioContext;
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (error) {
    state.audioContext = null;
    state.soundEnabled = false;
  }
  return state.audioContext;
};

const playClickSound = () => {
  if (!state.soundEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = 420;
  gain.gain.value = AUDIO_INITIAL_GAIN;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(AUDIO_PEAK_GAIN, context.currentTime + AUDIO_ATTACK_TIME);
  gain.gain.exponentialRampToValueAtTime(
    AUDIO_INITIAL_GAIN,
    context.currentTime + AUDIO_RELEASE_TIME
  );
  oscillator.stop(context.currentTime + AUDIO_RELEASE_TIME + 0.05);
};

const openModal = (id) => {
  const modal = qs(`#${id}`);
  if (!modal) return;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
};

const scrollToTarget = (target) => {
  const element = qs(target);
  if (!element) return;
  element.scrollIntoView({ behavior: state.motionEnabled && !prefersReducedMotion ? "smooth" : "auto" });
};

const setupNavigation = () => {
  const header = qs(".site-header");
  const navToggle = qs(".nav-toggle");
  if (navToggle && header) {
    navToggle.addEventListener("click", () => {
      header.classList.toggle("menu-open");
      navToggle.setAttribute("aria-expanded", header.classList.contains("menu-open"));
    });
  }

  qsa(".nav-links a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToTarget(link.getAttribute("href"));
      header?.classList.remove("menu-open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
  });

  const sections = qsa("section[id]");
  const navLinks = qsa(".nav-links a");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      });
    },
    { threshold: SECTION_VISIBILITY_THRESHOLD }
  );

  sections.forEach((section) => observer.observe(section));

  window.addEventListener("scroll", () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 20);
  });
};

const updateChart = (chart, value) => {
  const fill = qs(".chart-fill", chart);
  if (!fill) return;
  fill.style.width = `${value}%`;
};

const updateDashboardMetrics = () => {
  const cpu = qs('[data-metric="cpu"]');
  const ram = qs('[data-metric="ram"]');
  const players = qs('[data-metric="players"]');
  if (cpu) cpu.textContent = Math.floor(38 + Math.random() * 8);
  if (ram) ram.textContent = (2.2 + Math.random() * 0.6).toFixed(1);
  if (players) players.textContent = Math.floor(24 + Math.random() * 8);
  qsa(".chart[data-value]").forEach((chart) => {
    const value = Math.min(100, Math.max(15, Number(chart.dataset.value) + (Math.random() * 10 - 5)));
    chart.dataset.value = value.toFixed(0);
    updateChart(chart, value);
  });
};

const setupDashboard = () => {
  const sidebar = qs(".dash-sidebar");
  const notificationButton = qs('[data-action="toggle-notifications"]');
  const notificationDropdown = qs(".notifications-dropdown");
  const tabs = qsa(".tab-button");
  const panels = qsa(".dash-panel");

  const setActiveTab = (tab) => {
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  const sidebarToggle = qs(".sidebar-toggle");
  sidebarToggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("collapsed");
  });

  notificationButton?.addEventListener("click", () => {
    notificationDropdown?.classList.toggle("open", !notificationDropdown.classList.contains("open"));
  });

  document.addEventListener("click", (event) => {
    if (!notificationDropdown || !notificationButton) return;
    if (notificationDropdown.contains(event.target) || notificationButton.contains(event.target)) return;
    notificationDropdown.classList.remove("open");
  });

  qsa(".chart[data-value]").forEach((chart) => updateChart(chart, Number(chart.dataset.value)));
  updateDashboardMetrics();
  const metricInterval = setInterval(updateDashboardMetrics, 5000);
  window.addEventListener("beforeunload", () => clearInterval(metricInterval));

  const consoleBody = qs(".console-body");
  if (consoleBody) {
    const logs = [
      "[INFO] Autoscaling nodes...",
      "[AI] Optimized view-distance to 10 chunks",
      "[QUEUE] 6 players waiting · ETA 2m",
      "[BOOST] Coin streak +1 · 180 earned",
      "[INFO] Backup snapshot completed",
    ];
    let logIndex = 0;
    setInterval(() => {
      const line = document.createElement("p");
      line.textContent = logs[logIndex % logs.length];
      consoleBody.appendChild(line);
      if (consoleBody.children.length > 6) {
        consoleBody.removeChild(consoleBody.firstElementChild);
      }
      logIndex += 1;
    }, 3000);
  }

  const setTabAndScroll = (tab) => {
    setActiveTab(tab);
    scrollToTarget("#dashboard");
  };

  return { setTabAndScroll };
};

const setupWizard = () => {
  const modal = qs("#server-modal");
  if (!modal) return {};
  const steps = qsa(".wizard-step", modal);
  const indicators = qsa("[data-step-indicator]", modal);
  const progressBar = qs(".wizard-progress-bar span", modal);
  const aiRecommendation = qs(".ai-recommendation", modal);
  const ramSlider = qs("[data-ram-slider]", modal);
  const ramValue = qs("[data-ram-value]", modal);
  const reviewEdition = qs("[data-review-edition]", modal);
  const reviewType = qs("[data-review-type]", modal);
  const reviewRam = qs("[data-review-ram]", modal);
  const provisionStatus = qs("[data-provision-status]", modal);
  const provisionProgress = qs("[data-provision-progress]", modal);
  const provisionList = qsa(".provision-list li", modal);
  const finishButton = qs('[data-action="finish-provision"]', modal);

  const updateWizard = () => {
    steps.forEach((step) => step.classList.toggle("active", Number(step.dataset.step) === state.wizard.step));
    indicators.forEach((indicator) =>
      indicator.classList.toggle("active", Number(indicator.dataset.stepIndicator) <= state.wizard.step)
    );
    if (progressBar) progressBar.style.width = `${(state.wizard.step - 1) * 25}%`;
    if (reviewEdition) reviewEdition.textContent = state.wizard.edition;
    if (reviewType) reviewType.textContent = state.wizard.type;
    if (reviewRam) reviewRam.textContent = `${state.wizard.ram}GB`;

    const backButton = qs('[data-action="wizard-back"]', modal);
    const nextButton = qs('[data-action="wizard-next"]', modal);
    if (backButton) backButton.disabled = state.wizard.step === 1 || state.wizard.step === 5;
    if (nextButton) {
      nextButton.disabled = state.wizard.step >= 4;
      nextButton.textContent = state.wizard.step >= 4 ? "Review" : "Next";
    }
  };

  const selectOption = (stepNumber, value) => {
    const group = qs(`.wizard-step[data-step="${stepNumber}"]`, modal);
    if (!group) return;
    qsa(".option-card", group).forEach((card) =>
      card.classList.toggle("active", card.dataset.option === value)
    );
  };

  modal.addEventListener("click", (event) => {
    const card = event.target.closest(".option-card");
    if (!card) return;
    const stepElement = event.target.closest(".wizard-step");
    if (!stepElement) return;
    const stepNumber = Number(stepElement.dataset.step);
    if (stepNumber === 1) {
      state.wizard.edition = card.dataset.option;
    }
    if (stepNumber === 2) {
      state.wizard.type = card.dataset.option;
      aiRecommendation?.classList.add("show");
    }
    selectOption(stepNumber, card.dataset.option);
    updateWizard();
  });

  ramSlider?.addEventListener("input", (event) => {
    state.wizard.ram = Number(event.target.value);
    if (ramValue) ramValue.textContent = `${state.wizard.ram}GB`;
    updateWizard();
  });

  selectOption(1, state.wizard.edition);
  selectOption(2, state.wizard.type);
  updateWizard();

  const startProvisioning = () => {
    state.wizard.step = 5;
    state.wizard.provisioning = true;
    provisionList.forEach((item) => item.classList.remove("complete", "active"));
    if (finishButton) finishButton.disabled = true;
    let index = 0;
    let progress = 0;
    const interval = setInterval(() => {
      provisionList.forEach((item, idx) => {
        item.classList.toggle("complete", idx < index);
        item.classList.toggle("active", idx === index);
      });
      if (provisionStatus) provisionStatus.textContent = provisionList[index]?.textContent || "Finalizing";
      progress += 25;
      if (provisionProgress) provisionProgress.style.width = `${progress}%`;
      index += 1;
      if (index >= provisionList.length) {
        clearInterval(interval);
        provisionList.forEach((item) => item.classList.add("complete"));
        if (provisionStatus) provisionStatus.textContent = "Server online. Ready to launch!";
        if (finishButton) finishButton.disabled = false;
        state.wizard.provisioning = false;
      }
    }, PROVISION_STEP_DELAY);
    updateWizard();
  };

  return { updateWizard, startProvisioning, selectOption };
};

const setupQueue = () => {
  const timerEl = qs("[data-queue-timer]");
  const estimateEl = qs("[data-queue-estimate]");
  const positionEl = qs("[data-queue-position]");
  const progressBar = qs("[data-queue-progress]");
  const updatesContainer = qs(".queue-updates");

  const formatTime = (seconds) => {
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const updateQueue = () => {
    state.queue.elapsedSeconds += 1;
    state.queue.waitSeconds = Math.max(60, state.queue.waitSeconds - 1);
    if (timerEl) timerEl.textContent = formatTime(state.queue.elapsedSeconds);
    if (estimateEl) estimateEl.textContent = formatTime(state.queue.waitSeconds);
    if (positionEl) positionEl.textContent = state.queue.position;
    if (progressBar) {
      const progress = Math.min(100, (1 - state.queue.position / state.queue.total) * 100 + 10);
      progressBar.style.width = `${progress.toFixed(0)}%`;
    }
  };

  const updates = [
    "Pulse AI optimized startup queue · 12% faster",
    "New player joined queue · +1 position",
    "Boost Coin skip activated · 2 slots freed",
    "Server node warmed · ETA -20s",
  ];

  const renderUpdates = () => {
    if (!updatesContainer) return;
    updatesContainer.classList.remove("loading");
    updatesContainer.innerHTML = "";
    updates.forEach((text) => {
      const item = document.createElement("div");
      item.className = "queue-update";
      item.textContent = text;
      updatesContainer.appendChild(item);
    });
  };

  setTimeout(renderUpdates, QUEUE_LOADING_DELAY);
  updateQueue();
  setInterval(updateQueue, 1000);

  setInterval(() => {
    state.queue.position = Math.max(
      1,
      state.queue.position - (Math.random() > QUEUE_ADVANCE_PROBABILITY ? QUEUE_POSITION_DECREMENT : 0)
    );
    if (updates.length > 0) {
      updates.push(updates.shift());
    }
    if (updatesContainer && updatesContainer.children.length) {
      updatesContainer.firstElementChild.textContent = updates[0];
    }
  }, 4000);
};

const setupPricing = () => {
  const toggleButtons = qsa(".toggle-btn");
  const priceElements = qsa(".price");

  const updatePricing = (mode) => {
    toggleButtons.forEach((button) => button.classList.toggle("active", button.dataset.pricing === mode));
    priceElements.forEach((price) => {
      const value = Number(price.dataset[mode] || 0);
      price.textContent = value === 0 ? "$0" : `$${value}/${mode === "monthly" ? "mo" : "yr"}`;
    });
  };

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => updatePricing(button.dataset.pricing));
  });

  updatePricing("monthly");
};

const setupCommunity = () => {
  const track = qs(".carousel-track");
  if (!track) return;
  const cards = qsa(".carousel-card", track);
  let stepSize = 0;

  const calculateStep = () => {
    if (!cards.length) return;
    const gap = parseFloat(getComputedStyle(track).gap || "0");
    stepSize = cards[0].getBoundingClientRect().width + gap;
  };

  const updateCarousel = () => {
    if (!track || cards.length === 0) return;
    if (!stepSize) calculateStep();
    if (!stepSize) return;
    const cardWidth = stepSize;
    const trackContainer = track.parentElement;
    if (!trackContainer) return;
    const visible = Math.max(1, Math.floor(trackContainer.getBoundingClientRect().width / cardWidth));
    const maxIndex = Math.max(0, cards.length - visible);
    state.carouselIndex = Math.min(state.carouselIndex, maxIndex);
    track.style.transform = `translateX(-${state.carouselIndex * cardWidth}px)`;
  };

  calculateStep();
  updateCarousel();
  window.addEventListener("resize", () => {
    calculateStep();
    updateCarousel();
  });

  const prev = qs('[data-action="carousel-prev"]');
  const next = qs('[data-action="carousel-next"]');

  prev?.addEventListener("click", () => {
    state.carouselIndex = Math.max(0, state.carouselIndex - 1);
    updateCarousel();
  });

  next?.addEventListener("click", () => {
    state.carouselIndex += 1;
    updateCarousel();
  });
};

const setupRewards = () => {
  const streak = qs("[data-streak-count]");
  const boostStreak = qs("[data-boost-streak]");
  const boostCoins = qs("[data-boost-coins]");
  const boostCount = qs("[data-boost-count]");
  const coinCount = qs("[data-coin-count]");
  const progress = qs("[data-progress]");
  const progressLabel = qs("[data-progress-label]");
  const xpProgress = qs("[data-xp-progress]");
  const xpText = qs("[data-xp-text]");

  const updateUI = () => {
    if (streak) streak.dataset.count = state.reward.streak;
    if (boostStreak) boostStreak.dataset.count = state.reward.streak;
    if (boostCoins) boostCoins.dataset.count = state.reward.coins;
    if (boostCount) boostCount.dataset.count = state.reward.coins;
    if (coinCount) coinCount.dataset.count = state.reward.coins + BASE_COIN_AMOUNT;
    animateCounters();

    const percent = Math.min(100, Math.round((state.reward.xp / state.reward.xpMax) * 100));
    if (progress) progress.style.width = `${percent}%`;
    if (progressLabel) progressLabel.textContent = `${percent}%`;
    if (xpProgress) xpProgress.style.width = `${percent}%`;
    if (xpText) xpText.textContent = `${state.reward.xp} / ${state.reward.xpMax} XP`;
  };

  updateUI();
  return { updateUI };
};

const setupAdModal = () => {
  const adModal = qs("#ad-modal");
  const adProgress = qs("[data-ad-progress]");
  const finishButton = qs('[data-action="finish-ad"]');
  let adInterval;

  const startAd = () => {
    openModal("ad-modal");
    let progress = 0;
    if (finishButton) finishButton.disabled = true;
    if (adProgress) adProgress.style.width = "0%";
    clearInterval(adInterval);
    adInterval = setInterval(() => {
      progress += 10;
      if (adProgress) adProgress.style.width = `${progress}%`;
      if (progress >= 100) {
        clearInterval(adInterval);
        if (finishButton) finishButton.disabled = false;
      }
    }, 400);
  };

  finishButton?.addEventListener("click", () => {
    const verification = adsService.verifyRewardWatch({ userId: state.userId, progress: 100 });
    if (!verification.valid) {
      showToast("Ad reward blocked due to fraud checks");
      return;
    }
    adsService.payoutReward({ userId: state.userId, rewardType: "ram_boost", amount: 512 });
    closeModal(adModal);
    showToast("Reward applied: +512MB RAM for 6h");
  });

  return { startAd };
};

const setupInteractions = () => {
  const dashboard = setupDashboard();
  const wizard = setupWizard();
  const rewards = setupRewards();
  const adModal = setupAdModal();
  const antiAbuse = createAntiAbuseModule();

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    playClickSound();

    switch (action) {
      case "discord":
        window.open(DISCORD_INVITE, "_blank", "noopener noreferrer");
        showToast("Opening Discord invite...");
        break;
      case "open-wizard":
        openModal("server-modal");
        state.wizard.step = 1;
        wizard.updateWizard?.();
        break;
      case "scroll":
        scrollToTarget(actionEl.dataset.target);
        break;
      case "wizard-next":
        if (state.wizard.step < 4) {
          state.wizard.step += 1;
          wizard.updateWizard?.();
        }
        break;
      case "wizard-back":
        if (state.wizard.step > 1) {
          state.wizard.step -= 1;
          wizard.updateWizard?.();
        }
        break;
      case "apply-ai":
        state.wizard.type = "SMP";
        wizard.selectOption?.(2, "SMP");
        wizard.updateWizard?.();
        showToast("Pulse AI applied SMP + Economy preset");
        break;
      case "start-provision":
        wizard.startProvisioning?.();
        break;
      case "finish-provision":
        closeModal(qs("#server-modal"));
        dashboard.setTabAndScroll?.("overview");
        showToast("Server online · Opening dashboard");
        break;
      case "open-console":
        dashboard.setTabAndScroll?.("console");
        break;
      case "open-boost":
        scrollToTarget("#boost");
        break;
      case "open-queue":
        scrollToTarget("#queue");
        break;
      case "watch-ad":
        adModal.startAd?.();
        break;
      case "skip-queue":
        if (!queueService.canBypassQueue(state.userId)) {
          showToast("Queue skip locked · Premium required");
          break;
        }
        state.queue.position = Math.max(1, state.queue.position - 3);
        showToast("Queue skip applied · Position boosted");
        break;
      case "claim-reward":
        {
          const claimId = crypto.randomUUID();
          const captchaToken = antiAbuse.issueCaptcha();
          const result = antiAbuse.claimReward({
            claimId,
            source: "dailyClaim",
            captchaToken,
            captchaResponse: "human",
          });
          if (!result.ok) {
            showToast(`Claim blocked: ${result.reason.replaceAll("_", " ")}`);
            antiAbuse.renderAbuseFlags();
            break;
          }
          rewards.updateUI?.();
          openModal("reward-modal");
        }
        break;
      case "open-settings":
        openModal("settings-modal");
        break;
      case "compare-plans":
        openModal("compare-modal");
        break;
      case "upgrade-plan":
        billingService.subscribe({ userId: state.userId, tier: actionEl.dataset.plan || "premium" });
        showToast(`Upgrading to ${actionEl.dataset.plan}...`);
        break;
      case "ask-ai":
        showToast("Pulse AI is generating your recommendations...");
        break;
      case "finish-ad":
        antiAbuse.claimReward({
          claimId: crypto.randomUUID(),
          source: "adWatch",
          captchaToken: antiAbuse.issueCaptcha(),
          captchaResponse: "human",
        });
        rewards.updateUI?.();
        break;
      default:
        break;
    }
  });

  qsa("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.closest(".modal")));
  });
};

const setupButtons = () => {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".btn");
    if (!button) return;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");
    const existing = button.querySelector(".ripple");
    if (existing) existing.remove();
    button.appendChild(circle);
  });
};

const setupSettings = () => {
  const soundToggle = qs("#sound-toggle");
  const motionToggle = qs("#motion-toggle");

  soundToggle?.addEventListener("change", (event) => {
    state.soundEnabled = event.target.checked;
    showToast(`Sound effects ${state.soundEnabled ? "on" : "off"}`);
  });

  motionToggle?.addEventListener("change", (event) => {
    state.motionEnabled = event.target.checked;
    setBodyMotion();
    showToast(`Animations ${state.motionEnabled ? "on" : "off"}`);
  });

  setBodyMotion();
};

window.addEventListener("load", () => {
  document.body.classList.add("page-loaded");
});

document.addEventListener("DOMContentLoaded", () => {
  createParticles();
  animateCounters();
  setupNavigation();
  setupInteractions();
  setupButtons();
  setupSettings();
  setupQueue();
  setupPricing();
  setupCommunity();
  const sponsoredListing = queueService.getNextSponsoredListing();
  if (sponsoredListing) {
    showToast(`Sponsored: ${sponsoredListing.label}`);
  }
  commerceService.purchaseCosmetic({ userId: state.userId, sku: "frame-neon-01", price: 600, kind: "profile_frame" });
  window.addEventListener("resize", createParticles);
});
