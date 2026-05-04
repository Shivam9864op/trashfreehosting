import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { emitConsole } from '../../sockets/index.js';
const appApi = axios.create({
    baseURL: `${env.PTERO_URL.replace(/\/$/, '')}/api/application`,
    headers: { Authorization: `Bearer ${env.PTERO_API_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 15000,
});
const clientApi = axios.create({
    baseURL: `${env.PTERO_URL.replace(/\/$/, '')}/api/client`,
    headers: { Authorization: `Bearer ${env.PTERO_API_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 15000,
});
const cleanName = (name) => name.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 32);
export async function listServers() { const { data } = await appApi.get('/servers'); return data.data ?? []; }
export async function getServer(id) { const { data } = await appApi.get(`/servers/${id}`); return data.attributes; }
export async function createServer(payload) {
    const name = cleanName(payload.name);
    if (!name)
        throw new Error('Invalid server name');
    if (payload.ramMb < 1024 || payload.ramMb > 12288)
        throw new Error('RAM out of allowed range');
    const existing = await listServers();
    if (existing.some((s) => s.attributes?.name?.toLowerCase() === name.toLowerCase()))
        throw new Error('Duplicate server name');
    const body = {
        name,
        user: env.USER_ID,
        egg: env.EGG_ID,
        docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
        startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
        environment: { EULA: 'TRUE', VERSION: 'LATEST' },
        limits: { memory: payload.ramMb, swap: 0, disk: payload.diskMb ?? 6144, io: 500, cpu: payload.cpu ?? 100 },
        feature_limits: { databases: 1, allocations: 1, backups: 2 },
        allocation: { default: env.ALLOC_ID },
    };
    try {
        const { data } = await appApi.post('/servers', body);
        return data.attributes;
    }
    catch (error) {
        logger.error({ error }, 'Pterodactyl provisioning failed');
        throw error;
    }
}
export async function powerServer(id, signal) {
    try {
        await clientApi.post(`/servers/${id}/power`, { signal });
        emitConsole(id, `[power] ${signal} requested`);
        return { id, signal };
    }
    catch (error) {
        logger.error({ error, id, signal }, 'Pterodactyl power API failed');
        throw error;
    }
}
export async function deleteServer(id) { await appApi.delete(`/servers/${id}`); return { id, deleted: true }; }
export async function sendCommand(id, command) {
    try {
        await clientApi.post(`/servers/${id}/command`, { command });
        emitConsole(id, `> ${command}`);
        return { ok: true };
    }
    catch (error) {
        logger.error({ error, id, command }, 'Pterodactyl command API failed');
        throw error;
    }
}
export async function resources(id) {
    try {
        const { data } = await clientApi.get(`/servers/${id}/resources`);
        emitConsole(id, `[stats] ${JSON.stringify(data.attributes.resources)}`);
        return data.attributes;
    }
    catch (error) {
        logger.error({ error, id }, 'Pterodactyl resources API failed');
        throw error;
    }
}
