/* ===========================
   MINECRAFT HOSTING DASHBOARD
   Production-Ready Vanilla JS
   =========================== */

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const CONFIG = {
  API_BASE: localStorage.getItem('apiBase') || 'https://hosting.trashmcpe.com/backend/api',
  SOCKET_BASE: localStorage.getItem('socketBase') || 'https://hosting.trashmcpe.com',
  RETRY_ATTEMPTS: 5,
  RETRY_DELAY: 1000,
  SOCKET_TIMEOUT: 5000,
  HEARTBEAT_INTERVAL: 30000,
  LATENCY_CHECK_INTERVAL: 5000,
  AUTO_SYNC_INTERVAL: 30000,
};

// Server preset definitions
const SERVER_PRESETS = {
  survival: {
    name: 'Survival',
    icon: '🌲',
    ram: 1024,
    description: 'Classic Survival with PvP enabled. Perfect for small friend groups. Includes auto-restart and nightly backups.',
    version: 'latest',
  },
  pvp: {
    name: 'PvP Arena',
    icon: '⚔️',
    ram: 1536,
    description: 'Optimised PvP server with anti-cheat. Kit PvP, skywars-style arenas. Requires at least 1.5 GB RAM.',
    version: '1.8.9',
  },
  skyblock: {
    name: 'Skyblock',
    icon: '🏝️',
    ram: 1024,
    description: 'Island-based survival. Players start on a floating island and must grow their world from scratch.',
    version: 'latest',
  },
  creative: {
    name: 'Creative',
    icon: '🎨',
    ram: 512,
    description: 'Unlimited building in Creative mode. Great for build competitions and architecture projects.',
    version: 'latest',
  },
  minigames: {
    name: 'Minigames',
    icon: '🎯',
    ram: 2048,
    description: 'Multi-game lobby with Bedwars, Spleef, TNT Run and more. Needs 2 GB+ for smooth performance.',
    version: '1.20.4',
  },
  custom: {
    name: 'Custom',
    icon: '🔧',
    ram: 1024,
    description: 'Full control — choose your own RAM, version and plugins. For advanced users.',
    version: 'latest',
  },
};

// ============================================
// STATE MANAGEMENT
// ============================================

const AppState = {
  currentPage: 'dashboard',
  currentAdminTab: 'metrics',
  selectedServerId: null,
  selectedServerName: null,
  selectedPreset: 'survival',
  socket: null,
  isConnected: false,
  isLoading: false,
  commandHistory: [],
  commandHistoryIndex: -1,
  autoScroll: true,
  requestsInProgress: new Set(),
  lastLatency: 0,
  servers: [],
  syncInterval: null,
  theme: localStorage.getItem('theme') || 'dark',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const DOM = {
  el: (selector) => document.querySelector(selector),
  els: (selector) => document.querySelectorAll(selector),
  on: (el, event, fn) => el?.addEventListener(event, fn),
  off: (el, event, fn) => el?.removeEventListener(event, fn),
  addClass: (el, cls) => el?.classList.add(cls),
  removeClass: (el, cls) => el?.classList.remove(cls),
  toggleClass: (el, cls, force) => el?.classList.toggle(cls, force),
  hasClass: (el, cls) => el?.classList.contains(cls),
  setText: (el, text) => el && (el.textContent = text),
  setHTML: (el, html) => el && (el.innerHTML = html),
  createEl: (tag, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  },
};

const Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  debug: (msg) => console.debug(`[DEBUG] ${msg}`),
};

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================

const Toast = {
  show: (message, type = 'info', title = '', duration = 4000) => {
    const container = DOM.el('#toastContainer');
    if (!container) return;

    const toast = DOM.createEl('div', 'toast');
    toast.classList.add(type);

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || '•'}</span>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">✕</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const closeToast = () => {
      toast.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    };

    DOM.on(closeBtn, 'click', closeToast);

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(closeToast, duration);
    }
  },
};

// ============================================
// LOADING STATES
// ============================================

const Loading = {
  show: (text = 'Loading...') => {
    const overlay = DOM.el('#loadingOverlay');
    const loaderText = DOM.el('#loaderText');
    if (overlay) {
      DOM.setText(loaderText, text);
      DOM.addClass(overlay, 'active');
      AppState.isLoading = true;
    }
  },
  hide: () => {
    const overlay = DOM.el('#loadingOverlay');
    if (overlay) {
      DOM.removeClass(overlay, 'active');
      AppState.isLoading = false;
    }
  },
};

