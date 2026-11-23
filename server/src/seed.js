import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { toSqlDate } from './utils.js';
import { guides, sampleComments, users } from './seed-data.js';

const DEMO_PASSWORD = 'demo1234';

const EXTRA_NAMES = [
  'Даша К.', 'Никита', 'Полина Орлова', 'Сергей', 'Алина', 'Тимур Х.',
  'Вика', 'Егор Белов', 'Катя', 'Денис', 'Оля М.', 'Рома',
];

// свой маленький PRNG, чтобы демо-статистика была одинаковой при каждом сиде
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function seed() {
  const random = rng(42);
  const pick = (arr) => arr[Math.floor(random() * arr.length)];

  tx(() => {
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const hash = hashPassword(DEMO_PASSWORD);
    const userIds = new Map();

    for (const u of users) {
      userIds.set(u.email, Number(insertUser.run(u.name, u.email, hash, u.role).lastInsertRowid));
    }
    EXTRA_NAMES.forEach((name, i) => {
      const email = `student${i + 1}@poshagovo.ru`;
      userIds.set(email, Number(insertUser.run(name, email, hash, 'student').lastInsertRowid));
    });
    const allUserIds = [...userIds.values()];
    const experts = users.filter((u) => u.role === 'expert').map((u) => userIds.get(u.email));

    const insertGuide = db.prepare(`
      INSERT INTO guides (author_id, title, description, category, tags, cover, difficulty, status, verified_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
    `);
    const insertStep = db.prepare(`
      INSERT INTO steps (guide_id, position, title, body, checklist, tip, minutes) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertRun = db.prepare(`
      INSERT INTO runs (guide_id, user_id, anon_id, current_step, max_step, checked, started_at, updated_at, finished_at)
      VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?)
    `);
    const insertEvent = db.prepare(
      'INSERT INTO step_events (run_id, step_id, type, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertRating = db.prepare('INSERT OR IGNORE INTO ratings (guide_id, user_id, stars, created_at) VALUES (?, ?, ?, ?)');
    const insertVote = db.prepare('INSERT OR IGNORE INTO step_votes (step_id, user_id, value) VALUES (?, ?, ?)');
    const insertComment = db.prepare(
      'INSERT INTO comments (guide_id, step_id, user_id, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const created = [];
    const now = Date.now();

    guides.forEach((g, gi) => {
      const authorId = userIds.get(g.author);
      const createdAt = toSqlDate(new Date(now - (40 - gi * 3) * 86400000));
      const verifier = g.verified ? experts.find((id) => id !== authorId) ?? null : null;
      const guideId = Number(
        insertGuide.run(authorId, g.title, g.description, g.category, g.tags, g.cover, g.difficulty, verifier, createdAt, createdAt)
          .lastInsertRowid,
      );
      const stepIds = g.steps.map((s, i) =>
        Number(insertStep.run(guideId, i, s.title, s.body, JSON.stringify(s.checklist), s.tip, s.minutes).lastInsertRowid),
      );
      created.push({ guideId, stepIds });

      // имитация прохождений: на «трудном» шаге чаще застревают и бросают
      const runsCount = 25 + Math.floor(random() * 40);
      for (let r = 0; r < runsCount; r++) {
        const isGuest = random() < 0.4;
        const userId = isGuest ? null : pick(allUserIds.filter((id) => id !== authorId));
        let t = now - Math.floor(random() * 30 * 86400000);
        const startedAt = toSqlDate(new Date(t));
        const events = [];
        let maxStep = 0;
        let finished = true;

        for (let i = 0; i < g.steps.length; i++) {
          const hard = i === g.hardStep;
          maxStep = i;
          events.push([stepIds[i], 'enter', null, t]);

          if (random() < (hard ? 0.35 : 0.05)) events.push([stepIds[i], 'stuck', null, t + 60000]);
          if (random() < (hard ? 0.2 : 0.035)) {
            finished = false;
            t += 120000;
            break;
          }

          const planned = g.steps[i].minutes * 60000;
          const duration = Math.round(planned * (0.5 + random() * (hard ? 2.2 : 1.1)));
          t += duration;
          events.push([stepIds[i], 'complete', duration, t]);
        }

        const runId = Number(
          insertRun.run(
            guideId,
            userId,
            isGuest ? `seed-guest-${gi}-${r}` : null,
            maxStep,
            maxStep,
            startedAt,
            toSqlDate(new Date(t)),
            finished ? toSqlDate(new Date(t)) : null,
          ).lastInsertRowid,
        );
        for (const [stepId, type, duration, at] of events) {
          insertEvent.run(runId, stepId, type, duration, toSqlDate(new Date(at)));
        }

        if (finished && userId) {
          const stars = random() < 0.75 ? 5 - Math.floor(random() * 2) : 3 - Math.floor(random() * 2);
          insertRating.run(guideId, userId, stars, toSqlDate(new Date(t)));
        }
        if (userId) {
          stepIds.slice(0, maxStep + 1).forEach((stepId, i) => {
            if (random() < 0.3) {
              const negative = random() < (i === g.hardStep ? 0.55 : 0.1);
              insertVote.run(stepId, userId, negative ? -1 : 1);
            }
          });
        }
      }
    });

    sampleComments.forEach((c, i) => {
      const { guideId, stepIds } = created[c.guide];
      const at = toSqlDate(new Date(now - (sampleComments.length - i) * 3600000 * 7));
      insertComment.run(guideId, stepIds[c.step], userIds.get(c.user), c.body, c.kind, at);
    });
  });

  console.log(`Готово. Демо-вход: demo@poshagovo.ru / ${DEMO_PASSWORD} (автор: artem@poshagovo.ru)`);
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed();
}
