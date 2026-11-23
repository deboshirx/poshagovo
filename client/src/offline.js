import { api } from './api';

// ---------- локальный прогресс (на случай, если сервер недоступен) ----------

const progressKey = (guideId) => `progress:${guideId}`;

export function loadLocalProgress(guideId) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(guideId)));
  } catch {
    return null;
  }
}

export function saveLocalProgress(guideId, data) {
  localStorage.setItem(progressKey(guideId), JSON.stringify({ ...data, savedAt: Date.now() }));
}

export function clearLocalProgress(guideId) {
  localStorage.removeItem(progressKey(guideId));
}

// ---------- очередь событий для аналитики ----------
// События пишем сначала в localStorage, потом отправляем. Если сети нет —
// они спокойно полежат до появления интернета.

const QUEUE_KEY = 'pending-events';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

export function trackEvent(runId, event) {
  if (!runId) return;
  const queue = readQueue();
  queue.push({ runId, ...event, at: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-500)));
  flushEvents();
}

let flushing = null;

export function flushEvents() {
  if (flushing) return flushing;
  flushing = doFlush()
    .then((hasMore) => {
      flushing = null;
      // пока шла отправка, в очередь добавились новые события — досылаем
      if (hasMore) return flushEvents();
    })
    .catch(() => {
      flushing = null;
    });
  return flushing;
}

async function doFlush() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) return false;

  const byRun = new Map();
  for (const e of queue) {
    if (!byRun.has(e.runId)) byRun.set(e.runId, []);
    byRun.get(e.runId).push(e);
  }

  const failed = [];
  for (const [runId, events] of byRun) {
    try {
      await api(`/runs/${runId}/events`, { method: 'POST', body: { events } });
    } catch (err) {
      // при ошибке сети пробуем позже, остальные ошибки (403, 404) — выкидываем
      if (err.status === 0) failed.push(...events);
    }
  }

  // пока отправляли, могли добавиться новые события
  const added = readQueue().slice(queue.length);
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...failed, ...added]));
  return added.length > 0 && failed.length === 0;
}

window.addEventListener('online', () => flushEvents());
