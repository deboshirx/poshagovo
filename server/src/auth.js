import crypto from 'node:crypto';
import { db } from './db.js';
import { HttpError, str } from './utils.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

const userByToken = db.prepare(`
  SELECT u.id, u.name, u.email, u.role
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);

export function loadUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = token ? (userByToken.get(token) ?? null) : null;
  // гости тоже могут проходить инструкции — их прогресс привязан к anon id из localStorage
  req.anonId = str(req.get('x-anon-id'), 64) || null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Сначала войдите в аккаунт');
  next();
}

export function requireExpert(req, res, next) {
  if (req.user?.role !== 'expert') throw new HttpError(403, 'Доступно только экспертам');
  next();
}
