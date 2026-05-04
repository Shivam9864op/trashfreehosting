const API_BASE = 'https://hosting.trashmcpe.com/backend/api';
const SOCKET_BASE = 'https://hosting.trashmcpe.com';

const el = (s) => document.querySelector(s);

const state = {
    selectedServerId: null,
    socket: null
};

function addLog(text, type = 'info') {

    const box = el('[data-console-output]');

    if (!box) return;

    const line = document.createElement('div');

    line.className = `log-${type}`;

    line.textContent = text;

    box.appendChild(line);

    box.scrollTop = box.scrollHeight;
}

async function api(path, options = {}) {

    const response = await fetch(
        `${API_BASE}${path}`,
        {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        }
    );

    if (!response.ok) {

        const text = await response.text();

        throw new Error(text || 'API Error');
    }

    return response.json();
}

function setupSocket() {

    if (!window.io) {

        addLog('Socket.IO failed to load', 'error');

        return;
    }

    state.socket = io(SOCKET_BASE, {
        path: '/socket.io/',
        transports: ['websocket', 'polling']
    });

    state.socket.on('connect', () => {

        addLog('Console socket connected', 'success');

        if (state.selectedServerId) {

            state.socket.emit(
                'console:subscribe',
                state.selectedServerId
            );
        }
    });

    state.socket.on('disconnect', () => {

        addLog('Socket disconnected', 'error');
    });

    state.socket.on('connect_error', (err) => {

        addLog(`Socket Error: ${err.message}`, 'error');
    });

    state.socket.on('console:line', (data) => {

        addLog(data.line || JSON.stringify(data));
    });
}

async function refreshServers() {

    const list = el('[data-server-list]');

    if (!list) return;

    list.innerHTML = 'Loading...';

    try {

        const servers = await api('/servers');

        list.innerHTML = '';

        if (!servers.length) {

            list.innerHTML = '<p>No servers found</p>';

            return;
        }

        servers.forEach((server) => {

            const s = server.attributes || server;

            const id = s.identifier || s.id;

            const btn = document.createElement('button');

            btn.innerText = `${s.name} (${id})`;

            btn.onclick = () => {

                state.selectedServerId = id;

                addLog(`Selected ${s.name}`, 'success');

                if (state.socket) {

                    state.socket.emit(
                        'console:subscribe',
                        String(id)
                    );
                }
            };

            list.appendChild(btn);
        });

    } catch (err) {

        console.error(err);

        list.innerHTML = `<p>${err.message}</p>`;

        addLog(err.message, 'error');
    }
}

async function createServer() {

    const name =
        el('[data-server-name]')?.value?.trim();

    const ramMb =
        Number(
            el('[data-server-ram]')?.value || 1024
        );

    if (!name) {

        addLog('Server name required', 'error');

        return;
    }

    addLog('Creating server...');

    try {

        const created = await api(
            '/create-server',
            {
                method: 'POST',

                body: JSON.stringify({
                    name,
                    ramMb
                })
            }
        );

        state.selectedServerId =
            created.identifier || created.id;

        addLog(
            `Server Created: ${created.name}`,
            'success'
        );

        refreshServers();

    } catch (err) {

        console.error(err);

        addLog(
            `Create Failed: ${err.message}`,
            'error'
        );
    }
}

async function power(action) {

    if (!state.selectedServerId) {

        addLog('Select a server first', 'error');

        return;
    }

    try {

        const endpoint =
            action === 'start'
                ? '/start-server/'
                : '/stop-server/';

        await api(
            endpoint + state.selectedServerId,
            {
                method: 'POST'
            }
        );

        addLog(
            `${action.toUpperCase()} signal sent`,
            'success'
        );

    } catch (err) {

        console.error(err);

        addLog(err.message, 'error');
    }
}

async function sendCommand() {

    const input =
        el('[data-console-input]');

    const command =
        input?.value?.trim();

    if (!command) {

        addLog('Enter command', 'error');

        return;
    }

    if (!state.selectedServerId) {

        addLog('Select a server first', 'error');

        return;
    }

    try {

        await api(
            `/console/${state.selectedServerId}`,
            {
                method: 'POST',

                body: JSON.stringify({
                    command
                })
            }
        );

        addLog(`> ${command}`);

        input.value = '';

    } catch (err) {

        console.error(err);

        addLog(err.message, 'error');
    }
}

document.addEventListener(
    'DOMContentLoaded',
    () => {

        setupSocket();

        refreshServers();

        el('[data-action="create-server"]')
            ?.addEventListener(
                'click',
                createServer
            );

        el('[data-action="refresh-servers"]')
            ?.addEventListener(
                'click',
                refreshServers
            );

        el('[data-action="start-server"]')
            ?.addEventListener(
                'click',
                () => power('start')
            );

        el('[data-action="stop-server"]')
            ?.addEventListener(
                'click',
                () => power('stop')
            );

        el('[data-action="send-command"]')
            ?.addEventListener(
                'click',
                sendCommand
            );
    }
);
