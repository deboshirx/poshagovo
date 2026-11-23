import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Loader, RoleBadge } from '../components/ui';
import { formatMs, timeAgo } from '../utils';

const percent = (x) => `${Math.round(x * 100)}%`;

function DailyChart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.started));
  const w = 100 / daily.length;
  return (
    <svg className="daily-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Запуски по дням">
      {daily.map((d, i) => {
        const h1 = (d.started / max) * 36;
        const h2 = (d.finished / max) * 36;
        return (
          <g key={d.day}>
            <title>{`${new Date(d.day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: начали ${d.started}, закончили ${d.finished}`}</title>
            <rect x={i * w + w * 0.15} y={40 - h1} width={w * 0.7} height={h1} className="bar-started" rx="0.6" />
            <rect x={i * w + w * 0.15} y={40 - h2} width={w * 0.7} height={h2} className="bar-finished" rx="0.6" />
          </g>
        );
      })}
    </svg>
  );
}

export default function Stats() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/guides/${id}/stats`).then(setData).catch(setError);
  }, [id]);

  async function toggleResolved(item) {
    try {
      const updated = await api(`/comments/${item.id}`, { method: 'PATCH', body: { resolved: !item.resolved } });
      setData((d) => ({
        ...d,
        feedback: d.feedback.map((f) => (f.id === item.id ? { ...f, resolved: updated.resolved } : f)),
      }));
    } catch (err) {
      alert(err.message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loader />;

  const { summary, steps, bottlenecks, daily, feedback, guide } = data;
  const bottleneckIds = new Set(bottlenecks.map((b) => b.id));
  const openFeedback = feedback.filter((f) => !f.resolved).length;

  return (
    <div className="stats-page">
      <Link to="/me" className="back-link">← Кабинет</Link>
      <div className="cabinet-head">
        <div>
          <h1>Аналитика</h1>
          <p className="muted">
            <Link to={`/g/${guide.id}`}>{guide.title}</Link>
          </p>
        </div>
        <Link to={`/me/guides/${guide.id}/edit`} className="btn">Редактировать</Link>
      </div>

      <div className="kpis">
        <div className="card kpi">
          <span>Начали</span>
          <b>{summary.runs}</b>
        </div>
        <div className="card kpi">
          <span>Дошли до конца</span>
          <b>{summary.finished}</b>
          <small>{percent(summary.completionRate)}</small>
        </div>
        <div className="card kpi">
          <span>Бросили</span>
          <b>{summary.abandoned}</b>
          <small>{summary.active} ещё в процессе</small>
        </div>
        <div className="card kpi">
          <span>Время прохождения</span>
          <b>{formatMs(summary.medianTotalMs)}</b>
          <small>медиана</small>
        </div>
        <div className="card kpi">
          <span>Оценка</span>
          <b>{guide.rating ?? '—'}</b>
          <small>{guide.rating_count} оценок</small>
        </div>
      </div>

      {summary.runs === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">📊</div>
          <h2>Пока никто не проходил</h2>
          <p className="muted">Поделитесь ссылкой — статистика появится после первых прохождений.</p>
        </div>
      ) : (
        <>
          <h2>Узкие места</h2>
          {bottlenecks.length === 0 ? (
            <p className="lint-ok card">Явных проблемных шагов нет — люди проходят ровно 👌</p>
          ) : (
            <div className="bottlenecks">
              {bottlenecks.map((b, i) => (
                <div key={b.id} className={`card bottleneck ${i === 0 ? 'top' : ''}`}>
                  <div className="bottleneck-head">
                    <span className="step-num">Шаг {b.position + 1}</span>
                    <b>{b.title}</b>
                  </div>
                  <ul>
                    {b.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  <p className="muted small">
                    Что попробовать: разбить шаг на два, добавить картинку или пункт чек-листа, ответить на вопросы в комментариях.
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2>Воронка по шагам</h2>
          <div className="card funnel">
            {steps.map((s) => {
              const reachedPart = summary.runs ? s.reached / summary.runs : 0;
              const leftPart = summary.runs ? s.leftHere / summary.runs : 0;
              return (
                <div key={s.id} className={`funnel-row ${bottleneckIds.has(s.id) ? 'problem' : ''}`}>
                  <div className="funnel-label">
                    <span className="step-num">{s.position + 1}</span>
                    <span className="funnel-title">{s.title}</span>
                  </div>
                  <div className="funnel-bar">
                    <div className="funnel-fill" style={{ width: percent(reachedPart) }}>
                      <div className="funnel-left" style={{ width: reachedPart ? percent(leftPart / reachedPart) : 0 }} />
                    </div>
                    <span className="funnel-value">
                      {s.reached} {s.leftHere > 0 && <em>−{s.leftHere}</em>}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="legend muted small">
              <span><i className="lg lg-reached" /> дошли до шага</span>
              <span><i className="lg lg-left" /> бросили на этом шаге</span>
            </div>
          </div>

          <h2>Детали по шагам</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Шаг</th>
                  <th>Дошли</th>
                  <th>Бросили</th>
                  <th>Время (план)</th>
                  <th>«Застрял»</th>
                  <th>👍 / 👎</th>
                  <th>💬</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id} className={bottleneckIds.has(s.id) ? 'row-problem' : ''}>
                    <td>{s.position + 1}. {s.title}</td>
                    <td>{s.reached}</td>
                    <td>{s.leftHere ? `${s.leftHere} (${percent(s.dropRate)})` : '—'}</td>
                    <td>
                      {formatMs(s.medianMs)} <span className="muted">({s.plannedMinutes} мин)</span>
                    </td>
                    <td>{s.stuck || '—'}</td>
                    <td>{s.up} / {s.down}</td>
                    <td>{s.comments || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Активность за 2 недели</h2>
          <div className="card">
            <DailyChart daily={daily} />
            <div className="legend muted small">
              <span><i className="lg lg-started" /> начали</span>
              <span><i className="lg lg-finished" /> закончили</span>
            </div>
          </div>
        </>
      )}

      <h2>
        Вопросы и предложения {openFeedback > 0 && <span className="chip-count">{openFeedback}</span>}
      </h2>
      {feedback.length === 0 && <p className="muted">Читатели пока ничего не предлагали.</p>}
      <div className="feedback-list">
        {feedback.map((f) => (
          <div key={f.id} className={`card feedback ${f.resolved ? 'resolved' : ''}`}>
            <div className="comment-head">
              <span className={`kind kind-${f.kind}`}>{f.kind === 'question' ? 'Вопрос' : 'Улучшение'}</span>
              <b>{f.author_name}</b> <RoleBadge role={f.author_role} />
              <span className="muted">к шагу {f.position + 1} «{f.step_title}» · {timeAgo(f.created_at)}</span>
            </div>
            <p>{f.body}</p>
            <label className="toggle">
              <input type="checkbox" checked={Boolean(f.resolved)} onChange={() => toggleResolved(f)} />
              учтено
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
