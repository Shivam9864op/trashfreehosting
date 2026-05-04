/* ===========================
   PREMIUM DASHBOARD SCRIPT
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
};

// ============================================
// STATE MANAGEMENT
// ============================================

const AppState = {
  selectedServerId: null,
  selectedServerName: null,
  socket: null,
  isConnected: false,
  isLoading: false,
  commandHistory: [],
  commandHistoryIndex: -1,
  autoScroll: true,
  requestsInProgress: new Set(),
  lastLatency: 0,
  servers: [],
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
  toggleClass: (el, cls) => el?.classList.toggle(cls),
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
    
    // Prevent duplicate requests
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

        // Remove headers from options to avoid duplication
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

    // Remove welcome message on first real log
    if (ConsoleManager.lines.length === 0) {
      const welcome = consoleOutput.querySelector('.console-welcome');
      if (welcome) welcome.remove();
    }

    const line = DOM.createEl('div', 'console-line');
    line.classList.add(type);
    DOM.setText(line, text);

    consoleOutput.appendChild(line);
    ConsoleManager.lines.push(text);

    // Limit console size
    if (ConsoleManager.lines.length > ConsoleManager.maxLines) {
      const oldLine = consoleOutput.firstChild;
      if (oldLine) oldLine.remove();
      ConsoleManager.lines.shift();
    }

    // Auto-scroll
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
      ConsoleManager.addLine('Fetching servers...', 'info');
      const servers = await API.get('/servers');

      if (!Array.isArray(servers)) {
        throw new Error('Invalid servers response');
      }

      AppState.servers = servers;
      ServerManager.renderList(servers);
      ConsoleManager.addLine(`✓ Loaded ${servers.length} servers`, 'success');
      Toast.show(`Loaded ${servers.length} servers`, 'success');
    } catch (error) {
      Logger.error(`Failed to load servers: ${error.message}`);
      ConsoleManager.addLine(`✕ Failed to load servers: ${error.message}`, 'error');
      Toast.show(error.message, 'error', 'Failed to Load Servers');
      ServerManager.renderEmpty();
    }
  },

  renderList: (servers) => {
    const container = DOM.el('#serversContainer');
    if (!container) return;

    if (servers.length === 0) {
      ServerManager.renderEmpty();
      return;
    }

    DOM.setHTML(container, '');
    DOM.el('#serversCountBadge').textContent = `${servers.length} server${servers.length !== 1 ? 's' : ''}`;

    servers.forEach((server) => {
      const attrs = server.attributes || server;
      const id = attrs.identifier || attrs.id;
      const name = attrs.name || 'Unknown';
      const status = attrs.is_suspended ? 'offline' : (attrs.status || 'offline');
      const isSelected = id === AppState.selectedServerId;

      const card = DOM.createEl('div', `server-card ${isSelected ? 'selected' : ''}`);

      const statusClass = status === 'running' || status === 'online' ? 'online' : 'offline';
      const statusText = status === 'running' || status === 'online' ? 'ONLINE' : 'OFFLINE';

      card.innerHTML = `
        <div class="server-card-header">
          <div>
            <div class="server-card-title">${ServerManager.escapeHtml(name)}</div>
            <div class="server-card-id">${ServerManager.escapeHtml(String(id).substring(0, 16))}</div>
          </div>
          <div class="server-status ${statusClass}">
            <span class="status-indicator"></span>
            ${statusText}
          </div>
        </div>

        <div class="server-stats">
          <div class="server-stat">
            <div class="server-stat-label">Memory</div>
            <div class="server-stat-value">${attrs.limits?.memory || 1024}MB</div>
          </div>
          <div class="server-stat">
            <div class="server-stat-label">Uptime</div>
            <div class="server-stat-value">${ServerManager.formatUptime(attrs.uptime || 0)}</div>
          </div>
        </div>

        <div class="server-actions">
          <button class="server-action-btn" data-action="select-server" data-id="${id}">Select</button>
          <button class="server-action-btn" data-action="power-${statusClass === 'online' ? 'stop' : 'start'}" data-id="${id}">
            ${statusClass === 'online' ? 'Stop' : 'Start'}
          </button>
        </div>
      `;

      container.appendChild(card);

      // Event listeners
      card.querySelector('[data-action="select-server"]').onclick = () => {
        ServerManager.selectServer(id, name);
      };

      const powerBtn = card.querySelector(`[data-action^="power-"]`);
      if (powerBtn) {
        powerBtn.onclick = (e) => {
          const action = e.target.dataset.action.split('-')[1];
          ServerManager.powerServer(id, action);
        };
      }
    });
  },

  renderEmpty: () => {
    const container = DOM.el('#serversContainer');
    if (container) {
      DOM.setHTML(container, `
        <div class="empty-state">
          <div class="empty-icon">🎮</div>
          <h3>No servers yet</h3>
          <p>Create your first Minecraft server to get started</p>
        </div>
      `);
    }
    DOM.el('#serversCountBadge').textContent = '0 servers';
  },

  selectServer: (serverId, serverName) => {
    AppState.selectedServerId = serverId;
    AppState.selectedServerName = serverName;
    ConsoleManager.addLine(`→ Selected: ${serverName}`, 'success');
    SocketManager.subscribeToServer(serverId);
    ServerManager.refreshList();
    Toast.show(`Selected: ${serverName}`, 'success');
  },

  createServer: async () => {
    const nameInput = DOM.el('#serverName');
    const ramInput = DOM.el('#serverRam');

    const name = nameInput?.value?.trim();
    const ram = parseInt(ramInput?.value || 1024);

    if (!name || name.length < 1) {
      Toast.show('Server name is required', 'error', 'Validation Error');
      return;
    }

    if (ram < 256 || ram > 8192) {
      Toast.show('RAM must be between 256 and 8192 MB', 'error', 'Validation Error');
      return;
    }

    Loading.show('Creating server...');
    ConsoleManager.addLine(`Creating server: ${name} (${ram}MB)...`, 'info');

    try {
      const result = await API.post('/create-server', {
        name,
        ramMb: ram,
      });

      const newServerId = result.attributes?.identifier || result.identifier || result.id;
      AppState.selectedServerId = newServerId;
      AppState.selectedServerName = name;

      ConsoleManager.addLine(`✓ Server created: ${name}`, 'success');
      Toast.show(`Server ${name} created successfully`, 'success', 'Server Created');

      DOM.setText(nameInput, '');
      DOM.setText(ramInput, '1024');

      setTimeout(() => {
        ServerManager.refreshList();
        SocketManager.subscribeToServer(newServerId);
      }, 500);
    } catch (error) {
      Logger.error(`Create server error: ${error.message}`);
      ConsoleManager.addLine(`✕ Failed to create: ${error.message}`, 'error');
      Toast.show(error.message, 'error', 'Creation Failed');
    } finally {
      Loading.hide();
    }
  },

  powerServer: async (serverId, action) => {
    Loading.show(`${action === 'start' ? 'Starting' : 'Stopping'} server...`);
    ConsoleManager.addLine(`Sending ${action} signal...`, 'info');

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

      DOM.setText(input, '');
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
        DOM.setText(DOM.el('#consolePing'), `${latency}ms`);
      } catch (error) {
        Logger.debug(`Latency check failed: ${error.message}`);
      }
    }, CONFIG.LATENCY_CHECK_INTERVAL);
  },
};

// ============================================
// UI EVENT HANDLERS
// ============================================

const UIHandlers = {
  setupEventListeners: () => {
    // Navigation
    const navItems = DOM.els('.nav-item');
    navItems.forEach((item) => {
      DOM.on(item, 'click', (e) => {
        navItems.forEach((ni) => DOM.removeClass(ni, 'active'));
        DOM.addClass(item, 'active');
      });
    });

    // Sidebar toggle
    const sidebarToggle = DOM.el('#sidebarToggle');
    const sidebar = DOM.el('#sidebar');
    DOM.on(sidebarToggle, 'click', () => {
      DOM.toggleClass(sidebar, 'active');
    });

    // Create server button
    DOM.on(DOM.el('#createServerBtn'), 'click', ServerManager.createServer);

    // Refresh servers
    DOM.on(DOM.el('#refreshServersBtn'), 'click', ServerManager.refreshList);

    // Send command button
    DOM.on(DOM.el('#sendCommandBtn'), 'click', ServerManager.sendCommand);

    // Console input - Enter to send
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
        DOM.setText(consoleInput, AppState.commandHistory[idx] || '');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        AppState.commandHistoryIndex = Math.max(AppState.commandHistoryIndex - 1, -1);
        const idx = AppState.commandHistoryIndex >= 0
          ? AppState.commandHistory.length - 1 - AppState.commandHistoryIndex
          : -1;
        DOM.setText(consoleInput, idx >= 0 ? AppState.commandHistory[idx] : '');
      }
    });

    // Console controls
    DOM.on(DOM.el('#clearConsoleBtn'), 'click', () => {
      ConsoleManager.clear();
      Toast.show('Console cleared', 'success');
    });

    DOM.on(DOM.el('#copyConsoleBtn'), 'click', () => {
      const content = ConsoleManager.getContent();
      navigator.clipboard.writeText(content).then(() => {
        Toast.show('Console content copied', 'success');
      });
    });

    DOM.on(DOM.el('#autoScrollCheckbox'), 'change', (e) => {
      AppState.autoScroll = e.target.checked;
    });

    // Server name character count
    const serverNameInput = DOM.el('#serverName');
    DOM.on(serverNameInput, 'input', (e) => {
      const count = e.target.value.length;
      DOM.setText(DOM.el('#serverNameCount'), String(count));
    });

    // Search functionality (placeholder)
    const searchInput = DOM.el('.search-input');
    DOM.on(searchInput, 'input', (e) => {
      const query = e.target.value.toLowerCase();
      const cards = DOM.els('.server-card');
      cards.forEach((card) => {
        const title = card.querySelector('.server-card-title').textContent.toLowerCase();
        const matches = title.includes(query);
        DOM.toggleClass(card, 'hidden', !matches && query.length > 0);
      });
    });
  },
};

// ============================================
// INITIALIZATION
// ============================================

const App = {
  init: async () => {
    Logger.info('Initializing Premium Dashboard...');

    // Setup UI
    UIHandlers.setupEventListeners();

    // Initialize socket
    SocketManager.init();

    // Load servers
    await ServerManager.refreshList();

    // Start latency monitoring
    LatencyMonitor.start();

    // Mark as loaded
    document.body.classList.add('loaded');
    Toast.show('Dashboard initialized', 'success');
    ConsoleManager.addLine('Dashboard ready', 'success');

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
  Toast.show(event.message, 'error', 'Error');
});

window.addEventListener('unhandledrejection', (event) => {
  Logger.error(`Unhandled rejection: ${event.reason}`);
  Toast.show(String(event.reason), 'error', 'Error');
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
  };
}
