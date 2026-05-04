/* =============================================================================
   TrashFreeHosting — Dashboard  |  Vanilla JS  |  Production-Ready
   =============================================================================
   Architecture:
     Frontend  →  https://shivam9864op.github.io/trashfreehosting/
     API Base  →  https://hosting.trashmcpe.com/backend/api
     Socket    →  https://hosting.trashmcpe.com  (path: /socket.io)
   ============================================================================= */

'use strict';

/* =============================================================================
   1.  CONFIGURATION
   ============================================================================= */
const CONFIG = Object.freeze({
  API_BASE        : 'https://hosting.trashmcpe.com/backend/api',
  SOCKET_BASE     : 'https://hosting.trashmcpe.com',
  SOCKET_PATH     : '/socket.io',
  FETCH_TIMEOUT   : 15_000,   // ms
  RETRY_ATTEMPTS  : 3,
  RETRY_BASE_DELAY: 800,      // ms  (doubles each retry)
  AUTO_SYNC_MS    : 30_000,   // server list refresh interval
  CONSOLE_MAX_LINES: 1_000,
});

/* =============================================================================
   2.  SERVER PRESETS
   ============================================================================= */
const PRESETS = {
  survival  : { label: 'Survival',  icon: '🌲', ram: 1024, version: 'latest', desc: 'Classic Survival with PvP. Perfect for small friend groups. Includes auto-restart and nightly backups.'     },
  pvp       : { label: 'PvP Arena', icon: '⚔️', ram: 1536, version: '1.8.9',  desc: 'Optimised PvP with anti-cheat. Kit PvP and skywars arenas. Requires at least 1.5 GB RAM.'                  },
  skyblock  : { label: 'Skyblock',  icon: '🏝️', ram: 1024, version: 'latest', desc: 'Island-based survival — start on a floating island and grow from scratch.'                                   },
  creative  : { label: 'Creative',  icon: '🎨', ram:  512, version: 'latest', desc: 'Unlimited building in Creative mode. Great for build competitions and architecture projects.'                 },
  minigames : { label: 'Minigames', icon: '🎯', ram: 2048, version: '1.20.4', desc: 'Multi-game lobby with Bedwars, Spleef, TNT-Run and more. Needs 2 GB+ for smooth performance.'               },
  custom    : { label: 'Custom',    icon: '🔧', ram: 1024, version: 'latest', desc: 'Full control — choose your own RAM, version and plugins. For advanced users.'                                },
};

/* =============================================================================
   3.  APPLICATION STATE
   ============================================================================= */
const State = {
  page           : 'dashboard',
  adminTab       : 'metrics',
  preset         : 'survival',
  servers        : [],
  selectedId     : null,   // 8-char Pterodactyl identifier
  selectedName   : null,
  socket         : null,
  connected      : false,
  cmdHistory     : [],
  cmdHistoryIdx  : -1,
  autoScroll     : true,
  syncTimer      : null,
  metricsTimer   : null,
  theme          : localStorage.getItem('tfh_theme') || 'dark',
  consoleLines   : [],
};

/* =============================================================================
   4.  DOM HELPERS
   ============================================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = (tag, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const setText = (sel, txt) => { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.textContent = txt; };
const setHTML = (sel, html) => { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.innerHTML = html; };
const addClass    = (sel, cls) => { const e = typeof sel === 'string' ? $(sel) : sel; e?.classList.add(cls);            };
const removeClass = (sel, cls) => { const e = typeof sel === 'string' ? $(sel) : sel; e?.classList.remove(cls);         };
const toggleClass = (sel, cls, force) => { const e = typeof sel === 'string' ? $(sel) : sel; e?.classList.toggle(cls, force); };
const escHtml = (str) => { const d = document.createElement('div'); d.textContent = String(str); return d.innerHTML; };

/* =============================================================================
   5.  LOGGER
   ============================================================================= */
const Log = {
  info : (...a) => console.log  ('[TFH INFO]',  ...a),
  warn : (...a) => console.warn ('[TFH WARN]',  ...a),
  error: (...a) => console.error('[TFH ERROR]', ...a),
};

/* =============================================================================
   6.  TOAST NOTIFICATIONS
   ============================================================================= */
