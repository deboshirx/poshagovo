import { Router } from 'express';
import { db, tx } from '../db.js';
import { requireAuth, requireExpert } from '../auth.js';
import { searchGuides } from '../lib/search.js';
import { guideAnalytics } from '../lib/analytics.js';
import { CATEGORIES, HttpError, clamp, notFound, parseJSON, str, toInt } from '../utils.js';

const router = Router();

const LIST_SQL = `
  SELECT g.*, u.name AS author_name, u.role AS author_role,
    p.title AS parent_title, v.name AS verified_by_name,
    (SELECT COUNT(*) FROM steps s WHERE s.guide_id = g.id) AS steps_count,
    (SELECT COALESCE(SUM(minutes), 0) FROM steps s WHERE s.guide_id = g.id) AS minutes,
    (SELECT COUNT(*) FROM runs r WHERE r.guide_id = g.id) AS runs_count,
    (SELECT COUNT(*) FROM runs r WHERE r.guide_id = g.id AND r.finished_at IS NOT NULL) AS finished_count,
    (SELECT AVG(stars) FROM ratings ra WHERE ra.guide_id = g.id) AS rating,
    (SELECT COUNT(*) FROM ratings ra WHERE ra.guide_id = g.id) AS rating_count,
    (SELECT COUNT(*) FROM guides f WHERE f.forked_from = g.id AND f.status = 'published') AS forks_count
  FROM guides g
  JOIN users u ON u.id = g.author_id
  LEFT JOIN guides p ON p.id = g.forked_from
  LEFT JOIN users v ON v.id = g.verified_by
`;

/**
 * Полезность 0..100. Байесовское среднее рейтинга (чтобы одна пятёрка не выводила
 * инструкцию в топ) + доля дошедших до конца.
 */
function withUsefulness(g) {
  const n = g.rating_count;
  const bayes = (3 * 3.5 + (g.rating || 0) * n) / (3 + n);
  const completion = g.runs_count ? g.finished_count / g.runs_count : 0;
  return {
    ...g,
    tags: g.tags ? g.tags.split(',') : [],
    rating: g.rating ? Math.round(g.rating * 10) / 10 : null,
    usefulness: Math.round((bayes / 5) * 70 + completion * 30),
    verified: Boolean(g.verified_by),
  };
}

const SORTS = {
  useful: (a, b) => b.usefulness - a.usefulness,
  popular: (a, b) => b.runs_count - a.runs_count,
  rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.rating_count - a.rating_count,
  new: (a, b) => b.created_at.localeCompare(a.created_at),
  short: (a, b) => a.minutes - b.minutes,
};

function findGuide(id, user) {
  const guide = db.prepare(`${LIST_SQL} WHERE g.id = ?`).get(id);
  // черновики видит только автор
  if (!guide || (guide.status !== 'published' && guide.author_id !== user?.id)) {
    throw notFound('Инструкция не найдена');
  }
  return withUsefulness(guide);
}

function findOwnGuide(id, user) {
  const guide = findGuide(id, user);
  if (guide.author_id !== user.id) throw new HttpError(403, 'Это не ваша инструкция');
  return guide;
}

function loadSteps(guideId) {
  return db
    .prepare('SELECT * FROM steps WHERE guide_id = ? ORDER BY position')
    .all(guideId)
    .map((s) => ({ ...s, checklist: parseJSON(s.checklist, []) }));
}

router.get('/categories', (req, res) => {
  const counts = new Map(
    db
      .prepare(`SELECT category, COUNT(*) AS n FROM guides WHERE status = 'published' GROUP BY category`)
      .all()
      .map((r) => [r.category, r.n]),
  );
  res.json(CATEGORIES.map((c) => ({ ...c, count: counts.get(c.id) || 0 })));
});

router.get('/', (req, res) => {
  const q = str(req.query.q, 200);
  const { category, sort = 'useful', mine } = req.query;

  const where = [];
  const params = [];
  if (mine) {
    if (!req.user) throw new HttpError(401, 'Сначала войдите в аккаунт');
    where.push('g.author_id = ?');
    params.push(req.user.id);
  } else {
    where.push(`g.status = 'published'`);
  }
  if (category && category !== 'all') {
    where.push('g.category = ?');
    params.push(category);
  }

  let guides = db
    .prepare(`${LIST_SQL} WHERE ${where.join(' AND ')}`)
    .all(...params)
    .map(withUsefulness);

  if (q) {
    const stepsByGuide = new Map();
    for (const s of db.prepare('SELECT guide_id, title, body FROM steps').all()) {
      if (!stepsByGuide.has(s.guide_id)) stepsByGuide.set(s.guide_id, []);
      stepsByGuide.get(s.guide_id).push(s);
    }
    guides = searchGuides(q, guides, stepsByGuide);
  } else {
    guides.sort(SORTS[sort] || SORTS.useful);
  }

  res.json(guides);
});