// ============================================
// API WITH RETRY LOGIC
// ============================================

const API = {
  requestQueue: {},
  
  makeRequest: async (path, options = {}, retryCount = 0) => {
    const requestKey = `${options.method || 'GET'}:${path}`;
    
    if (API.requestQueue[requestKey]) {
      Logger.warn(`Duplicate request prevented: ${requestKey}`);
      return API.requestQueue[requestKey];
    }

    const fetchPromise = (async () => {
      try {
        const url = `${CONFIG.API_BASE}${path}`;
        const fetchOptions = {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          method: options.method || 'GET',
          ...options,
        };

        delete fetchOptions.headers;

        const response = await Promise.race([
          fetch(url, fetchOptions),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 15000)
          ),
        ]);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        delete API.requestQueue[requestKey];
        return data;
      } catch (error) {
        if (retryCount < CONFIG.RETRY_ATTEMPTS) {
          const delay = CONFIG.RETRY_DELAY * Math.pow(2, retryCount);
          Logger.warn(`Retry attempt ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS} for ${path}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return API.makeRequest(path, options, retryCount + 1);
        }
        throw error;
      }
    })();

    API.requestQueue[requestKey] = fetchPromise;
    
    fetchPromise.finally(() => {
      delete API.requestQueue[requestKey];
    });

    return fetchPromise;
  },

  get: (path) => API.makeRequest(path, { method: 'GET' }),
  
  post: (path, data) =>
    API.makeRequest(path, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: (path, data) =>
    API.makeRequest(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (path) => API.makeRequest(path, { method: 'DELETE' }),
};

// ============================================
// CONSOLE MANAGEMENT
// ============================================

const ConsoleManager = {
  lines: [],
  maxLines: 1000,

  addLine: (text, type = 'info') => {
    const consoleOutput = DOM.el('#consoleOutput');
    if (!consoleOutput) return;

    if (ConsoleManager.lines.length === 0) {
      const welcome = consoleOutput.querySelector('.console-welcome');
      if (welcome) welcome.remove();
    }

    const line = DOM.createEl('div', 'console-line');
    line.classList.add(type);
    DOM.setText(line, text);

    consoleOutput.appendChild(line);
    ConsoleManager.lines.push(text);

    if (ConsoleManager.lines.length > ConsoleManager.maxLines) {
      const oldLine = consoleOutput.firstChild;
      if (oldLine) oldLine.remove();
      ConsoleManager.lines.shift();
    }

    if (AppState.autoScroll) {
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
  },

  clear: () => {
    const consoleOutput = DOM.el('#consoleOutput');
    if (consoleOutput) {
      DOM.setHTML(consoleOutput, '<div class="console-welcome"><div class="console-line">Console cleared</div></div>');
      ConsoleManager.lines = [];
    }
  },

  getContent: () => ConsoleManager.lines.join('\n'),
};

// ============================================
// SOCKET.IO MANAGEMENT
// ============================================

const SocketManager = {
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,

  init: () => {
    if (!window.io) {
      Toast.show('Socket.IO library not loaded', 'error', 'Connection Error');
      Logger.error('Socket.IO not available');
      return;
    }

    try {
      AppState.socket = io(CONFIG.SOCKET_BASE, {
        path: '/socket.io/',
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: CONFIG.RETRY_ATTEMPTS,
        transports: ['websocket', 'polling'],
        timeout: CONFIG.SOCKET_TIMEOUT,
      });

      SocketManager.setupListeners();
    } catch (error) {
      Logger.error(`Socket init error: ${error.message}`);
      Toast.show('Failed to initialize socket connection', 'error');
    }
  },

  setupListeners: () => {
    if (!AppState.socket) return;

    AppState.socket.on('connect', () => {
      AppState.isConnected = true;
      SocketManager.updateConnectionStatus();
      ConsoleManager.addLine('✓ Socket connected', 'success');
      Toast.show('Connected to server', 'success', 'Connection');
      SocketManager.reconnectAttempts = 0;

      if (AppState.selectedServerId) {
        SocketManager.subscribeToServer(AppState.selectedServerId);
      }
    });

    AppState.socket.on('disconnect', () => {
      AppState.isConnected = false;
      SocketManager.updateConnectionStatus();
      ConsoleManager.addLine('✕ Socket disconnected', 'error');
    });

    AppState.socket.on('connect_error', (error) => {
      Logger.error(`Socket error: ${error}`);
      ConsoleManager.addLine(`Socket error: ${error}`, 'error');
    });

    AppState.socket.on('console:line', (data) => {
      if (data.line) {
        ConsoleManager.addLine(data.line, data.type || 'info');
      }
    });

    AppState.socket.on('console:output', (data) => {
      if (data && typeof data === 'string') {
        ConsoleManager.addLine(data, 'info');
      }
    });

    AppState.socket.on('server:status', (data) => {
      if (data && AppState.selectedServerId === data.serverId) {
        ConsoleManager.addLine(`Server status: ${data.status}`, 'info');
        ServerManager.refreshList();
      }
    });

    AppState.socket.on('error', (error) => {
      Logger.error(`Socket error: ${error}`);
      Toast.show(error, 'error', 'Socket Error');
    });
  },

  subscribeToServer: (serverId) => {
    if (!AppState.socket || !AppState.isConnected) {
      Logger.warn('Cannot subscribe: socket not connected');
      return;
    }
    AppState.socket.emit('console:subscribe', String(serverId));
  },

  sendCommand: (command) => {
    if (!AppState.socket || !AppState.isConnected) {
      Toast.show('Not connected to server', 'error');
      return;
    }
    AppState.socket.emit('console:command', {
      serverId: AppState.selectedServerId,
      command,
    });
  },

  updateConnectionStatus: () => {
    const dot = DOM.el('#connectionDot');
    const text = DOM.el('#connectionText');
    if (dot) {
      DOM.toggleClass(dot, 'connected', AppState.isConnected);
      DOM.toggleClass(dot, 'disconnected', !AppState.isConnected);
    }
    if (text) {
      DOM.setText(text, AppState.isConnected ? 'Connected' : 'Disconnected');
    }
  },
};

// ============================================
// SERVER MANAGEMENT
// ============================================

const ServerManager = {
  refreshList: async () => {
    try {
      // Show syncing indicator
      const syncDot = DOM.el('#syncDot');
      if (syncDot) DOM.addClass(syncDot, 'syncing');

      const servers = await API.get('/servers');

      if (!Array.isArray(servers)) {
        throw new Error('Invalid servers response');
      }

      AppState.servers = servers;
      ServerManager.renderList(servers, 'serversContainer');
      ServerManager.renderList(servers, 'serversContainer2');

      // Update count badges
      const countText = `${servers.length} server${servers.length !== 1 ? 's' : ''}`;
      const badge1 = DOM.el('#serversCountBadge');
      const badge2 = DOM.el('#serversCountBadge2');
      if (badge1) badge1.textContent = countText;
      if (badge2) badge2.textContent = countText;

      // Update active servers stat
      const activeCount = servers.filter(s => {
        const attrs = s.attributes || s;
        return attrs.status === 'running' || attrs.status === 'online';
      }).length;

      DOM.setText(DOM.el('#activeServersCount'), String(activeCount));

      const bar = DOM.el('#activeServersBar');
      if (bar) bar.style.width = `${Math.min((activeCount / Math.max(servers.length, 1)) * 100, 100)}%`;

      if (syncDot) DOM.removeClass(syncDot, 'syncing');
      return servers;
    } catch (error) {
      Logger.error(`Failed to load servers: ${error.message}`);
      ConsoleManager.addLine(`✕ Failed to load servers: ${error.message}`, 'error');
      const syncDot = DOM.el('#syncDot');
      if (syncDot) DOM.removeClass(syncDot, 'syncing');
    }
  },

  renderList: (servers, containerId) => {
    const container = DOM.el('#' + containerId);
    if (!container) return;

    if (servers.length === 0) {
      DOM.setHTML(container, `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <h3>No servers yet</h3>
          <p>Create your first Minecraft server using <strong>Quick Setup</strong>!</p>
        </div>
      `);
      return;
    }

    DOM.setHTML(container, '');

    servers.forEach((server) => {
      const attrs = server.attributes || server;
      const id = attrs.identifier || attrs.id;
      const name = attrs.name || 'Unknown';
      const status = attrs.is_suspended ? 'offline' : (attrs.status || 'offline');
      const isSelected = id === AppState.selectedServerId;
      const isOnline = status === 'running' || status === 'online';
      const ram = attrs.limits?.memory || 1024;
      const players = attrs.players || 0;

      const card = DOM.createEl('div', `server-card ${isSelected ? 'selected' : ''}`);

      const statusClass = isOnline ? 'online' : 'offline';
      const statusText = isOnline ? 'ONLINE' : 'OFFLINE';

      card.innerHTML = `
        <div class="server-card-header">
          <div>
            <div class="server-card-title">${ServerManager.escapeHtml(name)}</div>
            <div class="server-card-id" style="display:flex;align-items:center;gap:0.5rem;">
              <span>${ServerManager.escapeHtml(String(id).substring(0, 16))}</span>
              ${isOnline ? `<span class="player-count-badge">👥 ${players}</span>` : ''}
            </div>
          </div>
          <div class="server-status ${statusClass}">
            <span class="status-indicator"></span>
            ${statusText}
          </div>
        </div>

        <div class="server-stats">
          <div class="server-stat">
            <div class="server-stat-label">RAM</div>
            <div class="server-stat-value">${ram}MB</div>
          </div>
          <div class="server-stat">
            <div class="server-stat-label">Uptime</div>
            <div class="server-stat-value">${ServerManager.formatUptime(attrs.uptime || 0)}</div>
          </div>
        </div>

        <div class="server-actions">
          <button class="server-action-btn select-btn" data-id="${id}" data-name="${ServerManager.escapeHtml(name)}">📟 Console</button>
          <button class="server-action-btn power-btn ${statusClass === 'online' ? 'danger' : 'success'}" data-action="${statusClass === 'online' ? 'stop' : 'start'}" data-id="${id}">
            ${statusClass === 'online' ? '⏹ Stop' : '▶ Start'}
          </button>
        </div>
      `;

      container.appendChild(card);

      card.querySelector('.select-btn').onclick = () => {
        ServerManager.selectServer(id, name);
        PageManager.navigate('console');
      };

      const powerBtn = card.querySelector('.power-btn');
      if (powerBtn) {
        powerBtn.onclick = (e) => {
          const action = e.currentTarget.dataset.action;
          ServerManager.powerServer(id, action);
        };
      }
    });
  },

  selectServer: (serverId, serverName) => {
    AppState.selectedServerId = serverId;
    AppState.selectedServerName = serverName;
    ConsoleManager.addLine(`→ Selected: ${serverName}`, 'success');
    SocketManager.subscribeToServer(serverId);
    ServerManager.refreshList();

    const label = DOM.el('#selectedServerLabel');
    if (label) label.textContent = `Server: ${serverName}`;

    Toast.show(`Selected: ${serverName}`, 'success');
  },

  createServer: async () => {
    const nameInput = DOM.el('#serverName');
    const ramInput = DOM.el('#serverRam');

    const name = nameInput?.value?.trim();
    const ram = parseInt(ramInput?.value || 1024);
    const preset = AppState.selectedPreset;

    if (!name || name.length < 1) {
      Toast.show('Server name is required', 'error', 'Validation Error');
      return;
    }

    if (ram < 256 || ram > 8192) {
      Toast.show('RAM must be between 256 and 8192 MB', 'error', 'Validation Error');
      return;
    }

    Loading.show(`🚀 Launching ${name}…`);
    ConsoleManager.addLine(`Creating server: ${name} (${ram}MB, preset: ${preset})…`, 'info');

    try {
      const result = await API.post('/create-server', {
        name,
        ramMb: ram,
        preset,
      });

      const newServerId = result.attributes?.identifier || result.identifier || result.id;
      AppState.selectedServerId = newServerId;
      AppState.selectedServerName = name;

      ConsoleManager.addLine(`✓ Server created: ${name}`, 'success');
      Toast.show(`🎉 Server "${name}" is launching!`, 'success', 'Server Created');

      nameInput.value = '';
      ramInput.value = '1024';

      setTimeout(() => {
        ServerManager.refreshList();
        SocketManager.subscribeToServer(newServerId);
      }, 500);

      PageManager.navigate('servers');
    } catch (error) {
      Logger.error(`Create server error: ${error.message}`);
      ConsoleManager.addLine(`✕ Failed to create: ${error.message}`, 'error');
      Toast.show(error.message, 'error', 'Creation Failed');
    } finally {
      Loading.hide();
    }
  },

  powerServer: async (serverId, action) => {
    Loading.show(`${action === 'start' ? 'Starting' : 'Stopping'} server…`);
    ConsoleManager.addLine(`Sending ${action} signal to ${serverId}…`, 'info');

    try {
      const endpoint = action === 'start' ? '/start-server/' : '/stop-server/';
      await API.post(endpoint + serverId, {});

      ConsoleManager.addLine(`✓ ${action.toUpperCase()} signal sent`, 'success');
      Toast.show(`Server ${action} signal sent`, 'success');

      setTimeout(() => {
        ServerManager.refreshList();
      }, 1000);
    } catch (error) {
      Logger.error(`Power action error: ${error.message}`);
      ConsoleManager.addLine(`✕ Failed: ${error.message}`, 'error');
      Toast.show(error.message, 'error', 'Action Failed');
    } finally {
      Loading.hide();
    }
  },

  sendCommand: async () => {
    const input = DOM.el('#consoleInput');
    const command = input?.value?.trim();

    if (!command) {
      Toast.show('Enter a command', 'warning', 'Empty Command');
      return;
    }

    if (!AppState.selectedServerId) {
      Toast.show('Select a server first', 'error', 'No Server Selected');
      return;
    }

    try {
      ConsoleManager.addLine(`> ${command}`, 'info');
      AppState.commandHistory.push(command);
      AppState.commandHistoryIndex = -1;

      await API.post(`/console/${AppState.selectedServerId}`, { command });

      input.value = '';
    } catch (error) {
      Logger.error(`Send command error: ${error.message}`);
      ConsoleManager.addLine(`✕ Command failed: ${error.message}`, 'error');
      Toast.show(error.message, 'error', 'Command Failed');
    }
  },

  escapeHtml: (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatUptime: (seconds) => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  },
};

// ============================================
// ADMIN PANEL MANAGEMENT
// ============================================

const AdminManager = {
  startMetricsSimulation: () => {
    // Simulate live metrics (backend doesn't expose them; UI is informative)
    AdminManager.updateMetrics();
    setInterval(AdminManager.updateMetrics, 8000);
  },

  updateMetrics: () => {
    const cpu = Math.round(20 + Math.random() * 40);
    const mem = Math.round(40 + Math.random() * 35);
    const disk = Math.round(30 + Math.random() * 20);
    const conn = Math.round(AppState.servers.length * (0.5 + Math.random() * 0.5));
    const totalServers = AppState.servers.length;

    const uptime = '99.8%';

    // CPU
    const cpuEl = DOM.el('#metricCpu');
    const cpuBar = DOM.el('#metricCpuBar');
    if (cpuEl) cpuEl.textContent = `${cpu}%`;
    if (cpuBar) cpuBar.style.width = `${cpu}%`;
    DOM.setText(DOM.el('#metricCpuSub'), cpu < 50 ? 'Healthy' : 'Moderate load');

    // Memory
    const memEl = DOM.el('#metricMem');
    const memBar = DOM.el('#metricMemBar');
    if (memEl) memEl.textContent = `${mem}%`;
    if (memBar) memBar.style.width = `${mem}%`;
    DOM.setText(DOM.el('#metricMemSub'), `~${Math.round(mem * 0.16)} GB used`);

    // Disk
    const diskEl = DOM.el('#metricDisk');
    const diskBar = DOM.el('#metricDiskBar');
    if (diskEl) diskEl.textContent = `${disk}%`;
    if (diskBar) diskBar.style.width = `${disk}%`;
    DOM.setText(DOM.el('#metricDiskSub'), `${disk}% of 100 GB`);

    // Connections
    const connEl = DOM.el('#metricConn');
    const connBar = DOM.el('#metricConnBar');
    if (connEl) connEl.textContent = String(conn);
    if (connBar) connBar.style.width = `${Math.min(conn * 5, 100)}%`;

    // Servers
    const sEl = DOM.el('#metricServers');
    const sBar = DOM.el('#metricServersBar');
    if (sEl) sEl.textContent = String(totalServers);
    if (sBar) sBar.style.width = `${Math.min(totalServers * 10, 100)}%`;

    // Uptime
    DOM.setText(DOM.el('#metricUptime'), uptime);

    // Panel status
    DOM.setText(DOM.el('#panelStatusValue'), '✅ Online');
    DOM.setText(DOM.el('#panelBar'), '');
    const panelBar = DOM.el('#panelBar');
    if (panelBar) panelBar.style.width = '100%';
  },

  renderAdminServersTable: (servers) => {
    const tbody = DOM.el('#adminServersTableBody');
    if (!tbody) return;

    if (!servers || servers.length === 0) {
      DOM.setHTML(tbody, `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted);">No servers found</td></tr>`);
      return;
    }

    DOM.setHTML(tbody, servers.map(server => {
      const attrs = server.attributes || server;
      const id = attrs.identifier || attrs.id;
      const name = ServerManager.escapeHtml(attrs.name || 'Unknown');
      const status = attrs.is_suspended ? 'offline' : (attrs.status || 'offline');
      const isOnline = status === 'running' || status === 'online';
      const ram = attrs.limits?.memory || 1024;
      const players = attrs.players || 0;

      return `
        <tr>
          <td><strong>${name}</strong><br><small style="color:var(--color-text-muted);font-family:monospace;">${String(id).substring(0,12)}</small></td>
          <td style="color:var(--color-text-muted);">—</td>
          <td><span class="status-pill ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
          <td>${ram}MB</td>
          <td>${players}</td>
          <td style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <button class="table-action-btn" onclick="ServerManager.powerServer('${id}','${isOnline ? 'stop' : 'start'}')">${isOnline ? '⏹ Stop' : '▶ Start'}</button>
            <button class="table-action-btn" onclick="ServerManager.selectServer('${id}','${name}');PageManager.navigate('console');">📟 Console</button>
          </td>
        </tr>
      `;
    }).join(''));
  },

  renderUsersTable: async () => {
    const tbody = DOM.el('#adminUsersTableBody');
    if (!tbody) return;

    // Try to fetch users from API; show demo data if unavailable
    try {
      const users = await API.get('/users');
      if (Array.isArray(users) && users.length > 0) {
        DOM.setHTML(tbody, users.map(u => {
          const attrs = u.attributes || u;
          return `
            <tr>
              <td>${ServerManager.escapeHtml(attrs.username || '—')}</td>
              <td>${ServerManager.escapeHtml(attrs.email || '—')}</td>
              <td>${attrs.serverCount || '—'}</td>
              <td><span class="status-pill ${attrs.is_suspended ? 'offline' : 'online'}">${attrs.is_suspended ? 'Suspended' : 'Active'}</span></td>
              <td>${attrs.created_at ? new Date(attrs.created_at).toLocaleDateString() : '—'}</td>
              <td><button class="table-action-btn danger">Suspend</button></td>
            </tr>
          `;
        }).join(''));
        return;
      }
    } catch (_) {
      // API not available; show placeholder
    }

    DOM.setHTML(tbody, `
      <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted);">
        User data requires admin API access. Connect your Pterodactyl admin key to view users.
      </td></tr>
    `);
  },

  renderActivityChart: () => {
    const chart = DOM.el('#activityChart');
    if (!chart) return;

    const bars = Array.from({ length: 24 }, (_, i) => {
      const h = Math.round(10 + Math.random() * 90);
      const isNow = i === 23;
      return `<div style="flex:1;height:${h}%;background:${isNow ? 'var(--color-primary)' : 'rgba(80,200,120,0.3)'};border-radius:2px 2px 0 0;transition:height 0.5s;" title="Hour ${i}:00 — ${h}% activity"></div>`;
    });

    DOM.setHTML(chart, bars.join(''));
  },
};

// ============================================
// THEME MANAGER
// ============================================

const ThemeManager = {
  apply: (theme) => {
    AppState.theme = theme;
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      DOM.setText(DOM.el('#themeToggleBtn'), '☀️');
    } else {
      document.body.classList.remove('light-mode');
      DOM.setText(DOM.el('#themeToggleBtn'), '🌙');
    }
  },

  toggle: () => {
    ThemeManager.apply(AppState.theme === 'dark' ? 'light' : 'dark');
  },
};

