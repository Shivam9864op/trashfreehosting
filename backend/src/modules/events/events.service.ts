import { getDb } from '../../config/db.js';

export type AuthEventType = 'login' | 'register';

export interface AuthEventInput {
  type: AuthEventType;
  username: string;
  ip: string;
  userAgent: string;
}

export async function recordAuthEvent(input: AuthEventInput) {
  const db = await getDb();
  const events = db.collection('auth_events');
  await events.insertOne({
    type: input.type,
    username: input.username,
    ip: input.ip,
    userAgent: input.userAgent,
    createdAt: new Date(),
  });
  return { ok: true };
}

export async function listRecentAuthEvents(limit = 25) {
  const db = await getDb();
  return db.collection('auth_events')
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function countAuthEvents(type: AuthEventType) {
  const db = await getDb();
  return db.collection('auth_events').countDocuments({ type });
}

export async function distinctUsernames() {
  const db = await getDb();
  return db.collection('auth_events').distinct('username');
}