router.get('/:id', (req, res) => {
  const guide = findGuide(toInt(req.params.id), req.user);
  const steps = loadSteps(guide.id);

  const votes = new Map(
    db
      .prepare(`
        SELECT step_id, SUM(value = 1) AS up, SUM(value = -1) AS down
        FROM step_votes WHERE step_id IN (SELECT id FROM steps WHERE guide_id = ?)
        GROUP BY step_id
      `)
      .all(guide.id)
      .map((r) => [r.step_id, r]),
  );
  const myVotes = req.user
    ? new Map(
        db
          .prepare(`
            SELECT step_id, value FROM step_votes
            WHERE user_id = ? AND step_id IN (SELECT id FROM steps WHERE guide_id = ?)
          `)
          .all(req.user.id, guide.id)
          .map((r) => [r.step_id, r.value]),
      )
    : new Map();
  const commentCounts = new Map(
    db
      .prepare('SELECT step_id, COUNT(*) AS n FROM comments WHERE guide_id = ? GROUP BY step_id')
      .all(guide.id)
      .map((r) => [r.step_id, r.n]),
  );

  const forks = db
    .prepare(`
      SELECT g.id, g.title, g.updated_at, u.name AS author_name,
        (SELECT AVG(stars) FROM ratings WHERE guide_id = g.id) AS rating
      FROM guides g JOIN users u ON u.id = g.author_id
      WHERE g.forked_from = ? AND g.status = 'published'
      ORDER BY rating DESC
    `)
    .all(guide.id);

  const myRating = req.user
    ? db.prepare('SELECT stars FROM ratings WHERE guide_id = ? AND user_id = ?').get(guide.id, req.user.id)?.stars ?? null
    : null;

  res.json({
    ...guide,
    steps: steps.map((s) => ({
      ...s,
      up: votes.get(s.id)?.up || 0,
      down: votes.get(s.id)?.down || 0,
      myVote: myVotes.get(s.id) || 0,
      commentsCount: commentCounts.get(s.id) || 0,
    })),
    forks,
    myRating,
  });
});

function readGuideInput(body) {
  const title = str(body.title, 120);
  if (title.length < 3) throw new HttpError(400, 'Название должно быть не короче 3 символов');

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  if (rawSteps.length > 100) throw new HttpError(400, 'Слишком много шагов (максимум 100)');

  const status = body.status === 'published' ? 'published' : 'draft';
  if (status === 'published' && rawSteps.length === 0) {
    throw new HttpError(400, 'Нельзя опубликовать инструкцию без шагов');
  }

  const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
    .map((t) => str(t, 30).toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  return {
    title,
    description: str(body.description, 2000),
    category: CATEGORIES.some((c) => c.id === body.category) ? body.category : 'other',
    tags: [...new Set(tags)].join(','),
    cover: str(body.cover, 8) || '📋',
    difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'easy',
    status,
    steps: rawSteps.map((s, i) => ({
      id: toInt(s.id, null),
      title: str(s.title, 200) || `Шаг ${i + 1}`,
      body: str(s.body, 10000),
      tip: str(s.tip, 500),
      minutes: clamp(toInt(s.minutes, 5), 1, 600),
      checklist: (Array.isArray(s.checklist) ? s.checklist : [])
        .map((c) => str(c, 300))
        .filter(Boolean)
        .slice(0, 30),
    })),
  };
}

// Шаги обновляем по id, а не «удалить всё и вставить заново» — иначе
// потеряются комментарии, голоса и аналитика, которые ссылаются на step_id
function saveSteps(guideId, steps) {
  const existing = new Set(
    db.prepare('SELECT id FROM steps WHERE guide_id = ?').all(guideId).map((r) => r.id),
  );
  const kept = new Set();
  const update = db.prepare(
    'UPDATE steps SET position = ?, title = ?, body = ?, checklist = ?, tip = ?, minutes = ? WHERE id = ?',
  );
  const insert = db.prepare(
    'INSERT INTO steps (guide_id, position, title, body, checklist, tip, minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  steps.forEach((s, position) => {
    const checklist = JSON.stringify(s.checklist);
    if (s.id && existing.has(s.id)) {
      update.run(position, s.title, s.body, checklist, s.tip, s.minutes, s.id);
      kept.add(s.id);
    } else {
      insert.run(guideId, position, s.title, s.body, checklist, s.tip, s.minutes);
    }
  });

  const remove = db.prepare('DELETE FROM steps WHERE id = ?');
  for (const id of existing) if (!kept.has(id)) remove.run(id);
}

