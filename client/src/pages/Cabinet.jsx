import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { StarsView } from '../components/Stars';
import { ErrorBox, Loader, ProgressBar, RoleBadge } from '../components/ui';
import { timeAgo } from '../utils';

export default function Cabinet() {
  const { user } = useAuth();
  const [tab, setTab] = useState('guides');
  const [guides, setGuides] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/guides?mine=1&sort=new').then(setGuides).catch(setError);
    api('/runs/mine').then(setRuns).catch(setError);
  }, []);

  async function remove(guide) {
    if (!confirm(`Удалить «${guide.title}»? Вместе с ней удалятся комментарии и статистика.`)) return;
    try {
      await api(`/guides/${guide.id}`, { method: 'DELETE' });
      setGuides((list) => list.filter((g) => g.id !== guide.id));
    } catch (err) {
      alert(err.message);
    }
  }

  const published = guides?.filter((g) => g.status === 'published') || [];
  const totalRuns = published.reduce((s, g) => s + g.runs_count, 0);

  return (
    <div className="cabinet">
      <div className="cabinet-head">
        <div>
          <h1>
            {user.name} <RoleBadge role={user.role} />
          </h1>
          <p className="muted">
            {published.length} опубликовано · {totalRuns} прохождений ваших инструкций
          </p>
        </div>
        <Link to="/me/new" className="btn btn-primary">
          + Новая инструкция
        </Link>
      </div>

      <div className="tabs">
        <button className={tab === 'guides' ? 'active' : ''} onClick={() => setTab('guides')}>
          Мои инструкции {guides && <span className="chip-count">{guides.length}</span>}
        </button>
        <button className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}>
          Прохожу {runs && <span className="chip-count">{runs.length}</span>}
        </button>
      </div>

      <ErrorBox error={error} />

      {tab === 'guides' && (
        <>
          {!guides && <Loader />}
          {guides?.length === 0 && (
            <div className="empty-state">
              <h2>Вы ещё ничего не написали</h2>
              <p className="muted">Знаете, как сделать что-то, на чём другие спотыкаются? Поделитесь.</p>
              <Link to="/me/new" className="btn btn-primary">Написать первую инструкцию</Link>
            </div>
          )}
          {guides?.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Инструкция</th>
                    <th>Статус</th>
                    <th>Прохождений</th>
                    <th>До конца</th>
                    <th>Оценка</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {guides.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <Link to={`/g/${g.id}`} className="table-title">
                          {g.title}
                        </Link>
                        <div className="muted small">
                          {g.steps_count} шагов · изменено {timeAgo(g.updated_at)}
                          {g.forked_from && ' · форк'}
                        </div>
                      </td>
                      <td>
                        {g.status === 'published' ? (
                          <span>опубликована</span>
                        ) : (
                          <span className="accent">черновик</span>
                        )}
                      </td>
                      <td>{g.runs_count}</td>
                      <td>{g.runs_count ? `${Math.round((g.finished_count / g.runs_count) * 100)}%` : '—'}</td>
                      <td>
                        <StarsView value={g.rating} count={g.rating_count} />
                      </td>
                      <td className="table-actions">
                        <Link to={`/me/guides/${g.id}/stats`} className="btn btn-small">Статистика</Link>
                        <Link to={`/me/guides/${g.id}/edit`} className="btn btn-small">Изменить</Link>
                        <button className="btn btn-small btn-danger" onClick={() => remove(g)}>Удалить</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'runs' && (
        <>
          {!runs && <Loader />}
          {runs?.length === 0 && <p className="muted">Вы пока ничего не проходили. <Link to="/">Загляните в каталог</Link>.</p>}
          <div className="runs-list">
            {runs?.map((r) => (
              <Link key={r.id} to={r.finished_at ? `/g/${r.guide_id}` : `/g/${r.guide_id}/run`} className="card run-item">
                <div className="run-item-body">
                  <b>{r.title}</b>
                  <ProgressBar value={r.finished_at ? 1 : r.current_step / Math.max(1, r.steps_count)} />
                  <span className="muted small">
                    {r.finished_at
                      ? `Пройдено ${timeAgo(r.finished_at)}`
                      : `Шаг ${r.current_step + 1} из ${r.steps_count} · ${timeAgo(r.updated_at)}`}
                  </span>
                </div>
                <span className="btn btn-small">{r.finished_at ? 'Открыть' : 'Продолжить'}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
