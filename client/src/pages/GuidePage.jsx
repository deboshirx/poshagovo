import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { loadLocalProgress } from '../offline';
import { StarsInput, StarsView } from '../components/Stars';
import { CopyButton, ErrorBox, Loader, ProgressBar, RoleBadge } from '../components/ui';
import { DIFFICULTY, categoryName, formatMinutes, plural, pluralN, timeAgo } from '../utils';

export default function GuidePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setGuide(null);
    setError(null);
    api(`/guides/${id}`).then(setGuide).catch(setError);
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (!guide) return <Loader />;

  const isAuthor = user?.id === guide.author_id;
  const local = loadLocalProgress(id);
  const inProgress = local && local.index > 0;
  const embedCode = `<iframe src="${window.location.origin}/embed/${guide.id}" width="100%" height="620" style="border:0;border-radius:12px" title="${guide.title.replace(/"/g, '&quot;')}"></iframe>`;

  async function run(action) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const fork = () =>
    run(async () => {
      if (!user) return navigate('/login', { state: { from: `/g/${id}` } });
      const { id: newId } = await api(`/guides/${id}/fork`, { method: 'POST' });
      navigate(`/me/guides/${newId}/edit`, { state: { forked: true } });
    });

  const rate = (stars) =>
    run(async () => {
      const res = await api(`/guides/${id}/rate`, { method: 'POST', body: { stars } });
      setGuide((g) => ({ ...g, ...res }));
    });

  const verify = () =>
    run(async () => {
      const res = await api(`/guides/${id}/verify`, { method: 'POST' });
      setGuide((g) => ({ ...g, ...res }));
    });

  // все GET-запросы проходят через service worker и попадают в кэш —
  // достаточно один раз запросить данные, и инструкция откроется офлайн
  const saveOffline = () =>
    run(async () => {
      await Promise.all([api(`/guides/${id}`), api(`/guides/${id}/comments`)]);
      setNotice('Сохранено: инструкция откроется даже без интернета.');
    });

  return (
    <article className="guide-page">
      <Link to="/" className="back-link">
        ← Каталог
      </Link>

      <header className="guide-header">
        <span className="cover big">{guide.cover}</span>
        <div>
          <div className="guide-badges">
            <span className="badge">{categoryName(guide.category)}</span>
            <span className={`diff diff-${guide.difficulty}`}>{DIFFICULTY[guide.difficulty]}</span>
            {guide.verified && <span className="badge badge-verified">✓ проверено экспертом {guide.verified_by_name}</span>}
            {guide.status === 'draft' && <span className="badge badge-draft">черновик</span>}
          </div>
          <h1>{guide.title}</h1>
          <p className="lead">{guide.description}</p>
          <p className="muted">
            Автор: <b>{guide.author_name}</b> <RoleBadge role={guide.author_role} /> · обновлено {timeAgo(guide.updated_at)}
            {guide.forked_from && (
              <>
                {' · '}улучшенная версия{' '}
                {guide.parent_title ? <Link to={`/g/${guide.forked_from}`}>«{guide.parent_title}»</Link> : 'удалённой инструкции'}
              </>
            )}
          </p>
        </div>
      </header>

      <div className="guide-layout">
        <section>
          <div className="stats-row">
            <div><b>{guide.steps.length}</b><span>{plural(guide.steps.length, ['шаг', 'шага', 'шагов'])}</span></div>
            <div><b>~{formatMinutes(guide.minutes)}</b><span>времени</span></div>
            <div><b>{guide.runs_count}</b><span>прохождений</span></div>
            <div><b>{guide.usefulness}</b><span>полезность</span></div>
          </div>

          <h2>Шаги</h2>
          <ol className="outline">
            {guide.steps.map((s, i) => (
              <li key={s.id} className={local && i < local.index ? 'done' : ''}>
                <span className="outline-num">{i + 1}</span>
                <div>
                  <b>{s.title}</b>
                  <span className="muted">
                    {s.checklist.length > 0 && `${pluralN(s.checklist.length, ['пункт', 'пункта', 'пунктов'])} · `}~{s.minutes} мин
                    {s.commentsCount > 0 && ` · 💬 ${s.commentsCount}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {guide.forks.length > 0 && (
            <>
              <h2>Улучшенные версии</h2>
              <ul className="forks">
                {guide.forks.map((f) => (
                  <li key={f.id}>
                    <Link to={`/g/${f.id}`}>{f.title}</Link>
                    <span className="muted"> — {f.author_name}</span>
                    {f.rating && <StarsView value={Math.round(f.rating * 10) / 10} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="guide-aside">
          <div className="card sticky">
            {inProgress && (
              <>
                <ProgressBar value={local.index / guide.steps.length} />
                <p className="muted small">
                  Вы остановились на шаге {local.index + 1}
                </p>
              </>
            )}
            <Link to={`/g/${guide.id}/run`} className="btn btn-primary btn-block btn-big">
              {inProgress ? 'Продолжить' : 'Начать прохождение'}
            </Link>

            <div className="rating-block">
              <StarsView value={guide.rating} count={guide.rating_count} />
              {user && !isAuthor && (
                <div>
                  <span className="muted small">Ваша оценка:</span>
                  <StarsInput value={guide.myRating} onChange={rate} />
                </div>
              )}
            </div>

            <div className="aside-actions">
              {isAuthor && (
                <>
                  <Link to={`/me/guides/${guide.id}/edit`} className="btn btn-block">Редактировать</Link>
                  <Link to={`/me/guides/${guide.id}/stats`} className="btn btn-block">Аналитика</Link>
                </>
              )}
              <button className="btn btn-block" onClick={fork} title="Скопировать к себе и улучшить">
                ⑂ Сделать улучшенную версию
              </button>
              <Link to={`/g/${guide.id}/print`} className="btn btn-block" target="_blank">
                Скачать PDF
              </Link>
              <button className="btn btn-block" onClick={saveOffline}>
                Сохранить для офлайна
              </button>
              <button className="btn btn-block" onClick={() => setShowEmbed(!showEmbed)}>
                Встроить на сайт
              </button>
              {user?.role === 'expert' && !isAuthor && (
                <button className="btn btn-block" onClick={verify}>
                  {guide.verified ? 'Снять отметку эксперта' : '✓ Подтвердить как эксперт'}
                </button>
              )}
            </div>

            {notice && <p className="notice">{notice}</p>}
            {actionError && <p className="form-error">{actionError}</p>}

            {showEmbed && (
              <div className="embed-box">
                <p className="small muted">Вставьте этот код на свой сайт — инструкцию можно будет пройти прямо там:</p>
                <textarea readOnly value={embedCode} rows={4} onFocus={(e) => e.target.select()} />
                <CopyButton text={embedCode} label="Скопировать код" />
              </div>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
