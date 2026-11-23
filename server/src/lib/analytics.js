import { db } from '../db.js';

// прохождение считаем брошенным, если в нём ничего не происходило сутки
const STALE_MS = 24 * 60 * 60 * 1000;

const parseDate = (s) => new Date(s.replace(' ', 'T') + 'Z');

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function guideAnalytics(guideId) {
  const steps = db
    .prepare('SELECT id, position, title, minutes FROM steps WHERE guide_id = ? ORDER BY position')
    .all(guideId);
  const runs = db
    .prepare('SELECT id, max_step, started_at, updated_at, finished_at FROM runs WHERE guide_id = ?')
    .all(guideId);

  const now = Date.now();
  const finished = runs.filter((r) => r.finished_at);
  const abandoned = runs.filter((r) => !r.finished_at && now - parseDate(r.updated_at) > STALE_MS);
  const active = runs.length - finished.length - abandoned.length;

  // длительности шагов — медиана, потому что среднее портят те, кто ушёл пить чай с открытой вкладкой
  const durations = new Map();
  for (const row of db
    .prepare(`
      SELECT e.step_id, e.duration_ms FROM step_events e
      JOIN steps s ON s.id = e.step_id
      WHERE s.guide_id = ? AND e.type = 'complete' AND e.duration_ms IS NOT NULL
    `)
    .all(guideId)) {
    if (!durations.has(row.step_id)) durations.set(row.step_id, []);
    durations.get(row.step_id).push(row.duration_ms);
  }

  const stuck = new Map(
    db
      .prepare(`
        SELECT e.step_id, COUNT(*) AS n FROM step_events e
        JOIN steps s ON s.id = e.step_id
        WHERE s.guide_id = ? AND e.type = 'stuck'
        GROUP BY e.step_id
      `)
      .all(guideId)
      .map((r) => [r.step_id, r.n]),
  );

  const votes = new Map(
    db
      .prepare(`
        SELECT v.step_id, SUM(v.value = 1) AS up, SUM(v.value = -1) AS down
        FROM step_votes v JOIN steps s ON s.id = v.step_id
        WHERE s.guide_id = ? GROUP BY v.step_id
      `)
      .all(guideId)
      .map((r) => [r.step_id, r]),
  );

  const comments = new Map(
    db
      .prepare(`
        SELECT step_id, COUNT(*) AS n, SUM(kind = 'improvement') AS improvements
        FROM comments WHERE guide_id = ? GROUP BY step_id
      `)
      .all(guideId)
      .map((r) => [r.step_id, r]),
  );

  const stepStats = steps.map((step, i) => {
    const reached = runs.filter((r) => r.finished_at || r.max_step >= i).length;
    const leftHere = abandoned.filter((r) => r.max_step === i).length;
    const v = votes.get(step.id) || { up: 0, down: 0 };
    const c = comments.get(step.id) || { n: 0, improvements: 0 };
    const stuckCount = stuck.get(step.id) || 0;
    const medianMs = median(durations.get(step.id) || []);

    return {
      id: step.id,
      position: i,
      title: step.title,
      plannedMinutes: step.minutes,
      reached,
      leftHere,
      dropRate: reached ? leftHere / reached : 0,
      medianMs,
      stuck: stuckCount,
      up: v.up || 0,
      down: v.down || 0,
      comments: c.n,
      improvements: c.improvements || 0,
    };
  });

  // «узкое место» — комбинация: сколько бросают, сколько жмут «застрял»,
  // насколько дольше запланированного и сколько дизлайков
  for (const s of stepStats) {
    const stuckRate = s.reached ? s.stuck / s.reached : 0;
    const negative = s.up + s.down ? s.down / (s.up + s.down) : 0;
    const overtime = s.medianMs ? Math.max(0, s.medianMs / 60000 / s.plannedMinutes - 1) : 0;
    s.problemScore = Math.round(
      (s.dropRate * 50 + Math.min(stuckRate, 1) * 25 + negative * 15 + Math.min(overtime, 1) * 10) * 10,
    ) / 10;
  }

  const bottlenecks = stepStats
    .filter((s) => s.problemScore >= 8 && s.reached >= 3)
    .sort((a, b) => b.problemScore - a.problemScore)
    .slice(0, 3)
    .map((s) => ({ ...s, reasons: explain(s) }));

  // запуски по дням за последние две недели
  const daily = [];
  for (let d = 13; d >= 0; d--) {
    const day = new Date(now - d * 86400000).toISOString().slice(0, 10);
    daily.push({
      day,
      started: runs.filter((r) => r.started_at.startsWith(day)).length,
      finished: finished.filter((r) => r.finished_at.startsWith(day)).length,
    });
  }

  const totalMs = finished.map((r) => parseDate(r.finished_at) - parseDate(r.started_at));

  return {
    summary: {
      runs: runs.length,
      finished: finished.length,
      abandoned: abandoned.length,
      active,
      completionRate: runs.length ? finished.length / runs.length : 0,
      medianTotalMs: median(totalMs),
    },
    steps: stepStats,
    bottlenecks,
    daily,
  };
}

function explain(s) {
  const reasons = [];
  if (s.leftHere) reasons.push(`здесь бросили ${s.leftHere} из ${s.reached} (${Math.round(s.dropRate * 100)}%)`);
  if (s.stuck) reasons.push(`«Не получается» нажимали ${s.stuck} раз`);
  if (s.medianMs && s.medianMs > s.plannedMinutes * 60000 * 1.3) {
    reasons.push(`в среднем ${Math.round(s.medianMs / 60000)} мин вместо ${s.plannedMinutes}`);
  }
  if (s.down > s.up) reasons.push(`«не полезно» отметили чаще, чем «полезно»`);
  return reasons;
}
