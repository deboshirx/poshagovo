import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { loadLocalProgress } from '../offline';
import { StarsInput, StarsView } from '../components/Stars';
import { CopyButton, ErrorBox, Loader, ProgressBar, RoleBadge } from '../components/ui';
import { DIFFICULTY, absoluteUrl, categoryName, formatMinutes, pluralN, timeAgo } from '../utils';

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
  const completion = guide.runs_count ? Math.round((guide.finished_count / guide.runs_count) * 100) : null;
  const embedCode = `<iframe src="${absoluteUrl(`embed/${guide.id}`)}" width="100%" height="620" style="border:0" title="${guide.title.replace(/"/g, '&quot;')}"></iframe>`;

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

  // GET-запросы проходят через service worker и попадают в кэш,
  // так что достаточно один раз запросить данные — и инструкция откроется офлайн
  const saveOffline = () =>
    run(async () => {
      await Promise.all([api(`/guides/${id}`), api(`/guides/${id}/comments`)]);
      setNotice('Сохранено. Инструкция откроется и без интернета.');
    });

  return (
    <article className="guide-page">
      <Link to="/" className="back-link">
        ← Все инструкции
      </Link>

      <header className="guide-header">
        <p className="eyebrow">
          {categoryName(guide.category)} · {DIFFICULTY[guide.difficulty].toLowerCase()}
          {guide.status === 'draft' && <> · <span className="accent">черновик</span></>}
        </p>
        <h1>{guide.title}</h1>
        <p className="lead">{guide.description}</p>
        <p className="byline">
          {guide.author_name}
          <RoleBadge role={guide.author_role} /> · обновлено {timeAgo(guide.updated_at)}
          {guide.verified && <> · проверил эксперт: {guide.verified_by_name}</>}
          {guide.forked_from && (
            <>
              {' '}· переработка инструкции{' '}
              {guide.parent_title ? <Link to={`/g/${guide.forked_from}`}>«{guide.parent_title}»</Link> : '(удалена)'}
            </>
          )}
        </p>
      </header>

      <div className="guide-layout">
        <section>
          <dl className="facts">
            <div>
              <dt>Шагов</dt>
              <dd>{guide.steps.length}</dd>
            </div>
            <div>
              <dt>Займёт</dt>
              <dd>{formatMinutes(guide.minutes)}</dd>
            </div>
            <div>
              <dt>Прошли до конца</dt>
              <dd>{completion != null ? `${completion}%` : '—'}</dd>
            </div>
            <div>
              <dt>Прохождений</dt>
              <dd>{guide.runs_count}</dd>
            </div>
          </dl>

          <ol className="outline">
            {guide.steps.map((s, i) => (
              <li key={s.id} className={local && i < local.index ? 'done' : ''}>
                <span className="outline-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <span className="outline-title">{s.title}</span>
                  <span className="outline-meta">
                    {s.checklist.length > 0 && `${pluralN(s.checklist.length, ['пункт', 'пункта', 'пунктов'])} · `}
                    {s.minutes} мин
                    {s.commentsCount > 0 && ` · ${pluralN(s.commentsCount, ['комментарий', 'комментария', 'комментариев'])}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {guide.forks.length > 0 && (
            <>
              <h2>Другие версии этой инструкции</h2>
              <ul className="forks">
                {guide.forks.map((f) => (
                  <li key={f.id}>
                    <Link to={`/g/${f.id}`}>{f.title}</Link>
                    <span className="muted">
                      {' '}
                      — {f.author_name}
                      {f.rating && `, ${(Math.round(f.rating * 10) / 10).toString().replace('.', ',')} из 5`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="guide-aside">
          <div className="sticky">
            {inProgress && (
              <div className="resume">
                <ProgressBar value={local.index / guide.steps.length} />
                <p className="small">Вы остановились на шаге {local.index + 1}</p>
              </div>
            )}
            <Link to={`/g/${guide.id}/run`} className="btn btn-primary btn-block">
              {inProgress ? 'Продолжить' : 'Начать'}
            </Link>

            <div className="rating-block">
              <StarsView value={guide.rating} count={guide.rating_count} />
              {user && !isAuthor && (
                <div>
                  <p className="small muted">Ваша оценка</p>
                  <StarsInput value={guide.myRating} onChange={rate} />
                </div>
              )}
            </div>

            <ul className="aside-actions">
              {isAuthor && (
                <>
                  <li><Link to={`/me/guides/${guide.id}/edit`}>Редактировать</Link></li>
                  <li><Link to={`/me/guides/${guide.id}/stats`}>Статистика прохождений</Link></li>
                </>
              )}
              <li>
                <button className="link-btn" onClick={fork}>Сделать свою версию</button>
              </li>
              <li>
                <Link to={`/g/${guide.id}/print`} target="_blank">Распечатать или сохранить в PDF</Link>
              </li>
              <li>
                <button className="link-btn" onClick={saveOffline}>Сохранить для работы без интернета</button>
              </li>
              <li>
                <button className="link-btn" onClick={() => setShowEmbed(!showEmbed)}>Встроить на свой сайт</button>
              </li>
              {user?.role === 'expert' && !isAuthor && (
                <li>
                  <button className="link-btn" onClick={verify}>
                    {guide.verified ? 'Снять отметку «проверено»' : 'Отметить как проверенную'}
                  </button>
                </li>
              )}
            </ul>

            {notice && <p className="notice">{notice}</p>}
            {actionError && <p className="form-error">{actionError}</p>}

            {showEmbed && (
              <div className="embed-box">
                <p className="small muted">Код для вставки. Инструкцию можно будет пройти прямо на вашем сайте.</p>
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