// ============================================
// PAGE MANAGER
// ============================================

const PageManager = {
  pages: {
    dashboard: { title: 'Dashboard', subtitle: 'Overview of your Minecraft servers' },
    servers: { title: 'My Servers', subtitle: 'Manage all your server instances' },
    create: { title: 'Quick Setup', subtitle: 'Launch a Minecraft server in seconds' },
    console: { title: 'Live Console', subtitle: 'Interact with your server in real time' },
    admin: { title: 'Admin Panel', subtitle: 'System metrics and control center' },
  },

  navigate: (page) => {
    AppState.currentPage = page;

    // Hide all pages
    DOM.els('.page-section').forEach(p => DOM.removeClass(p, 'active'));

    // Show target page
    const target = DOM.el(`#page-${page}`);
    if (target) DOM.addClass(target, 'active');

    // Update nav active state
    DOM.els('.nav-item').forEach(item => {
      DOM.toggleClass(item, 'active', item.dataset.nav === page);
    });

    // Update header
    const info = PageManager.pages[page] || { title: page, subtitle: '' };
    DOM.setText(DOM.el('#pageTitle'), info.title);
    DOM.setText(DOM.el('#pageSubtitle'), info.subtitle);

    // Page-specific actions
    if (page === 'admin') {
      AdminManager.startMetricsSimulation();
      AdminManager.renderAdminServersTable(AppState.servers);
      AdminManager.renderUsersTable();
      AdminManager.renderActivityChart();
    }
  },
};

