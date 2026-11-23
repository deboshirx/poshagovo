// Помощник для авторов: превращает «простыню» текста в шаги с чек-листами.
// Если задан ANTHROPIC_API_KEY — просим LLM, иначе разбираем эвристиками.
// Эвристики покрывают самый частый случай: человек вставил нумерованный список с форума.

const STEP_START = /^\s*(?:шаг\s*\d+\s*[.:)-]?|step\s*\d+\s*[.:)-]?|\d{1,2}\s*[.)]\s+|#{1,3}\s+)/i;
const BULLET = /^\s*(?:[-*•–]|\[\s?\])\s+/;

function firstSentence(text) {
  const m = text.match(/^(.{10,90}?[.!?:])(\s|$)/);
  return m ? m[1].replace(/[.:]$/, '') : text.slice(0, 80);
}

function estimateMinutes(step) {
  const words = `${step.body} ${step.checklist.join(' ')}`.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.min(60, Math.round(words / 30) + step.checklist.length * 2));
}

function finalize(step) {
  let title = step.title.trim();
  let body = step.body.trim();
  // «Заполните заявление. Укажите вуз…» → заголовок до точки, остальное в описание
  const short = firstSentence(title);
  if (short.length < title.length - 1) {
    body = `${title.slice(short.length).replace(/^[.:!?]\s*/, '')}\n${body}`.trim();
    title = short;
  }
  const result = { title, body, checklist: step.checklist, tip: '' };
  result.minutes = estimateMinutes(result);
  return result;
}

export function splitByRules(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const steps = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current) current.body += '\n';
      continue;
    }
    if (STEP_START.test(line)) {
      current = { title: line.replace(STEP_START, '').trim(), body: '', checklist: [] };
      steps.push(current);
      continue;
    }
    if (!current) {
      // текст до первого номера — пусть будет вводным шагом
      current = { title: firstSentence(line.trim()), body: '', checklist: [] };
      steps.push(current);
      if (current.title !== line.trim()) current.body += line.trim() + '\n';
      continue;
    }
    if (BULLET.test(line)) {
      current.checklist.push(line.replace(BULLET, '').trim());
    } else {
      current.body += line.trim() + '\n';
    }
  }

  // нумерации не нашлось — режем по абзацам
  if (steps.length <= 1) {
    const paragraphs = String(text)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length > 1) {
      return paragraphs.map((p) => {
        const checklist = [];
        const bodyLines = [];
        for (const l of p.split('\n')) {
          if (BULLET.test(l)) checklist.push(l.replace(BULLET, '').trim());
          else bodyLines.push(l.trim());
        }
        const joined = bodyLines.join(' ');
        const title = firstSentence(joined);
        return finalize({ title, body: joined.slice(title.length).replace(/^[.:!?]\s*/, ''), checklist });
      });
    }
  }

  return steps.filter((s) => s.title || s.body).map(finalize);
}

const PROMPT = `Ты помогаешь автору сервиса пошаговых инструкций.
Разбей текст ниже на шаги. Для каждого шага дай короткий заголовок (повелительное наклонение),
пояснение, чек-лист из 1-5 конкретных проверяемых пунктов, совет (может быть пустым) и оценку в минутах.
Ответь ТОЛЬКО JSON-массивом вида:
[{"title": "...", "body": "...", "checklist": ["..."], "tip": "...", "minutes": 5}]

Текст:
`;

export async function splitWithAI(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-haiku-5-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: PROMPT + text }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn('AI split failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const answer = data.content?.find((c) => c.type === 'text')?.text || '';
    const json = answer.slice(answer.indexOf('['), answer.lastIndexOf(']') + 1);
    const steps = JSON.parse(json);
    if (!Array.isArray(steps) || !steps.length) return null;

    return steps.map((s) => ({
      title: String(s.title || '').slice(0, 200),
      body: String(s.body || ''),
      checklist: Array.isArray(s.checklist) ? s.checklist.map(String).slice(0, 10) : [],
      tip: String(s.tip || ''),
      minutes: Number(s.minutes) || 5,
    }));
  } catch (err) {
    console.warn('AI split error:', err.message);
    return null;
  }
}
