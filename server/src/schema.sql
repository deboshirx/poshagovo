CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'expert')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'other',
  tags        TEXT NOT NULL DEFAULT '',
  cover       TEXT NOT NULL DEFAULT '📋',
  difficulty  TEXT NOT NULL DEFAULT 'easy',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  forked_from INTEGER REFERENCES guides(id) ON DELETE SET NULL,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- checklist хранится json-массивом строк, отдельная таблица тут не нужна
CREATE TABLE IF NOT EXISTS steps (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id  INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL,
  body      TEXT NOT NULL DEFAULT '',
  checklist TEXT NOT NULL DEFAULT '[]',
  tip       TEXT NOT NULL DEFAULT '',
  minutes   INTEGER NOT NULL DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_steps_guide ON steps(guide_id, position);

-- одно прохождение инструкции пользователем (или гостем по anon_id)
CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id     INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  anon_id      TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  max_step     INTEGER NOT NULL DEFAULT 0,
  checked      TEXT NOT NULL DEFAULT '{}',
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_guide ON runs(guide_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_anon ON runs(anon_id);

-- enter / complete / stuck — из этого считается аналитика по шагам
CREATE TABLE IF NOT EXISTS step_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id     INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  duration_ms INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_step ON step_events(step_id, type);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id   INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  step_id    INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'improvement', 'question')),
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_guide ON comments(guide_id);

CREATE TABLE IF NOT EXISTS step_votes (
  step_id INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value   INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (step_id, user_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  guide_id   INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guide_id, user_id)
);
