import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

const ROOT_DIR = '/mcservers';
const PAPER_DIR = path.join(ROOT_DIR, 'runtime');
const PAPER_JAR_PATH = path.join(PAPER_DIR, 'paper-latest.jar');
const MAX_RAM_MB = 3072;
const IDLE_SUSPEND_MINUTES = 15;

type ServerStatus = 'running' | 'stopped' | 'starting' | 'error';

export interface MinecraftServer {
  id: string;
  folderPath: string;
  ip: string;
  port: number;
  ramMb: number;
  status: ServerStatus;
  pid?: number;
  createdAt: Date;
  updatedAt: Date;
}

const processes = new Map<string, ChildProcessWithoutNullStreams>();
let mongoClient: MongoClient | null = null;

async function getCollection() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient.db(process.env.MONGODB_DB ?? 'trashfreehosting').collection<MinecraftServer>('servers');
}

function sanitizeServerId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9-_]/g, '');
}

function validateRamMb(ramMb: number) {
  if (!Number.isFinite(ramMb) || ramMb <= 0 || ramMb > MAX_RAM_MB) {
    throw new Error(`RAM must be between 1 and ${MAX_RAM_MB} MB`);
  }
}

async function ensurePaperJar() {
  await fs.mkdir(PAPER_DIR, { recursive: true });
  try {
    await fs.access(PAPER_JAR_PATH);
    return;
  } catch {}

  const projectsRes = await fetch('https://api.papermc.io/v2/projects/paper');
  if (!projectsRes.ok) throw new Error('Failed to query PaperMC project metadata');
  const projectsJson = (await projectsRes.json()) as { versions: string[] };
  const latestVersion = projectsJson.versions.at(-1);
  if (!latestVersion) throw new Error('No PaperMC versions available');

  const buildsRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${latestVersion}`);
  if (!buildsRes.ok) throw new Error('Failed to query PaperMC builds metadata');
  const buildsJson = (await buildsRes.json()) as { builds: number[] };
  const latestBuild = buildsJson.builds.at(-1);
  if (!latestBuild) throw new Error('No PaperMC builds available');

  const jarName = `paper-${latestVersion}-${latestBuild}.jar`;
  const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${latestVersion}/builds/${latestBuild}/downloads/${jarName}`;
  const jarRes = await fetch(downloadUrl);
  if (!jarRes.ok) throw new Error('Failed to download PaperMC jar');
  const jarBuffer = Buffer.from(await jarRes.arrayBuffer());
  await fs.writeFile(PAPER_JAR_PATH, jarBuffer);
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function writeServerFiles(serverId: string, port: number, ramMb: number) {
  const folder = path.join(ROOT_DIR, serverId);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'eula.txt'), 'eula=true\n');
  await fs.writeFile(path.join(folder, 'server.properties'), `server-port=${port}\nmotd=TrashFreeHosting Server ${serverId}\n`);
  await fs.writeFile(path.join(folder, 'start.sh'), `#!/usr/bin/env bash\njava -Xms512M -Xmx${ramMb}M -jar ${PAPER_JAR_PATH} --nogui\n`);
  return folder;
}

export async function createServer(ramMb = 1024) {
  validateRamMb(ramMb);
  await ensurePaperJar();
  const raw = randomUUID();
  const id = sanitizeServerId(raw);
  const port = await findFreePort();
  const folderPath = await writeServerFiles(id, port, ramMb);
  const metadata: MinecraftServer = { id, folderPath, ip: '127.0.0.1', port, ramMb, status: 'stopped', createdAt: new Date(), updatedAt: new Date() };
  const collection = await getCollection();
  await collection.insertOne(metadata);
  return metadata;
}

export async function startServer(id: string) {
  const collection = await getCollection();
  const server = await collection.findOne({ id });
  if (!server) throw new Error('Server not found');
  if (processes.has(id)) return server;
  const child = spawn('java', ['-Xms512M', `-Xmx${server.ramMb}M`, '-jar', PAPER_JAR_PATH, '--nogui'], {
    cwd: server.folderPath,
    shell: false,
    detached: false,
  });
  processes.set(id, child);
  child.on('exit', async () => {
    processes.delete(id);
    await collection.updateOne({ id }, { $set: { status: 'stopped', pid: undefined, updatedAt: new Date() } });
  });
  await collection.updateOne({ id }, { $set: { status: 'running', pid: child.pid, updatedAt: new Date() } });
  return { ...server, status: 'running', pid: child.pid };
}

export async function stopServer(id: string) {
  const proc = processes.get(id);
  if (proc) {
    proc.kill('SIGTERM');
    processes.delete(id);
  }
  const collection = await getCollection();
  await collection.updateOne({ id }, { $set: { status: 'stopped', pid: undefined, updatedAt: new Date() } });
}

export async function deleteServer(id: string) {
  await stopServer(id);
  const collection = await getCollection();
  const server = await collection.findOneAndDelete({ id });
  if (server?.folderPath) {
    await fs.rm(server.folderPath, { recursive: true, force: true });
  }
}

export async function listServers() {
  const collection = await getCollection();
  return collection.find({}).toArray();
}

export function freePlanConfig() {
  return {
    maxRamMb: MAX_RAM_MB,
    autoSuspendIdleMinutes: IDLE_SUSPEND_MINUTES,
    queueSystem: 'placeholder',
  };
}
