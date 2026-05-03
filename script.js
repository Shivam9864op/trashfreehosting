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

const state = {
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
};

class InMemoryTimeseriesStore {
  constructor(maxPoints = 2000) {
    this.maxPoints = maxPoints;
    this.series = new Map();
  }

  append(metric, point) {
    if (!this.series.has(metric)) this.series.set(metric, []);
    const bucket = this.series.get(metric);
    bucket.push(point);
    if (bucket.length > this.maxPoints) {
      bucket.splice(0, bucket.length - this.maxPoints);
    }
  }

  query(metric, options = {}) {
    const { from = Date.now() - 1000 * 60 * 60, to = Date.now(), resolutionMs = 5000 } = options;
    const rows = (this.series.get(metric) || []).filter((entry) => entry.ts >= from && entry.ts <= to);
    if (!rows.length) return [];
    const grouped = new Map();
    rows.forEach((row) => {
      const key = Math.floor(row.ts / resolutionMs) * resolutionMs;
      const current = grouped.get(key) || { ts: key, value: 0, count: 0 };
      current.value += row.value;
      current.count += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values())
      .sort((a, b) => a.ts - b.ts)
      .map((entry) => ({ ts: entry.ts, value: Number((entry.value / entry.count).toFixed(2)) }));
  }
}

class NotificationCenter {
  constructor() {
    this.events = [];
  }

  emit(type, title, detail, severity = "info") {
    const entry = { id: crypto.randomUUID(), ts: Date.now(), type, title, detail, severity };
    this.events.unshift(entry);
    this.events = this.events.slice(0, 250);
    return entry;
  }

  list(options = {}) {
    const { type, since = 0 } = options;
    return this.events.filter((item) => item.ts >= since && (!type || item.type === type));
  }
}

class BackupAndArtifactManager {
  constructor() {
    this.backups = [];
    this.plugins = [{ id: "luckperms", enabled: true }, { id: "essentialsx", enabled: true }];
    this.mods = [{ id: "sodium", enabled: false }, { id: "lithium", enabled: true }];
    this.files = [{ path: "server.properties", sizeKb: 2 }, { path: "plugins/LuckPerms/config.yml", sizeKb: 8 }];
  }

  createBackup(reason = "manual") {
    const backup = { id: `bkp_${Date.now()}`, reason, ts: Date.now(), status: "completed" };
    this.backups.unshift(backup);
    return backup;
  }

  listBackups() { return this.backups; }
  listFiles() { return this.files; }
  listPlugins() { return this.plugins; }
  listMods() { return this.mods; }
}

const backend = {
  metricsStore: new InMemoryTimeseriesStore(),
  notifications: new NotificationCenter(),
  assets: new BackupAndArtifactManager(),
  websocket: new EventTarget(),
};

const streamEvent = (channel, payload) =>
  backend.websocket.dispatchEvent(new CustomEvent(channel, { detail: { ...payload, ts: Date.now() } }));

const ingestServerMetrics = ({ cpu, ram, players, state: status }) => {
  const ts = Date.now();
  backend.metricsStore.append("cpu", { ts, value: cpu });
  backend.metricsStore.append("ram", { ts, value: ram });
  backend.metricsStore.append("players", { ts, value: players });
  backend.metricsStore.append("state", { ts, value: status === "online" ? 1 : 0 });
  streamEvent("metrics", { cpu, ram, players, state: status });
};

const api = {
  metrics: {
    ingest: ingestServerMetrics,
    query: (metric, options) => backend.metricsStore.query(metric, options),
  },
  streams: {
    subscribeConsole: (cb) => backend.websocket.addEventListener("console", (event) => cb(event.detail)),
    subscribeQueue: (cb) => backend.websocket.addEventListener("queue", (event) => cb(event.detail)),
    subscribeMetrics: (cb) => backend.websocket.addEventListener("metrics", (event) => cb(event.detail)),
  },
  notifications: {
    create: (type, title, detail, severity) => backend.notifications.emit(type, title, detail, severity),
    list: (options) => backend.notifications.list(options),
  },
  backupManager: {
    createBackup: (reason) => backend.assets.createBackup(reason),
    listBackups: () => backend.assets.listBackups(),
  },
  artifacts: {
    files: () => backend.assets.listFiles(),
    plugins: () => backend.assets.listPlugins(),
    mods: () => backend.assets.listMods(),
  },
};
window.blockPulseApi = api;

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
  ingestServerMetrics({
    cpu: Number(cpu?.textContent || 0),
    ram: Number(ram?.textContent || 0),
    players: Number(players?.textContent || 0),
    state: "online",
  });
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
      const nextLine = logs[logIndex % logs.length];
      const line = document.createElement("p");
      line.textContent = nextLine;
      consoleBody.appendChild(line);
      streamEvent("console", { line: nextLine });
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
      streamEvent("queue", {
        position: state.queue.position,
        total: state.queue.total,
        waitSeconds: state.queue.waitSeconds,
        progress: Number(progress.toFixed(0)),
      });
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
        api.notifications.create("provisioning", "Provisioning started", "Allocating compute slot");
        wizard.startProvisioning?.();
        break;
      case "finish-provision":
        api.notifications.create("provisioning", "Provisioning completed", "Server is now online", "success");
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
        state.queue.position = Math.max(1, state.queue.position - 3);
        showToast("Queue skip applied · Position boosted");
        break;
      case "claim-reward":
        state.reward.streak += 1;
        state.reward.coins += 180;
        state.reward.xp = Math.min(state.reward.xpMax, state.reward.xp + 120);
        rewards.updateUI?.();
        api.notifications.create("reward", "Reward claimed", "+180 Boost Coins and +120 XP", "success");
        openModal("reward-modal");
        break;
      case "open-settings":
        openModal("settings-modal");
        break;
      case "compare-plans":
        openModal("compare-modal");
        break;
      case "upgrade-plan":
        api.notifications.create("system", "Upgrade requested", `Plan: ${actionEl.dataset.plan}`);
        showToast(`Upgrading to ${actionEl.dataset.plan}...`);
        break;
      case "ask-ai":
        showToast("Pulse AI is generating your recommendations...");
        break;
      case "finish-ad":
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
  api.notifications.create("system", "Dashboard connected", "Live metric ingestion active", "success");
  api.notifications.create("abuse", "Abuse guard", "No suspicious automation detected");
  api.backupManager.createBackup("startup");
  window.addEventListener("resize", createParticles);
});
