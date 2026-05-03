const API_BASE = 'https://hosting.trashmcpe.com/api';
const SOCKET_BASE = 'https://hosting.trashmcpe.com';

const el = (s) => document.querySelector(s);
const state = { selectedServerId: null, socket: null, reconnectTimer: null };

function showError(message) {
  const box = el('[data-console-output]');
  if (!box) return;
  const p = document.createElement('div');
  p.className = 'log-error';
  p.textContent = `ERROR: ${message}`;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

function addLog(line, type = 'info') {
  const box = el('[data-console-output]');
  if (!box) return;
  const p = document.createElement('div');
  p.className = `log-${type}`;
  p.textContent = line;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('[API] request failed', path, error);
    showError(error.message);
    throw error;
  }
}

function setButtonLoading(selector, loading) {
  const button = el(selector);
  if (!button) return;
  button.disabled = loading;
  button.dataset.loading = loading ? 'true' : 'false';
}

function subscribeConsole(serverId) {
  if (!state.socket || !serverId) return;
  state.socket.emit('console:subscribe', String(serverId));
  addLog(`Subscribed to console:${serverId}`, 'success');
}

async function refreshServers() {
  const list = el('[data-server-list]');
  if (!list) return;
  list.innerHTML = '<p>Loading servers...</p>';

  try {
    const servers = await api('/servers');
    list.innerHTML = '';
    if (!servers.length) {
      list.innerHTML = '<p>No servers found.</p>';
      return;
    }

    servers.forEach((item) => {
      const s = item.attributes || item;
      const serverId = s.identifier || String(s.id);
      const btn = document.createElement('button');
      btn.textContent = `${s.name} (${serverId})`;
      btn.onclick = () => {
        state.selectedServerId = serverId;
        addLog(`Selected ${btn.textContent}`);
        subscribeConsole(serverId);
      };
      list.appendChild(btn);
    });
  } catch (error) {
    list.innerHTML = `<p class="error">Failed to load servers: ${error.message}</p>`;
  }
}

async function createServer() {
  const name = el('[data-server-name]')?.value?.trim();
  const ramMb = Number(el('[data-server-ram]')?.value || 2048);
  if (!name) {
    showError('Server name required');
    return;
  }

  setButtonLoading('[data-action="create-server"]', true);
  addLog('Provisioning server...');
  try {
    const created = await api('/create-server', { method: 'POST', body: JSON.stringify({ name, ramMb }) });
    state.selectedServerId = created.identifier || String(created.id);
    addLog(`Created ${created.name} (${state.selectedServerId})`, 'success');
    subscribeConsole(state.selectedServerId);
    await refreshServers();
  } catch (error) {
    showError(`Create failed: ${error.message}`);
  } finally {
    setButtonLoading('[data-action="create-server"]', false);
  }
}

function setupSocket() {
  if (!window.io) {
    showError('Socket.IO library failed to load');
    return;
  }

  state.socket = window.io(SOCKET_BASE, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  state.socket.on('connect', () => {
    console.log('Socket connected');
    addLog('Console socket connected', 'success');
    if (state.selectedServerId) subscribeConsole(state.selectedServerId);
  });

  state.socket.on('disconnect', (reason) => {
    console.error('[SOCKET] disconnected', reason);
    showError(`Socket disconnected: ${reason}`);
  });

  state.socket.on('connect_error', (err) => {
    console.error('[SOCKET] connect_error', err);
    showError(`Socket connect error: ${err.message}`);
  });

  state.socket.on('console:line', (msg) => addLog(msg.line));
}

async function runPower(signal) {
  if (!state.selectedServerId) {
    showError('Select a server first');
    return;
  }

  const selector = signal === 'start' ? '[data-action="start-server"]' : '[data-action="stop-server"]';
  setButtonLoading(selector, true);
  try {
    const path = signal === 'start' ? '/start-server/' : '/stop-server/';
    await api(path + state.selectedServerId, { method: 'POST' });
    addLog(`${signal} requested`, 'success');
  } catch (error) {
    showError(`${signal} failed: ${error.message}`);
  } finally {
    setButtonLoading(selector, false);
  }
}

async function sendCommand() {
  const input = el('[data-console-input]');
  const command = input?.value?.trim();
  if (!command || !state.selectedServerId) {
    showError('Select a server and enter command');
    return;
  }

  setButtonLoading('[data-action="send-command"]', true);
  try {
    await api(`/console/${state.selectedServerId}`, { method: 'POST', body: JSON.stringify({ command }) });
    addLog(`> ${command}`);
    input.value = '';
  } catch (error) {
    showError(`Command failed: ${error.message}`);
  } finally {
    setButtonLoading('[data-action="send-command"]', false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('API connected');
  el('[data-action="create-server"]')?.addEventListener('click', createServer);
  el('[data-action="refresh-servers"]')?.addEventListener('click', refreshServers);
  el('[data-action="start-server"]')?.addEventListener('click', () => runPower('start'));
  el('[data-action="stop-server"]')?.addEventListener('click', () => runPower('stop'));
  el('[data-action="send-command"]')?.addEventListener('click', sendCommand);

  if (!el('[data-server-list]') || !el('[data-console-output]') || !el('[data-console-input]')) {
    console.error('Missing required frontend hooks');
    showError('Missing required HTML data hooks');
  }

  setupSocket();
  refreshServers();
});
