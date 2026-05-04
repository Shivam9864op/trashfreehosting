import { randomUUID } from 'node:crypto';
const usersByEmail = new Map();
const sessions = new Map();
export function createUser(email, password) {
    const user = { id: randomUUID(), email, password };
    usersByEmail.set(email, user);
    return user;
}
export function findUserByEmail(email) { return usersByEmail.get(email); }
export function createSession(userId) {
    const s = { tokenId: randomUUID(), userId, revoked: false };
    sessions.set(s.tokenId, s);
    return s;
}
export function rotateSession(oldTokenId, userId) {
    const prev = sessions.get(oldTokenId);
    if (!prev || prev.revoked)
        return null;
    prev.revoked = true;
    const next = createSession(userId);
    return next;
}
export function revokeSession(tokenId) {
    const s = sessions.get(tokenId);
    if (s)
        s.revoked = true;
}
export function isActiveSession(tokenId) {
    const s = sessions.get(tokenId);
    return !!s && !s.revoked;
}
