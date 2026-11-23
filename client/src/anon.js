// Идентификатор гостя: нужен, чтобы прогресс гостя не терялся и попадал в аналитику автора.
// После регистрации сервер привяжет эти прохождения к аккаунту.

function randomId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  // randomUUID есть только в secure context, а по http://192.168... его нет
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export function getAnonId() {
  let id = localStorage.getItem('anon-id');
  if (!id) {
    id = randomId();
    localStorage.setItem('anon-id', id);
  }
  return id;
}
