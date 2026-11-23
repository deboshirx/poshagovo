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

  // некоторые хостинги (наш RU-CENTER в том числе) режут PATCH на входе,
  // поэтому шлём его как POST с заголовком — сервер подменит метод сам
  let httpMethod = method;
  if (method === 'PATCH') {
    httpMethod = 'POST';
    headers['X-HTTP-Method-Override'] = 'PATCH';
  }

  let res;
  try {
    res = await fetch(import.meta.env.BASE_URL + 'api' + path, {
      method: httpMethod,
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