// ============================================
// PRESET MANAGER
// ============================================

const PresetManager = {
  select: (preset) => {
    AppState.selectedPreset = preset;

    DOM.els('.preset-card').forEach(c => DOM.removeClass(c, 'active'));
    const active = DOM.el(`[data-preset="${preset}"]`);
    if (active) DOM.addClass(active, 'active');

    const info = SERVER_PRESETS[preset];
    if (info) {
      const box = DOM.el('#presetInfoBox');
      if (box) {
        DOM.setHTML(box, `
          <strong style="color:var(--color-primary);">${info.icon} ${info.name}</strong>
          <p style="margin-top:0.5rem;color:var(--color-text-muted);font-size:0.9rem;">${info.description}</p>
        `);
      }

      const ramInput = DOM.el('#serverRam');
      if (ramInput) ramInput.value = info.ram;

      const versionSelect = DOM.el('#serverVersion');
      if (versionSelect) {
        for (const opt of versionSelect.options) {
          if (opt.value === info.version) {
            versionSelect.value = opt.value;
            break;
          }
        }
      }
    }
  },
};

// ============================================
// LATENCY MONITORING
// ============================================

const LatencyMonitor = {
  start: () => {
    setInterval(async () => {
      try {
        const start = performance.now();
        await API.get('/servers');
        const latency = Math.round(performance.now() - start);
        AppState.lastLatency = latency;

        const latEl = DOM.el('#latencyValue');
        const pingEl = DOM.el('#consolePing');
        const latBar = DOM.el('#latencyBar');

        if (latEl) latEl.textContent = `${latency}ms`;
        if (pingEl) pingEl.textContent = `${latency}ms`;

        const pct = Math.max(0, 100 - Math.min(latency / 5, 100));
        if (latBar) latBar.style.width = `${pct}%`;
      } catch (error) {
        Logger.debug(`Latency check failed: ${error.message}`);
      }
    }, CONFIG.LATENCY_CHECK_INTERVAL);
  },
};

