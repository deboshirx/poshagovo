export function plural(n, forms) {
  const [one, few, many] = forms;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const pluralN = (n, forms) => `${n} ${plural(n, forms)}`;

export function formatMinutes(min) {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function formatMs(ms) {
  if (ms == null) return '—';
  const min = Math.round(ms / 60000);
  return min < 1 ? '< 1 мин' : formatMinutes(min);
}

export function parseDate(s) {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

export function timeAgo(s) {
  const diff = (Date.now() - parseDate(s)) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return pluralN(Math.floor(diff / 3600), ['час', 'часа', 'часов']) + ' назад';
  if (diff < 86400 * 7) return pluralN(Math.floor(diff / 86400), ['день', 'дня', 'дней']) + ' назад';
  return parseDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export const DIFFICULTY = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Сложно',
};

export const CATEGORIES = [
  { id: 'study', name: 'Учёба' },
  { id: 'docs', name: 'Документы и справки' },
  { id: 'tech', name: 'Железо и техника' },
  { id: 'dev', name: 'Разработка и софт' },
  { id: 'life', name: 'Быт' },
  { id: 'other', name: 'Другое' },
];

export const categoryName = (id) => CATEGORIES.find((c) => c.id === id)?.name || 'Другое';
