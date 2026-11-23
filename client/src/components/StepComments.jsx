import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { timeAgo } from '../utils';
import { RoleBadge } from './ui';

const KIND_LABELS = {
  comment: 'Комментарий',
  question: 'Вопрос',
  improvement: 'Улучшение',
};

const PLACEHOLDERS = {
  comment: 'Поделитесь опытом или подсказкой',
  question: 'Что именно не получилось? Опишите, что видите',
  improvement: 'Что стоит поправить в этом шаге?',
};

export default function StepComments({ step, comments, guideAuthorId, initialKind = 'comment', onAdd, onDelete }) {
  const { user } = useAuth();
  const [kind, setKind] = useState(initialKind);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setKind(initialKind), [initialKind]);

  const list = comments.filter((c) => c.step_id === step.id);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const comment = await api(`/steps/${step.id}/comments`, { method: 'POST', body: { body: text, kind } });
      onAdd(comment);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function remove(id) {
    if (!confirm('Удалить комментарий?')) return;
    try {
      await api(`/comments/${id}`, { method: 'DELETE' });
      onDelete(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="comments">
      {list.length === 0 && <p className="muted">К этому шагу пока нет комментариев.</p>}

      {list.map((c) => (
        <div key={c.id} className={`comment comment-${c.kind}`}>
          <div className="comment-head">
            <b>{c.author_name}</b>
            <RoleBadge role={c.author_role} />
            {c.user_id === guideAuthorId && <span className="role-tag">автор инструкции</span>}
            {c.kind !== 'comment' && <span className={`kind kind-${c.kind}`}>{KIND_LABELS[c.kind]}</span>}
            {c.resolved ? <span className="role-tag">учтено</span> : null}
            <span className="muted">{timeAgo(c.created_at)}</span>
            {user && (user.id === c.user_id || user.id === guideAuthorId) && (
              <button className="link-btn" onClick={() => remove(c.id)}>
                удалить
              </button>
            )}
          </div>
          <p>{c.body}</p>
        </div>
      ))}

      {user ? (
        <form className="comment-form" onSubmit={submit}>
          <div className="segmented">
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <button type="button" key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDERS[kind]}
            rows={3}
            maxLength={2000}
          />
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-small" disabled={sending || !text.trim()}>
            {sending ? 'Отправляем…' : 'Отправить'}
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Войдите</Link>, чтобы оставить комментарий или предложить улучшение.
        </p>
      )}
    </div>
  );
}