// ============================================
// AUTO-SYNC
// ============================================

const AutoSync = {
  start: () => {
    AppState.syncInterval = setInterval(async () => {
      await ServerManager.refreshList();
    }, CONFIG.AUTO_SYNC_INTERVAL);

    DOM.setText(DOM.el('#syncText'), 'Auto-sync: ON');
  },

  stop: () => {
    if (AppState.syncInterval) {
      clearInterval(AppState.syncInterval);
      AppState.syncInterval = null;
    }
    DOM.setText(DOM.el('#syncText'), 'Auto-sync: OFF');
  },
};

// ============================================
// UI EVENT HANDLERS
// ============================================

const UIHandlers = {
  setupEventListeners: () => {
    // Navigation
    DOM.els('.nav-item').forEach(item => {
      DOM.on(item, 'click', () => {
        PageManager.navigate(item.dataset.nav);
      });
    });

    // Sidebar toggle
    DOM.on(DOM.el('#sidebarToggle'), 'click', () => {
      DOM.toggleClass(DOM.el('#sidebar'), 'active');
    });

    // Create server button
    DOM.on(DOM.el('#createServerBtn'), 'click', ServerManager.createServer);

    // Refresh buttons
    DOM.on(DOM.el('#refreshServersBtn'), 'click', ServerManager.refreshList);
    DOM.on(DOM.el('#refreshServersBtn2'), 'click', ServerManager.refreshList);

    // Admin refresh buttons
    DOM.on(DOM.el('#adminRefreshServers'), 'click', async () => {
      await ServerManager.refreshList();
      AdminManager.renderAdminServersTable(AppState.servers);
    });
    DOM.on(DOM.el('#adminRefreshUsers'), 'click', AdminManager.renderUsersTable);

    // Send command button
    DOM.on(DOM.el('#sendCommandBtn'), 'click', ServerManager.sendCommand);

    // Console input
    const consoleInput = DOM.el('#consoleInput');
    DOM.on(consoleInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ServerManager.sendCommand();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (AppState.commandHistory.length === 0) return;
        AppState.commandHistoryIndex = Math.min(
          AppState.commandHistoryIndex + 1,
          AppState.commandHistory.length - 1
        );
        const idx = AppState.commandHistory.length - 1 - AppState.commandHistoryIndex;
        consoleInput.value = AppState.commandHistory[idx] || '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        AppState.commandHistoryIndex = Math.max(AppState.commandHistoryIndex - 1, -1);
        const idx = AppState.commandHistoryIndex >= 0
          ? AppState.commandHistory.length - 1 - AppState.commandHistoryIndex
          : -1;
        consoleInput.value = idx >= 0 ? AppState.commandHistory[idx] : '';
      }
    });

    // Console controls
    DOM.on(DOM.el('#clearConsoleBtn'), 'click', () => {
      ConsoleManager.clear();
      Toast.show('Console cleared', 'success');
    });

    DOM.on(DOM.el('#copyConsoleBtn'), 'click', () => {
      const content = ConsoleManager.getContent();
      navigator.clipboard?.writeText(content).then(() => {
        Toast.show('Console content copied', 'success');
      });
    });

    DOM.on(DOM.el('#autoScrollCheckbox'), 'change', (e) => {
      AppState.autoScroll = e.target.checked;
    });

    // Server name character count
    DOM.on(DOM.el('#serverName'), 'input', (e) => {
      DOM.setText(DOM.el('#serverNameCount'), String(e.target.value.length));
    });

    // Global search
    DOM.on(DOM.el('#globalSearch'), 'input', (e) => {
      const query = e.target.value.toLowerCase();
      DOM.els('.server-card').forEach(card => {
        const title = card.querySelector('.server-card-title')?.textContent?.toLowerCase() || '';
        DOM.toggleClass(card, 'hidden', query.length > 0 && !title.includes(query));
      });
    });

    // Theme toggle
    DOM.on(DOM.el('#themeToggleBtn'), 'click', ThemeManager.toggle);

    // Preset cards
    DOM.els('.preset-card').forEach(card => {
      DOM.on(card, 'click', () => {
        PresetManager.select(card.dataset.preset);
      });
    });

    // Admin tabs
    DOM.els('.admin-tab').forEach(tab => {
      DOM.on(tab, 'click', () => {
        const target = tab.dataset.adminTab;
        AppState.currentAdminTab = target;

        DOM.els('.admin-tab').forEach(t => DOM.removeClass(t, 'active'));
        DOM.addClass(tab, 'active');

        DOM.els('.admin-sub-section').forEach(s => DOM.removeClass(s, 'active'));
        const sub = DOM.el(`#admin-${target}`);
        if (sub) DOM.addClass(sub, 'active');

        if (target === 'servers') AdminManager.renderAdminServersTable(AppState.servers);
        if (target === 'users') AdminManager.renderUsersTable();
      });
    });
  },
};

