import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, notFound, str, toInt } from '../utils.js';

const router = Router();

const KINDS = ['comment', 'improvement', 'question'];

const COMMENT_SQL = `
  SELECT c.*, u.name AS author_name, u.role AS author_role
  FROM comments c JOIN users u ON u.id = c.user_id
`;

function findStep(stepId) {
  const step = db
    .prepare(`
      SELECT s.id, s.guide_id, g.status, g.author_id
      FROM steps s JOIN guides g ON g.id = s.guide_id
      WHERE s.id = ?
    `)
    .get(stepId);
  if (!step) throw notFound('Шаг не найден');
  return step;
}

router.get('/guides/:id/comments', (req, res) => {
  const comments = db
    .prepare(`${COMMENT_SQL} WHERE c.guide_id = ? ORDER BY c.created_at`)
    .all(toInt(req.params.id));
  res.json(comments);
});

router.post('/steps/:id/comments', requireAuth, (req, res) => {
  const step = findStep(toInt(req.params.id));
  if (step.status !== 'published' && step.author_id !== req.user.id) throw notFound('Шаг не найден');

  const body = str(req.body.body, 2000);
  if (body.length < 2) throw new HttpError(400, 'Комментарий пустой');
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'comment';

  const { lastInsertRowid } = db
    .prepare('INSERT INTO comments (guide_id, step_id, user_id, body, kind) VALUES (?, ?, ?, ?, ?)')
    .run(step.guide_id, step.id, req.user.id, body, kind);

  res.status(201).json(db.prepare(`${COMMENT_SQL} WHERE c.id = ?`).get(Number(lastInsertRowid)));
});

// автор инструкции отмечает предложение как учтённое
router.patch('/comments/:id', requireAuth, (req, res) => {
  const comment = db
    .prepare('SELECT c.id, g.author_id FROM comments c JOIN guides g ON g.id = c.guide_id WHERE c.id = ?')
    .get(toInt(req.params.id));
  if (!comment) throw notFound('Комментарий не найден');
  if (comment.author_id !== req.user.id) throw new HttpError(403, 'Только автор инструкции');

  db.prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(req.body.resolved ? 1 : 0, comment.id);
  res.json(db.prepare(`${COMMENT_SQL} WHERE c.id = ?`).get(comment.id));
});

router.delete('/comments/:id', requireAuth, (req, res) => {
  const comment = db
    .prepare('SELECT c.id, c.user_id, g.author_id FROM comments c JOIN guides g ON g.id = c.guide_id WHERE c.id = ?')
    .get(toInt(req.params.id));
  if (!comment) throw notFound('Комментарий не найден');
  if (comment.user_id !== req.user.id && comment.author_id !== req.user.id) {
    throw new HttpError(403, 'Нельзя удалить чужой комментарий');
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.status(204).end();
});

// «полезно / не полезно» для шага. value = 1, -1 или 0 (снять голос)
router.post('/steps/:id/vote', requireAuth, (req, res) => {
  const step = findStep(toInt(req.params.id));
  const value = toInt(req.body.value);

  if (value === 0) {
    db.prepare('DELETE FROM step_votes WHERE step_id = ? AND user_id = ?').run(step.id, req.user.id);
  } else if (value === 1 || value === -1) {
    db.prepare(`
      INSERT INTO step_votes (step_id, user_id, value) VALUES (?, ?, ?)
      ON CONFLICT (step_id, user_id) DO UPDATE SET value = excluded.value
    `).run(step.id, req.user.id, value);
  } else {
    throw new HttpError(400, 'value должен быть 1, -1 или 0');
  }

  const counts = db
    .prepare('SELECT SUM(value = 1) AS up, SUM(value = -1) AS down FROM step_votes WHERE step_id = ?')
    .get(step.id);
  res.json({ up: counts.up || 0, down: counts.down || 0, myVote: value });
});

export default router;
