alert("script loaded");
const API_BASE = 'https://hosting.trashmcpe.com/api';
const SOCKET_BASE = 'https://hosting.trashmcpe.com';

const el = (s) => document.querySelector(s);
const state = { selectedServerId: null, socket: null };

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
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

async function refreshServers() {
  const list = el('[data-server-list]');
  if (!list) return;
  list.innerHTML = '<p>Loading...</p>';
  try {
    const servers = await api('/servers');
    list.innerHTML = '';
    servers.forEach((item) => {
      const s = item.attributes || item;
      const btn = document.createElement('button');
      btn.textContent = `${s.name} (${s.identifier || s.id})`;
      btn.onclick = () => { state.selectedServerId = s.identifier || String(s.id); addLog(`Selected ${btn.textContent}`); };
      list.appendChild(btn);
    });
  } catch (e) { list.innerHTML = `<p class='error'>${e.message}</p>`; }
}

async function createServer() {
  const name = el('[data-server-name]')?.value?.trim();
  const ramMb = Number(el('[data-server-ram]')?.value || 2048);
  if (!name) return addLog('Server name required', 'error');
  addLog('Provisioning server...');
  try {
    const created = await api('/create-server', { method: 'POST', body: JSON.stringify({ name, ramMb }) });
    state.selectedServerId = created.identifier || String(created.id);
    addLog(`Created ${created.name} (${state.selectedServerId})`, 'success');
    refreshServers();
  } catch (e) { addLog(`Create failed: ${e.message}`, 'error'); }
}

function setupSocket() {
  if (!window.io) return;
  state.socket = window.io(SOCKET_BASE, { path: '/socket.io', transports: ['websocket'] });
  state.socket.on('connect', () => addLog('Console socket connected', 'success'));
  state.socket.on('console:line', (msg) => addLog(msg.line));
}

async function runPower(signal) {
  if (!state.selectedServerId) return addLog('Select a server first', 'error');
  const path = signal === 'start' ? '/start-server/' : '/stop-server/';
  await api(path + state.selectedServerId, { method: 'POST' });
  addLog(`${signal} requested`);
}

async function sendCommand() {
  const command = el('[data-console-input]')?.value?.trim();
  if (!command || !state.selectedServerId) return;
  await api(`/console/${state.selectedServerId}`, { method: 'POST', body: JSON.stringify({ command }) });
  addLog(`> ${command}`);
}

document.addEventListener('DOMContentLoaded', () => {
  el('[data-action="create-server"]')?.addEventListener('click', createServer);
  el('[data-action="refresh-servers"]')?.addEventListener('click', refreshServers);
  el('[data-action="start-server"]')?.addEventListener('click', () => runPower('start'));
  el('[data-action="stop-server"]')?.addEventListener('click', () => runPower('stop'));
  el('[data-action="send-command"]')?.addEventListener('click', sendCommand);
  setupSocket();
  refreshServers();
});