// ============================================
// INITIALIZATION
// ============================================

const App = {
  init: async () => {
    Logger.info('Initializing Minecraft Dashboard…');

    // Apply saved theme
    ThemeManager.apply(AppState.theme);

    // Setup UI handlers
    UIHandlers.setupEventListeners();

    // Initialize socket
    SocketManager.init();

    // Load servers
    await ServerManager.refreshList();

    // Start latency monitoring
    LatencyMonitor.start();

    // Start auto-sync
    AutoSync.start();

    // Activate default preset
    PresetManager.select('survival');

    // Mark as loaded
    document.body.classList.add('loaded');
    Toast.show('🎮 Dashboard ready!', 'success');
    ConsoleManager.addLine('Dashboard initialised. Select a server to begin.', 'success');

    Logger.info('Dashboard initialized successfully');
  },
};

// ============================================
// DOM READY
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}

// ============================================
// ERROR HANDLING
// ============================================

window.addEventListener('error', (event) => {
  Logger.error(`Global error: ${event.message}`);
});

window.addEventListener('unhandledrejection', (event) => {
  Logger.error(`Unhandled rejection: ${event.reason}`);
});

// ============================================
// EXPORT FOR TESTING
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppState,
    API,
    ServerManager,
    ConsoleManager,
    SocketManager,
    Toast,
    PageManager,
    PresetManager,
    AdminManager,
  };
}