router.post('/', requireAuth, (req, res) => {
  const data = readGuideInput(req.body);
  const id = tx(() => {
    const { lastInsertRowid } = db
      .prepare(`
        INSERT INTO guides (author_id, title, description, category, tags, cover, difficulty, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(req.user.id, data.title, data.description, data.category, data.tags, data.cover, data.difficulty, data.status);
    const guideId = Number(lastInsertRowid);
    saveSteps(guideId, data.steps);
    return guideId;
  });
  res.status(201).json({ id });
});

router.put('/:id', requireAuth, (req, res) => {
  const guide = findOwnGuide(toInt(req.params.id), req.user);
  const data = readGuideInput(req.body);
  tx(() => {
    db.prepare(`
      UPDATE guides SET title = ?, description = ?, category = ?, tags = ?, cover = ?,
        difficulty = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(data.title, data.description, data.category, data.tags, data.cover, data.difficulty, data.status, guide.id);
    saveSteps(guide.id, data.steps);
  });
  res.json({ id: guide.id });
});

router.delete('/:id', requireAuth, (req, res) => {
  const guide = findOwnGuide(toInt(req.params.id), req.user);
  db.prepare('DELETE FROM guides WHERE id = ?').run(guide.id);
  res.status(204).end();
});

// Форк: копия чужой (или своей) инструкции в черновики, чтобы сделать улучшенную версию
router.post('/:id/fork', requireAuth, (req, res) => {
  const source = findGuide(toInt(req.params.id), req.user);
  const steps = loadSteps(source.id);

  const id = tx(() => {
    const { lastInsertRowid } = db
      .prepare(`
        INSERT INTO guides (author_id, title, description, category, tags, cover, difficulty, status, forked_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
      `)
      .run(
        req.user.id,
        source.title,
        source.description,
        source.category,
        source.tags.join(','),
        source.cover,
        source.difficulty,
        source.id,
      );
    const newId = Number(lastInsertRowid);
    saveSteps(newId, steps.map((s) => ({ ...s, id: null })));
    return newId;
  });

  res.status(201).json({ id });
});

router.post('/:id/rate', requireAuth, (req, res) => {
  const guide = findGuide(toInt(req.params.id), req.user);
  const stars = toInt(req.body.stars);
  if (stars < 1 || stars > 5) throw new HttpError(400, 'Оценка от 1 до 5');
  if (guide.author_id === req.user.id) throw new HttpError(400, 'Свою инструкцию оценивать нельзя');

  db.prepare(`
    INSERT INTO ratings (guide_id, user_id, stars) VALUES (?, ?, ?)
    ON CONFLICT (guide_id, user_id) DO UPDATE SET stars = excluded.stars, created_at = datetime('now')
  `).run(guide.id, req.user.id, stars);

  const updated = findGuide(guide.id, req.user);
  res.json({ rating: updated.rating, rating_count: updated.rating_count, myRating: stars });
});

// эксперт подтверждает, что инструкция корректная (или снимает отметку)
router.post('/:id/verify', requireAuth, requireExpert, (req, res) => {
  const guide = findGuide(toInt(req.params.id), req.user);
  const verifiedBy = guide.verified_by ? null : req.user.id;
  db.prepare('UPDATE guides SET verified_by = ? WHERE id = ?').run(verifiedBy, guide.id);
  res.json({ verified: Boolean(verifiedBy), verified_by_name: verifiedBy ? req.user.name : null });
});

router.get('/:id/stats', requireAuth, (req, res) => {
  const guide = findOwnGuide(toInt(req.params.id), req.user);
  const improvements = db
    .prepare(`
      SELECT c.id, c.body, c.kind, c.resolved, c.created_at, c.step_id, s.title AS step_title, s.position,
        u.name AS author_name, u.role AS author_role
      FROM comments c
      JOIN steps s ON s.id = c.step_id
      JOIN users u ON u.id = c.user_id
      WHERE c.guide_id = ? AND c.kind IN ('improvement', 'question')
      ORDER BY c.resolved, c.created_at DESC
      LIMIT 50
    `)
    .all(guide.id);

  res.json({
    guide: { id: guide.id, title: guide.title, rating: guide.rating, rating_count: guide.rating_count },
    ...guideAnalytics(guide.id),
    feedback: improvements,
  });
});

export default router;
