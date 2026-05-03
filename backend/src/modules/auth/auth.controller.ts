import { Request, Response } from 'express';
import { createSession, createUser, findUserByEmail, isActiveSession, revokeSession, rotateSession } from './auth.store.js';
import { JwtClaims, signAccessToken, signRefreshToken, verifyRefreshToken } from './auth.tokens.js';

function issue(userId: string, email: string, tokenId: string) {
  const claims: JwtClaims = { sub: userId, email, tokenId };
  return { accessToken: signAccessToken(claims), refreshToken: signRefreshToken(claims) };
}

export function register(req: Request, res: Response) {
  const { email, password } = req.body;
  if (findUserByEmail(email)) return res.status(409).json({ message: 'User already exists' });
  const user = createUser(email, password);
  const session = createSession(user.id);
  return res.status(201).json(issue(user.id, user.email, session.tokenId));
}
export function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || user.password !== password) return res.status(401).json({ message: 'Invalid credentials' });
  const session = createSession(user.id);
  return res.json(issue(user.id, user.email, session.tokenId));
}
export function refresh(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    const claims = verifyRefreshToken(refreshToken);
    if (!isActiveSession(claims.tokenId)) return res.status(401).json({ message: 'Refresh token revoked' });
    const next = rotateSession(claims.tokenId, claims.sub);
    if (!next) return res.status(401).json({ message: 'Invalid session' });
    return res.json(issue(claims.sub, claims.email, next.tokenId));
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
}
export function logout(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;
    const claims = verifyRefreshToken(refreshToken);
    revokeSession(claims.tokenId);
    return res.status(204).send();
  } catch {
    return res.status(204).send();
  }
}
