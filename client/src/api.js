import { getAnonId } from './anon';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Anon-Id': getAnonId() };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Нет соединения с сервером', 0);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    // 503 отдаёт service worker, когда нет сети и нет кэша
    throw new ApiError(data?.error || `Ошибка ${res.status}`, res.status === 503 ? 0 : res.status);
  }
  return data;
}