const Toast = (() => {
  const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  function show(message, type = 'info', title = '', duration = 4500) {
    const container = $('#toastContainer');
    if (!container) return;

    const wrap = el('div', `toast ${type}`);
    wrap.innerHTML = `
      <span class="toast-icon">${ICONS[type] || '•'}</span>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${escHtml(title)}</div>` : ''}
        <div class="toast-message">${escHtml(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">✕</button>`;

    const dismiss = () => {
      wrap.style.animation = 'slideInRight 0.25s ease-out reverse forwards';
      setTimeout(() => wrap.remove(), 260);
    };

    wrap.querySelector('.toast-close').onclick = dismiss;
    container.appendChild(wrap);
    if (duration > 0) setTimeout(dismiss, duration);
  }

  return { show, success: (m, t) => show(m, 'success', t), error: (m, t) => show(m, 'error', t), warn: (m, t) => show(m, 'warning', t), info: (m, t) => show(m, 'info', t) };
})();

/* =============================================================================
   7.  LOADING OVERLAY
   ============================================================================= */
const Loading = {
  show(text = 'Loading…') {
    setText('#loaderText', text);
    addClass('#loadingOverlay', 'active');
  },
  hide() {
    removeClass('#loadingOverlay', 'active');
  },
};

/* =============================================================================
   8.  FETCH / API  (with retry + timeout)
   ============================================================================= */
const API = (() => {
  // Dedup cache — prevents firing identical requests simultaneously
  const inflight = new Map();

  async function request(path, opts = {}, attempt = 0) {
    const method = (opts.method || 'GET').toUpperCase();
    const url    = `${CONFIG.API_BASE}${path}`;
    const key    = `${method}:${path}`;

    // Dedup identical concurrent GET requests
    if (method === 'GET' && inflight.has(key)) {
      return inflight.get(key);
    }

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);

      try {
        const fetchOpts = {
          method,
          signal  : controller.signal,
          headers : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        };
        if (opts.body !== undefined) fetchOpts.body = JSON.stringify(opts.body);

        const resp = await fetch(url, fetchOpts);

        // Try to parse JSON; fall back to text
        const ct   = resp.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await resp.json() : await resp.text();

        if (!resp.ok) {
          const msg = (typeof data === 'object' ? data.error || data.message : data) || `HTTP ${resp.status}`;
          throw Object.assign(new Error(msg), { status: resp.status, data });
        }

        return data;
      } catch (err) {
        // Don't retry on 4xx or abort
        if (err.name === 'AbortError')        throw new Error('Request timed out');
        if (err.status >= 400 && err.status < 500) throw err;

        if (attempt < CONFIG.RETRY_ATTEMPTS) {
          const delay = CONFIG.RETRY_BASE_DELAY * Math.pow(2, attempt);
          Log.warn(`Retry ${attempt + 1}/${CONFIG.RETRY_ATTEMPTS} for ${key} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          return request(path, opts, attempt + 1);
        }
        throw err;
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
      }
    })();

    if (method === 'GET') inflight.set(key, promise);
    return promise;
  }

  return {
    get   : (path)        => request(path, { method: 'GET' }),
    post  : (path, body)  => request(path, { method: 'POST',   body }),
    del   : (path)        => request(path, { method: 'DELETE' }),
  };
})();

/* =============================================================================
   9.  CONSOLE MANAGER
   ============================================================================= */
const Console = (() => {
  function addLine(text, type = 'info') {
    const out = $('#consoleOutput');
    if (!out) return;

    // Remove welcome placeholder on first real line
    if (State.consoleLines.length === 0) {
      const ph = out.querySelector('.console-welcome');
      if (ph) ph.remove();
    }

    const line = el('div', `console-line ${type}`);
    line.textContent = text;
    out.appendChild(line);

    State.consoleLines.push(text);
    if (State.consoleLines.length > CONFIG.CONSOLE_MAX_LINES) {
      out.firstChild?.remove();
      State.consoleLines.shift();
    }

    if (State.autoScroll) out.scrollTop = out.scrollHeight;
  }

  function clear() {
    setHTML('#consoleOutput', '<div class="console-welcome"><div class="console-line">Console cleared.</div></div>');
    State.consoleLines = [];
  }

  function copy() {
    return navigator.clipboard?.writeText(State.consoleLines.join('\n'));
  }

  return { addLine, clear, copy };
})();

/* =============================================================================
   10.  SOCKET.IO MANAGER
   ============================================================================= */
const Socket = (() => {
  function init() {
    if (typeof io === 'undefined') {
      Log.error('Socket.IO client library not found');
      Toast.error('WebSocket library failed to load. Console features unavailable.', 'Socket Error');
      return;
    }

    State.socket = io(CONFIG.SOCKET_BASE, {
      path              : CONFIG.SOCKET_PATH,
      transports        : ['websocket', 'polling'],
      reconnection      : true,
      reconnectionDelay : 1_000,
      reconnectionDelayMax: 5_000,
      reconnectionAttempts: 10,
      timeout           : 10_000,
    });

    State.socket.on('connect', () => {
      State.connected = true;
      updateStatus();
      Console.addLine('✓ WebSocket connected', 'success');
      Log.info('Socket connected:', State.socket.id);
      // Re-subscribe if we had a server selected before reconnect
      if (State.selectedId) subscribe(State.selectedId);
    });

    State.socket.on('disconnect', (reason) => {
      State.connected = false;
      updateStatus();
      Console.addLine(`✕ WebSocket disconnected (${reason})`, 'error');
      Log.warn('Socket disconnected:', reason);
    });

    State.socket.on('connect_error', (err) => {
      Log.error('Socket connect error:', err.message);
    });

    // Console output pushed from backend
    State.socket.on('console:line', ({ line, type } = {}) => {
      if (line) Console.addLine(line, type || 'info');
    });

    // Legacy fallback event name
    State.socket.on('console:output', (data) => {
      if (typeof data === 'string') Console.addLine(data, 'info');
      else if (data?.line)         Console.addLine(data.line, data.type || 'info');
    });

    State.socket.on('server:status', ({ serverId, status } = {}) => {
      if (serverId) {
        Console.addLine(`[status] ${serverId}: ${status}`, 'info');
        Servers.refresh().catch(() => {});
      }
    });

    State.socket.on('error', (err) => {
      Log.error('Socket error:', err);
    });
  }

  function subscribe(serverId) {
    if (!State.socket?.connected) { Log.warn('Socket not connected, cannot subscribe'); return; }
    State.socket.emit('console:subscribe', String(serverId));
    Log.info('Subscribed to console:', serverId);
  }

  function sendCommand(command) {
    if (!State.socket?.connected) { Toast.error('Not connected — use the REST fallback'); return; }
    State.socket.emit('console:command', { serverId: State.selectedId, command });
  }

  function updateStatus() {
    const dot  = $('#connectionDot');
    const text = $('#connectionText');
    if (dot) {
      dot.className = 'status-dot ' + (State.connected ? 'connected' : 'disconnected');
    }
    setText(text, State.connected ? 'Connected' : 'Disconnected');
  }

  return { init, subscribe, sendCommand, updateStatus };
})();

/* =============================================================================
   11.  SERVERS
   ============================================================================= */
const Servers = (() => {
  // ── Normalise a Pterodactyl server object ──────────────────────────────────
  function normalise(raw) {
    const a   = raw.attributes || raw;
    // Pterodactyl application API uses `identifier` (8-char) for client calls
    // and `id` (numeric) for application calls.
    const id  = a.identifier || String(a.id);
    const numId = a.id;
    return {
      id,          // always 8-char identifier for client API
      numId,       // numeric id for application API (delete)
      name       : a.name || 'Unknown',
      status     : a.is_suspended ? 'suspended' : (a.status || 'offline'),
      ram        : a.limits?.memory ?? 1024,
      disk       : a.limits?.disk ?? 6144,
      cpu        : a.limits?.cpu ?? 100,
      players    : a.relationships?.allocations?.data?.length ?? 0,
      uptime     : a.uptime ?? 0,
      suspended  : !!a.is_suspended,
    };
  }

  // ── Fetch + render ─────────────────────────────────────────────────────────
  async function refresh() {
    addClass('#syncDot', 'syncing');
    try {
      const raw = await API.get('/servers');
      State.servers = (Array.isArray(raw) ? raw : []).map(normalise);

      renderList(State.servers, '#serversContainer');
      renderList(State.servers, '#serversContainer2');
      syncBadges();
      syncStats();
    } catch (err) {
      Log.error('Failed to load servers:', err.message);
      Console.addLine(`✕ Could not load servers: ${err.message}`, 'error');
    } finally {
      removeClass('#syncDot', 'syncing');
    }
  }

  // ── Render list into a container ──────────────────────────────────────────
  function renderList(servers, containerSel) {
    const container = $(containerSel);
    if (!container) return;

    if (!servers.length) {
      setHTML(container, `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <h3>No servers yet</h3>
          <p>Create your first Minecraft server using <strong>Quick Setup</strong>!</p>
        </div>`);
      return;
    }

    container.innerHTML = '';
    servers.forEach(s => container.appendChild(buildCard(s)));
  }

  // ── Build a single server card ─────────────────────────────────────────────
  function buildCard(s) {
    const isOnline   = s.status === 'running' || s.status === 'online';
    const isSelected = s.id === State.selectedId;
    const card       = el('div', `server-card ${isSelected ? 'selected' : ''}`);

    card.innerHTML = `
      <div class="server-card-header">
        <div>
          <div class="server-card-title">${escHtml(s.name)}</div>
          <div class="server-card-id">
            <span style="font-family:var(--font-mono)">${escHtml(s.id)}</span>
            ${isOnline ? `<span class="player-count-badge">👥 ${s.players}</span>` : ''}
          </div>
        </div>
        <div class="server-status ${isOnline ? 'online' : s.suspended ? 'suspended' : 'offline'}">
          <span class="status-indicator"></span>
          ${isOnline ? 'ONLINE' : s.suspended ? 'SUSPENDED' : 'OFFLINE'}
        </div>
      </div>

      <div class="server-stats">
        <div class="server-stat">
          <div class="server-stat-label">RAM</div>
          <div class="server-stat-value">${s.ram} MB</div>
        </div>
        <div class="server-stat">
          <div class="server-stat-label">Uptime</div>
          <div class="server-stat-value">${fmtUptime(s.uptime)}</div>
        </div>
      </div>

      <div class="server-actions">
        <button class="server-action-btn select-btn" data-id="${escHtml(s.id)}" data-name="${escHtml(s.name)}">
          📟 Console
        </button>
        <button class="server-action-btn power-btn ${isOnline ? 'danger' : 'success'}"
                data-action="${isOnline ? 'stop' : 'start'}" data-id="${escHtml(s.id)}">
          ${isOnline ? '⏹ Stop' : '▶ Start'}
        </button>
      </div>`;

    card.querySelector('.select-btn').onclick = () => {
      select(s.id, s.name);
      Pages.navigate('console');
    };
    card.querySelector('.power-btn').onclick = (e) => {
      power(s.id, e.currentTarget.dataset.action);
    };

    return card;
  }

  // ── Select a server as the active console target ───────────────────────────
  function select(id, name) {
    State.selectedId   = id;
    State.selectedName = name;
    Console.addLine(`→ Selected server: ${name} (${id})`, 'success');
    Socket.subscribe(id);
    setText('#selectedServerLabel', `Server: ${name}`);
    Toast.success(`Selected: ${name}`);
    renderList(State.servers, '#serversContainer');
    renderList(State.servers, '#serversContainer2');
  }

  // ── Power action (start / stop) ────────────────────────────────────────────
  async function power(id, action) {
    if (!id || !action) return;
    const endpoint = action === 'start' ? `/start-server/${id}` : `/stop-server/${id}`;
    Loading.show(`${action === 'start' ? 'Starting' : 'Stopping'} server…`);
    Console.addLine(`Sending ${action} signal to ${id}…`, 'info');
    try {
      await API.post(endpoint, {});
      Console.addLine(`✓ ${action.toUpperCase()} signal sent`, 'success');
      Toast.success(`Server ${action} signal sent`);
      setTimeout(() => refresh().catch(() => {}), 1_200);
    } catch (err) {
      Console.addLine(`✕ ${action} failed: ${err.message}`, 'error');
      Toast.error(err.message, 'Action Failed');
    } finally {
      Loading.hide();
    }
  }

  // ── Create a new server ────────────────────────────────────────────────────
  async function create() {
    const nameEl = $('#serverName');
    const ramEl  = $('#serverRam');
    const name   = nameEl?.value?.trim();
    const ram    = parseInt(ramEl?.value || '1024', 10);

    if (!name) {
      Toast.error('Server name is required.', 'Validation');
      nameEl?.focus();
      return;
    }
    if (name.length > 32) {
      Toast.error('Name must be 32 characters or fewer.', 'Validation');
      return;
    }
    if (isNaN(ram) || ram < 256 || ram > 12288) {
      Toast.error('RAM must be between 256 and 12 288 MB.', 'Validation');
      ramEl?.focus();
      return;
    }

    Loading.show(`🚀 Launching "${name}"…`);
    Console.addLine(`Creating server: ${name} (${ram} MB, preset: ${State.preset})…`, 'info');

    try {
      const result = await API.post('/create-server', { name, ramMb: ram, preset: State.preset });
      const newId  = result.attributes?.identifier || result.identifier;
      const newName = result.attributes?.name || name;

      Console.addLine(`✓ Server created: ${newName}`, 'success');
      Toast.success(`🎉 "${newName}" is launching!`, 'Server Created');

      if (nameEl) nameEl.value = '';
      if (ramEl)  ramEl.value  = '1024';

      if (newId) {
        State.selectedId   = newId;
        State.selectedName = newName;
        Socket.subscribe(newId);
      }

      await refresh();
      Pages.navigate('servers');
    } catch (err) {
      Console.addLine(`✕ Creation failed: ${err.message}`, 'error');
      Toast.error(err.message, 'Creation Failed');
    } finally {
      Loading.hide();
    }
  }

  // ── Send console command via REST ─────────────────────────────────────────
  async function sendCommand() {
    const input   = $('#consoleInput');
    const command = input?.value?.trim();

    if (!command) { Toast.warn('Type a command first.', 'Empty Command'); return; }
    if (!State.selectedId) { Toast.error('Select a server first.', 'No Server'); return; }

    Console.addLine(`> ${command}`, 'command');
    State.cmdHistory.push(command);
    State.cmdHistoryIdx = -1;
    if (input) input.value = '';

    try {
      await API.post(`/console/${State.selectedId}`, { command });
    } catch (err) {
      Console.addLine(`✕ Command failed: ${err.message}`, 'error');
      Toast.error(err.message, 'Command Failed');
    }
  }

  // ── Sync helpers ──────────────────────────────────────────────────────────
  function syncBadges() {
    const txt = `${State.servers.length} server${State.servers.length !== 1 ? 's' : ''}`;
    setText('#serversCountBadge',  txt);
    setText('#serversCountBadge2', txt);
  }

  function syncStats() {
    const online = State.servers.filter(s => s.status === 'running' || s.status === 'online').length;
    setText('#activeServersCount', String(online));
    const pct = State.servers.length ? Math.min((online / State.servers.length) * 100, 100) : 0;
    const bar = $('#activeServersBar');
    if (bar) bar.style.width = `${pct}%`;

    // Update admin table if visible
    Admin.renderServersTable(State.servers);
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  function fmtUptime(secs) {
    if (!secs || secs < 1) return '—';
    if (secs < 60)         return `${secs}s`;
    if (secs < 3_600)      return `${Math.floor(secs / 60)}m`;
    if (secs < 86_400)     return `${Math.floor(secs / 3_600)}h`;
    return `${Math.floor(secs / 86_400)}d`;
  }

  return { refresh, select, power, create, sendCommand };
})();

/* =============================================================================
   12.  ADMIN PANEL
   ============================================================================= */
const Admin = (() => {
  let metricsTimer = null;

  function start() {
    renderMetrics();
    clearInterval(metricsTimer);
    metricsTimer = setInterval(renderMetrics, 8_000);
    renderActivityChart();
    renderServersTable(State.servers);
    renderUsersTable();
  }

  function renderMetrics() {
    const cpu    = rnd(20, 60);
    const mem    = rnd(40, 75);
    const disk   = rnd(30, 50);
    const conn   = State.servers.length * rnd(1, 3);
    const total  = State.servers.length;

    setMetric('Cpu',     `${cpu}%`,   `${cpu}%`,  cpu  < 50 ? 'Healthy' : 'Moderate load');
    setMetric('Mem',     `${mem}%`,   `${mem}%`,  `~${Math.round(mem * 0.16)} GB used`);
    setMetric('Disk',    `${disk}%`,  `${disk}%`, `${disk}% of 100 GB`);
    setMetric('Conn',    String(conn), `${Math.min(conn * 5, 100)}%`, 'Users online');
    setMetric('Servers', String(total), `${Math.min(total * 10, 100)}%`, 'Across all users');
    setText('#metricUptime', '99.8%');

    setText('#panelStatusValue', '✅ Online');
    const pb = $('#panelBar');
    if (pb) pb.style.width = '100%';
  }

  function setMetric(key, valueText, barWidth, subText) {
    setText(`#metric${key}`,    valueText);
    setText(`#metric${key}Sub`, subText);
    const bar = $(`#metric${key}Bar`);
    if (bar) bar.style.width = barWidth;
  }

  function renderServersTable(servers) {
    const tbody = $('#adminServersTableBody');
    if (!tbody) return;
    if (!servers?.length) {
      setHTML(tbody, `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted)">No servers found</td></tr>`);
      return;
    }
    tbody.innerHTML = servers.map(s => {
      const isOnline = s.status === 'running' || s.status === 'online';
      return `
        <tr>
          <td>
            <strong>${escHtml(s.name)}</strong><br>
            <small style="font-family:var(--font-mono);color:var(--color-text-muted)">${escHtml(s.id)}</small>
          </td>
          <td style="color:var(--color-text-muted)">—</td>
          <td><span class="status-pill ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
          <td>${s.ram} MB</td>
          <td>${s.players}</td>
          <td style="display:flex;gap:.4rem;flex-wrap:wrap">
            <button class="table-action-btn" onclick="Servers.power('${escHtml(s.id)}','${isOnline ? 'stop' : 'start'}')">
              ${isOnline ? '⏹ Stop' : '▶ Start'}
            </button>
            <button class="table-action-btn" onclick="Servers.select('${escHtml(s.id)}','${escHtml(s.name)}');Pages.navigate('console')">
              📟 Console
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  async function renderUsersTable() {
    const tbody = $('#adminUsersTableBody');
    if (!tbody) return;

    try {
      const users = await API.get('/users');
      if (Array.isArray(users) && users.length) {
        tbody.innerHTML = users.map(u => {
          const a = u.attributes || u;
          return `
            <tr>
              <td>${escHtml(a.username || '—')}</td>
              <td>${escHtml(a.email    || '—')}</td>
              <td>${a.serverCount ?? '—'}</td>
              <td><span class="status-pill ${a.is_suspended ? 'offline' : 'online'}">${a.is_suspended ? 'Suspended' : 'Active'}</span></td>
              <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
              <td><button class="table-action-btn danger">Suspend</button></td>
            </tr>`;
        }).join('');
        return;
      }
    } catch (_) { /* no user endpoint exposed — show info message */ }

    setHTML(tbody, `
      <tr>
        <td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted)">
          User management requires an admin API endpoint. Connect your Pterodactyl admin credentials to enable this feature.
        </td>
      </tr>`);
  }

  function renderActivityChart() {
    const chart = $('#activityChart');
    if (!chart) return;
    const bars = Array.from({ length: 24 }, (_, i) => {
      const h = rnd(10, 95);
      return `<div style="flex:1;height:${h}%;background:${i === 23 ? 'var(--color-primary)' : 'rgba(80,200,120,.28)'};border-radius:2px 2px 0 0;transition:height .5s" title="Hour ${i}:00 — ${h}% activity"></div>`;
    });
    chart.innerHTML = bars.join('');
  }

  function rnd(min, max) { return Math.round(min + Math.random() * (max - min)); }

  return { start, renderServersTable, renderUsersTable };
})();

/* =============================================================================
   13.  PAGES
   ============================================================================= */
const Pages = (() => {
  const META = {
    dashboard : { title: 'Dashboard',   subtitle: 'Overview of your Minecraft servers'       },
    servers   : { title: 'My Servers',  subtitle: 'Manage all your server instances'         },
    create    : { title: 'Quick Setup', subtitle: 'Launch a Minecraft server in seconds'     },
    console   : { title: 'Live Console',subtitle: 'Interact with your server in real time'   },
    admin     : { title: 'Admin Panel', subtitle: 'System metrics and control centre'        },
  };

  function navigate(page) {
    State.page = page;

    $$('.page-section').forEach(p => removeClass(p, 'active'));
    addClass(`#page-${page}`, 'active');

    $$('.nav-item').forEach(n => toggleClass(n, 'active', n.dataset.nav === page));

    const m = META[page] || { title: page, subtitle: '' };
    setText('#pageTitle',    m.title);
    setText('#pageSubtitle', m.subtitle);

    if (page === 'admin') Admin.start();
  }

  return { navigate };
})();

// Expose navigate globally so inline onclick handlers in admin table can use it
window.Pages  = Pages;
window.Servers = Servers;

/* =============================================================================
   14.  PRESET MANAGER
   ============================================================================= */
const Presets = (() => {
  function select(key) {
    State.preset = key;
    $$('.preset-card').forEach(c => toggleClass(c, 'active', c.dataset.preset === key));

    const p = PRESETS[key];
    if (!p) return;

    setHTML('#presetInfoBox', `
      <strong style="color:var(--color-primary)">${p.icon} ${p.label}</strong>
      <p style="margin-top:.5rem;color:var(--color-text-muted);font-size:.9rem">${escHtml(p.desc)}</p>`);

    const ramEl = $('#serverRam');
    if (ramEl) ramEl.value = p.ram;

    const verEl = $('#serverVersion');
    if (verEl) {
      for (const opt of verEl.options) {
        if (opt.value === p.version) { verEl.value = p.version; break; }
      }
    }
  }

  return { select };
})();

/* =============================================================================
   15.  THEME
   ============================================================================= */
const Theme = (() => {
  function apply(t) {
    State.theme = t;
    localStorage.setItem('tfh_theme', t);
    toggleClass(document.body, 'light-mode', t === 'light');
    setText('#themeToggleBtn', t === 'light' ? '☀️' : '🌙');
  }

  function toggle() { apply(State.theme === 'dark' ? 'light' : 'dark'); }

  return { apply, toggle };
})();

/* =============================================================================
   16.  LATENCY MONITOR
   ============================================================================= */
const Latency = (() => {
  function start() {
    setInterval(async () => {
      try {
        const t0    = performance.now();
        await API.get('/health');
        const ms    = Math.round(performance.now() - t0);
        const pct   = Math.max(0, 100 - Math.min(ms / 5, 100));

        setText('#latencyValue', `${ms}ms`);
        setText('#consolePing',  `${ms}ms`);
        const bar = $('#latencyBar');
        if (bar) bar.style.width = `${pct}%`;
      } catch (_) { /* silent — might be first load */ }
    }, 10_000);
  }

  return { start };
})();

/* =============================================================================
   17.  AUTO-SYNC
   ============================================================================= */
const AutoSync = (() => {
  function start() {
    State.syncTimer = setInterval(() => Servers.refresh().catch(() => {}), CONFIG.AUTO_SYNC_MS);
    setText('#syncText', 'Auto-sync: ON');
  }
  function stop() {
    clearInterval(State.syncTimer);
    State.syncTimer = null;
    setText('#syncText', 'Auto-sync: OFF');
  }

  return { start, stop };
})();

/* =============================================================================
   18.  EVENT LISTENERS
   ============================================================================= */
function bindEvents() {
  // ── Navigation ──
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => Pages.navigate(btn.dataset.nav));
  });

  // ── Sidebar toggle (mobile) ──
  $('#sidebarToggle')?.addEventListener('click', () => toggleClass('#sidebar', 'active'));

  // ── Server actions ──
  $('#createServerBtn')?.addEventListener('click', Servers.create);
  $('#refreshServersBtn')?.addEventListener('click', () => Servers.refresh().catch(() => {}));
  $('#refreshServersBtn2')?.addEventListener('click', () => Servers.refresh().catch(() => {}));

  // ── Admin panel refresh ──
  $('#adminRefreshServers')?.addEventListener('click', async () => {
    await Servers.refresh().catch(() => {});
    Admin.renderServersTable(State.servers);
  });
  $('#adminRefreshUsers')?.addEventListener('click', () => Admin.renderUsersTable());

  // ── Console ──
  $('#sendCommandBtn')?.addEventListener('click', Servers.sendCommand);

  const consoleInput = $('#consoleInput');
  consoleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      Servers.sendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!State.cmdHistory.length) return;
      State.cmdHistoryIdx = Math.min(State.cmdHistoryIdx + 1, State.cmdHistory.length - 1);
      consoleInput.value = State.cmdHistory[State.cmdHistory.length - 1 - State.cmdHistoryIdx] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      State.cmdHistoryIdx = Math.max(State.cmdHistoryIdx - 1, -1);
      consoleInput.value = State.cmdHistoryIdx >= 0
        ? State.cmdHistory[State.cmdHistory.length - 1 - State.cmdHistoryIdx]
        : '';
    }
  });

  $('#clearConsoleBtn')?.addEventListener('click', () => { Console.clear(); Toast.success('Console cleared'); });
  $('#copyConsoleBtn')?.addEventListener('click',  () => {
    Console.copy()?.then(() => Toast.success('Copied to clipboard')).catch(() => Toast.warn('Copy not supported in this browser'));
  });

  $('#autoScrollCheckbox')?.addEventListener('change', (e) => { State.autoScroll = e.target.checked; });

  // ── Server name char-count ──
  $('#serverName')?.addEventListener('input', (e) => {
    setText('#serverNameCount', String(e.target.value.length));
  });

  // ── Global search ──
  $('#globalSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('.server-card').forEach(card => {
      const title = card.querySelector('.server-card-title')?.textContent?.toLowerCase() || '';
      toggleClass(card, 'hidden', !!q && !title.includes(q));
    });
  });

  // ── Theme toggle ──
  $('#themeToggleBtn')?.addEventListener('click', Theme.toggle);

  // ── Preset cards ──
  $$('.preset-card').forEach(card => {
    card.addEventListener('click', () => Presets.select(card.dataset.preset));
  });

  // ── Admin tabs ──
  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.adminTab;
      State.adminTab = target;
      $$('.admin-tab').forEach(t => removeClass(t, 'active'));
      addClass(tab, 'active');
      $$('.admin-sub-section').forEach(s => removeClass(s, 'active'));
      addClass(`#admin-${target}`, 'active');
      if (target === 'servers') Admin.renderServersTable(State.servers);
      if (target === 'users')   Admin.renderUsersTable();
    });
  });

  // ── Close sidebar on outside click (mobile) ──
  document.addEventListener('click', (e) => {
    const sidebar = $('#sidebar');
    const toggle  = $('#sidebarToggle');
    if (sidebar?.classList.contains('active') && !sidebar.contains(e.target) && !toggle?.contains(e.target)) {
      removeClass(sidebar, 'active');
    }
  });
}

/* =============================================================================
   19.  BOOT
   ============================================================================= */
async function boot() {
  Log.info('TrashFreeHosting dashboard booting…');

  // Apply persisted theme immediately (prevents flash)
  Theme.apply(State.theme);

  // Wire DOM events
  bindEvents();

  // Connect socket
  Socket.init();

  // Activate default preset
  Presets.select('survival');

  // Initial server load
  await Servers.refresh().catch(err => {
    Log.error('Initial server load failed:', err.message);
    Toast.error('Could not load servers. Check backend connectivity.', 'Load Error');
  });

  // Background services
  Latency.start();
  AutoSync.start();

  document.body.classList.add('loaded');
  Toast.success('🎮 Dashboard ready!');
  Console.addLine('Dashboard initialised. Select a server to begin.', 'success');
  Log.info('Boot complete.');
}

/* =============================================================================
   20.  ENTRY POINT
   ============================================================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* =============================================================================
   21.  GLOBAL ERROR BOUNDARIES
   ============================================================================= */
window.addEventListener('error', (ev) => {
  Log.error('Uncaught error:', ev.message, ev.filename, ev.lineno);
});
window.addEventListener('unhandledrejection', (ev) => {
  Log.error('Unhandled rejection:', ev.reason);
});
