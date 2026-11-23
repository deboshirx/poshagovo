import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, clamp, notFound, parseJSON, toInt, toSqlDate } from '../utils.js';

const router = Router();

const EVENT_TYPES = new Set(['enter', 'complete', 'stuck']);

const formatRun = (run) => ({ ...run, checked: parseJSON(run.checked, {}) });

function getOwnRun(req, id) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  if (!run) throw notFound('Прохождение не найдено');
  const isMine =
    (req.user && run.user_id === req.user.id) || (req.anonId && run.anon_id === req.anonId);
  if (!isMine) throw new HttpError(403, 'Это чужое прохождение');
  return run;
}

const stepsCount = (guideId) =>
  db.prepare('SELECT COUNT(*) AS n FROM steps WHERE guide_id = ?').get(guideId).n;

// Начать или продолжить прохождение. Если незаконченное уже есть — отдаём его
router.post('/', (req, res) => {
  if (!req.user && !req.anonId) throw new HttpError(400, 'Нет идентификатора пользователя');

  const guideId = toInt(req.body.guideId);
  const guide = db.prepare('SELECT id, status, author_id FROM guides WHERE id = ?').get(guideId);
  if (!guide || (guide.status !== 'published' && guide.author_id !== req.user?.id)) {
    throw notFound('Инструкция не найдена');
  }

  if (!req.body.restart) {
    const active = db
      .prepare(`
        SELECT * FROM runs
        WHERE guide_id = ? AND finished_at IS NULL
          AND (user_id = ? OR (user_id IS NULL AND anon_id = ?))
        ORDER BY id DESC LIMIT 1
      `)
      .get(guideId, req.user?.id ?? -1, req.anonId ?? '');
    if (active) return res.json(formatRun(active));
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO runs (guide_id, user_id, anon_id) VALUES (?, ?, ?)')
    .run(guideId, req.user?.id ?? null, req.anonId);
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(lastInsertRowid));
  res.status(201).json(formatRun(run));
});

router.get('/mine', requireAuth, (req, res) => {
  // последнее прохождение по каждой инструкции
  const runs = db
    .prepare(`
      SELECT r.*, g.title, g.cover,
        (SELECT COUNT(*) FROM steps s WHERE s.guide_id = g.id) AS steps_count
      FROM runs r JOIN guides g ON g.id = r.guide_id
      WHERE r.id IN (SELECT MAX(id) FROM runs WHERE user_id = ? GROUP BY guide_id)
      ORDER BY r.updated_at DESC
    `)
    .all(req.user.id);
  res.json(runs.map(formatRun));
});

router.patch('/:id', (req, res) => {
  const run = getOwnRun(req, toInt(req.params.id));
  if (run.finished_at) return res.json(formatRun(run));

  const total = stepsCount(run.guide_id);
  const current = clamp(toInt(req.body.currentStep, run.current_step), 0, Math.max(0, total - 1));
  const checked =
    req.body.checked && typeof req.body.checked === 'object'
      ? JSON.stringify(req.body.checked).slice(0, 20000)
      : run.checked;

  db.prepare(`
    UPDATE runs SET current_step = ?, max_step = MAX(max_step, ?), checked = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(current, current, checked, run.id);

  res.json(formatRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id)));
});

// События приходят пачкой — клиент копит их офлайн и досылает, когда появится сеть
router.post('/:id/events', (req, res) => {
  const run = getOwnRun(req, toInt(req.params.id));
  const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 200) : [];

  const stepIds = new Set(
    db.prepare('SELECT id FROM steps WHERE guide_id = ?').all(run.guide_id).map((s) => s.id),
  );
  const insert = db.prepare(
    'INSERT INTO step_events (run_id, step_id, type, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  let saved = 0;
  for (const e of events) {
    const stepId = toInt(e.stepId);
    if (!stepIds.has(stepId) || !EVENT_TYPES.has(e.type)) continue;

    const at = new Date(e.at);
    const createdAt = Number.isNaN(at.getTime()) || at > new Date() ? new Date() : at;
    // больше часа на шаг — скорее забытая вкладка, обрезаем
    const duration = e.durationMs == null ? null : clamp(toInt(e.durationMs), 0, 3600000);

    insert.run(run.id, stepId, e.type, duration, toSqlDate(createdAt));
    saved++;
  }

  db.prepare(`UPDATE runs SET updated_at = datetime('now') WHERE id = ?`).run(run.id);
  res.json({ saved });
});

router.post('/:id/finish', (req, res) => {
  const run = getOwnRun(req, toInt(req.params.id));
  const last = Math.max(0, stepsCount(run.guide_id) - 1);
  db.prepare(`
    UPDATE runs SET finished_at = COALESCE(finished_at, datetime('now')), current_step = ?, max_step = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(last, last, run.id);
  res.json(formatRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id)));
});

export default router;
