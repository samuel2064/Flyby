import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  id: string;
  email: string;
  scope: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(plain, salt, 1000, 64, 'sha256')
    .toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const plainHash = crypto
    .pbkdf2Sync(plain, salt, 1000, 64, 'sha256')
    .toString('hex');
  return plainHash === hash;
}

export function signToken(payload: object): string {
  // id should be user id string
  return jwt.sign(
    { ...payload, scope: 'auth' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

export function decodeToken(token?: string): TokenPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function getTokenFromHeader(req: Request): string | null {
  const { authorization } = req.headers;
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

export { JWT_SECRET, JWT_EXPIRES_IN };