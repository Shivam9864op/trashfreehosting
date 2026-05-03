import { randomUUID } from 'node:crypto';

type User = { id: string; email: string; password: string };
type Session = { tokenId: string; userId: string; revoked: boolean };

const usersByEmail = new Map<string, User>();
const sessions = new Map<string, Session>();

export function createUser(email: string, password: string): User {
  const user: User = { id: randomUUID(), email, password };
  usersByEmail.set(email, user);
  return user;
}
export function findUserByEmail(email: string): User | undefined { return usersByEmail.get(email); }
export function createSession(userId: string): Session {
  const s = { tokenId: randomUUID(), userId, revoked: false };
  sessions.set(s.tokenId, s);
  return s;
}
export function rotateSession(oldTokenId: string, userId: string): Session | null {
  const prev = sessions.get(oldTokenId);
  if (!prev || prev.revoked) return null;
  prev.revoked = true;
  const next = createSession(userId);
  return next;
}
export function revokeSession(tokenId: string): void {
  const s = sessions.get(tokenId);
  if (s) s.revoked = true;
}
export function isActiveSession(tokenId: string): boolean {
  const s = sessions.get(tokenId);
  return !!s && !s.revoked;
}
