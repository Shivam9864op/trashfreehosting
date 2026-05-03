import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../config/db.js';

const ROOT_DIR = '/mcservers';
const PAPER_DIR = path.join(ROOT_DIR, 'runtime');
const PAPER_JAR_PATH = path.join(PAPER_DIR, 'paper-latest.jar');
const MAX_RAM_MB = 3072;
const MAX_FREE_SERVERS = 2;

type ServerStatus = 'running' | 'stopped' | 'starting' | 'error';
export interface MinecraftServer { serverId: string; ownerId: string; name: string; folderPath: string; ip: string; port: number; ramMb: number; status: ServerStatus; pid?: number; createdAt: Date; updatedAt: Date; edition?: string; type?: string; logs?: string[] }

const processes = new Map<string, ChildProcessWithoutNullStreams>();
async function col() { return (await getDb()).collection<MinecraftServer>('servers'); }
const sanitizeName = (n: string) => n.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 32);
const sanitizeId = (raw: string) => raw.replace(/[^a-zA-Z0-9-_]/g, '');

async function ensurePaperJar() { await fs.mkdir(PAPER_DIR, { recursive: true }); try { await fs.access(PAPER_JAR_PATH); } catch { throw new Error('Paper jar missing at /mcservers/runtime/paper-latest.jar'); } }
function findFreePort(): Promise<number> { return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '0.0.0.0', () => { const a = s.address(); if (!a || typeof a === 'string') return reject(new Error('port')); const p = a.port; s.close(() => resolve(p)); }); s.on('error', reject); }); }
async function writeFiles(id: string, port: number) { const folder = path.join(ROOT_DIR, id); await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, 'eula.txt'), 'eula=true\n'); await fs.writeFile(path.join(folder, 'server.properties'), `server-port=${port}\n`); return folder; }

export async function createServer(ownerId: string, payload: { name: string; ramMb: number; edition?: string; type?: string }) {
  if (!payload.name) throw new Error('Server name required');
  if (payload.ramMb < 512 || payload.ramMb > MAX_RAM_MB) throw new Error(`RAM must be between 512 and ${MAX_RAM_MB} MB`);
  const collection = await col();
  const count = await collection.countDocuments({ ownerId });
  if (count >= MAX_FREE_SERVERS) throw new Error('Free plan supports max 2 servers');
  await ensurePaperJar();
  const serverId = sanitizeId(randomUUID());
  const port = await findFreePort();
  const folderPath = await writeFiles(serverId, port);
  const data: MinecraftServer = { serverId, ownerId, name: sanitizeName(payload.name), folderPath, ip: '127.0.0.1', port, ramMb: payload.ramMb, status: 'stopped', createdAt: new Date(), updatedAt: new Date(), edition: payload.edition, type: payload.type, logs: [] };
  await collection.insertOne(data);
  return data;
}

export async function listServers(ownerId: string) { return (await col()).find({ ownerId }).toArray(); }
export async function getServer(ownerId: string, serverId: string) { return (await col()).findOne({ ownerId, serverId }); }
export function getProcess(serverId: string) { return processes.get(serverId); }

export async function startServer(ownerId: string, serverId: string) {
  const collection = await col();
  const server = await collection.findOne({ ownerId, serverId });
  if (!server) throw new Error('Server not found');
  if (processes.has(serverId)) return server;
  const child = spawn('java', ['-Xms512M', `-Xmx${server.ramMb}M`, '-jar', PAPER_JAR_PATH, '--nogui'], { cwd: server.folderPath, shell: false });
  processes.set(serverId, child);
  const pushLog = async (line: string) => await collection.updateOne({ serverId }, { $push: { logs: { $each: [line], $slice: -200 } }, $set: { updatedAt: new Date() } });
  child.stdout.on('data', (d) => void pushLog(String(d)));
  child.stderr.on('data', (d) => void pushLog(String(d)));
  child.on('exit', async () => { processes.delete(serverId); await collection.updateOne({ serverId }, { $set: { status: 'stopped', pid: undefined, updatedAt: new Date() } }); });
  await collection.updateOne({ ownerId, serverId }, { $set: { status: 'running', pid: child.pid, updatedAt: new Date() } });
  return { ...server, status: 'running', pid: child.pid };
}

export async function stopServer(ownerId: string, serverId: string) { const p = processes.get(serverId); if (p) { p.kill('SIGTERM'); processes.delete(serverId); } await (await col()).updateOne({ ownerId, serverId }, { $set: { status: 'stopped', pid: undefined, updatedAt: new Date() } }); }
export async function deleteServer(ownerId: string, serverId: string) { await stopServer(ownerId, serverId); const server = await (await col()).findOneAndDelete({ ownerId, serverId }); if (server?.folderPath) await fs.rm(server.folderPath, { recursive: true, force: true }); }
export const freePlanConfig = () => ({ maxRamMb: MAX_RAM_MB, maxServers: MAX_FREE_SERVERS });
