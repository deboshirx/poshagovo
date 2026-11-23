import { Router } from 'express';
import { db } from '../db.js';
import { createSession, hashPassword, requireAuth, verifyPassword } from '../auth.js';
import { HttpError, str } from '../utils.js';

const router = Router();

// код для регистрации эксперта. Без него любой бы ставил себе галочку «эксперт»
const EXPERT_CODE = process.env.EXPERT_CODE || 'expert2026';

// если гость начал проходить инструкцию, а потом зарегистрировался — забираем его прогресс
function claimGuestRuns(userId, anonId) {
  if (!anonId) return;
  db.prepare('UPDATE runs SET user_id = ? WHERE anon_id = ? AND user_id IS NULL').run(userId, anonId);
}

router.post('/register', (req, res) => {
  const name = str(req.body.name, 60);
  const email = str(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (name.length < 2) throw new HttpError(400, 'Имя слишком короткое');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Проверьте email');
  if (password.length < 6) throw new HttpError(400, 'Пароль должен быть не короче 6 символов');

  let role = 'student';
  if (req.body.role === 'expert') {
    if (req.body.expertCode !== EXPERT_CODE) throw new HttpError(400, 'Неверный код эксперта');
    role = 'expert';
  }

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'Пользователь с таким email уже есть');
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hashPassword(password), role);
  const id = Number(lastInsertRowid);

  claimGuestRuns(id, req.anonId);
  res.status(201).json({ token: createSession(id), user: { id, name, email, role } });
});

router.post('/login', (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Неверный email или пароль');
  }

  claimGuestRuns(user.id, req.anonId);
  res.json({
    token: createSession(user.id),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (req, res) => {
  const token = req.get('authorization').slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.status(204).end();
});

export default router;
