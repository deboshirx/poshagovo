export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (message = 'Не найдено') => new HttpError(404, message);

export function str(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function parseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// sqlite хранит даты как 'YYYY-MM-DD HH:MM:SS' в UTC
export function toSqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export const CATEGORIES = [
  { id: 'study', name: 'Учёба' },
  { id: 'docs', name: 'Документы и справки' },
  { id: 'tech', name: 'Железо и техника' },
  { id: 'dev', name: 'Разработка и софт' },
  { id: 'life', name: 'Быт' },
  { id: 'other', name: 'Другое' },
];
