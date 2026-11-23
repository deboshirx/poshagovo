// «Умный» поиск без внешних движков: нормализация, грубый стемминг для русского,
// синонимы/сленг и нечёткое совпадение (опечатки). На сотнях инструкций работает быстро,
// если станет медленно — переезжать на FTS5.

const ENDINGS = [
  'ениями', 'ениях', 'ением', 'ость', 'остью', 'ости',
  'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'иях', 'ться', 'ешь', 'ете', 'ите',
  'ия', 'ие', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ов', 'ев', 'ей', 'ам', 'ям',
  'ах', 'ях', 'ом', 'ем', 'ою', 'ею', 'ую', 'юю', 'ть', 'ти', 'ся',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

export function stem(word) {
  if (!/[а-я]/.test(word) || word.length <= 3) return word;
  for (const end of ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) {
      return word.slice(0, -end.length);
    }
  }
  return word;
}

// как люди пишут в поиске → как это обычно названо в инструкциях
const RAW_SYNONYMS = {
  докер: 'docker',
  комп: 'пк',
  компьютер: 'пк',
  системник: 'пк',
  лаба: 'лабораторная',
  лабораторка: 'лабораторная',
  лабу: 'лабораторная',
  деканат: 'деканат',
  гит: 'git',
  гитхаб: 'github',
  винда: 'windows',
  виндовс: 'windows',
  линукс: 'linux',
  убунту: 'ubuntu',
  видюха: 'видеокарта',
  видеокарту: 'видеокарта',
  мать: 'материнская',
  материнка: 'материнская',
  проц: 'процессор',
  оперативка: 'оперативная',
  ссш: 'ssh',
  ключ: 'ключ',
  справочка: 'справка',
  общага: 'общежитие',
};

const SYNONYMS = Object.fromEntries(
  Object.entries(RAW_SYNONYMS).map(([k, v]) => [stem(k), stem(v)]),
);

const STOP_WORDS = new Set([
  'как', 'что', 'где', 'для', 'это', 'или', 'мне', 'мой', 'все', 'его', 'она', 'они', 'при',
  'про', 'над', 'под', 'без', 'если', 'чтобы', 'нужно', 'надо', 'можно', 'сделать', 'хочу',
  'the', 'and', 'how', 'to',
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9+#]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => {
      const s = stem(w);
      return SYNONYMS[s] ?? s;
    });
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// насколько слово из запроса похоже на слово из текста: 1 — совпало, 0 — мимо
function wordScore(q, word) {
  if (q === word) return 1;
  if (q.length >= 3 && word.startsWith(q)) return 0.8;
  if (q.length >= 4) {
    const allowed = q.length >= 7 ? 2 : 1;
    if (levenshtein(q, word) <= allowed) return 0.6;
  }
  return 0;
}

function fieldScore(queryTokens, fieldTokens) {
  let total = 0;
  let matched = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const w of fieldTokens) {
      best = Math.max(best, wordScore(q, w));
      if (best === 1) break;
    }
    total += best;
    if (best > 0) matched++;
  }
  return { total, matched };
}

const WEIGHTS = { title: 3, tags: 2.5, description: 1.5, step: 1 };

/**
 * guides — список инструкций, stepsByGuide — Map(guideId -> [{title, body}])
 * Возвращает отфильтрованный и отсортированный список, у каждого элемента поле match
 * (где нашлось — чтобы показать пользователю «нашлось в шаге …»).
 */
export function searchGuides(query, guides, stepsByGuide) {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length) return guides;

  const results = [];
  for (const guide of guides) {
    const matchedWords = new Set();
    let score = 0;
    let bestStep = null;

    for (const field of ['title', 'tags', 'description']) {
      const { total } = fieldScore(queryTokens, tokenize(guide[field]));
      score += total * WEIGHTS[field];
    }

    for (const step of stepsByGuide.get(guide.id) || []) {
      const { total, matched } = fieldScore(queryTokens, tokenize(`${step.title} ${step.body}`));
      if (total > 0 && (!bestStep || total > bestStep.total)) {
        bestStep = { title: step.title, total, matched };
      }
    }
    if (bestStep) score += bestStep.total * WEIGHTS.step;

    // считаем, сколько слов запроса вообще нашлось хоть где-то
    const allText = tokenize(
      `${guide.title} ${guide.tags} ${guide.description} ${(stepsByGuide.get(guide.id) || [])
        .map((s) => `${s.title} ${s.body}`)
        .join(' ')}`,
    );
    for (const q of queryTokens) {
      if (allText.some((w) => wordScore(q, w) > 0)) matchedWords.add(q);
    }

    // для длинных запросов прощаем одно ненайденное слово
    const need = queryTokens.length <= 2 ? queryTokens.length : queryTokens.length - 1;
    if (matchedWords.size < need || score === 0) continue;

    const titleHit = fieldScore(queryTokens, tokenize(guide.title)).total > 0;
    results.push({
      ...guide,
      relevance: Math.round(score * 10) / 10,
      match: !titleHit && bestStep ? { step: bestStep.title } : null,
    });
  }

  return results.sort((a, b) => b.relevance - a.relevance || b.usefulness - a.usefulness);
}
