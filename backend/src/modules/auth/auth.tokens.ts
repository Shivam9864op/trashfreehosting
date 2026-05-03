import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export type JwtClaims = { sub: string; email: string; tokenId: string };

export function signAccessToken(claims: JwtClaims) {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
}

export function signRefreshToken(claims: JwtClaims) {
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
}

export function verifyRefreshToken(token: string): JwtClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtClaims;
}
