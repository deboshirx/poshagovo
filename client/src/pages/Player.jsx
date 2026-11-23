import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { clearLocalProgress, flushEvents, loadLocalProgress, saveLocalProgress, trackEvent } from '../offline';
import Markdown from '../components/Markdown';
import StepComments from '../components/StepComments';
import { StarsInput } from '../components/Stars';
import { ErrorBox, Loader, ProgressBar } from '../components/ui';
import { appUrl, formatMinutes, plural } from '../utils';

export default function Player({ embedded = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null);
  const [index, setIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [checked, setChecked] = useState({});
  const [done, setDone] = useState(false);
  const [warnUnchecked, setWarnUnchecked] = useState(false);
  const [comments, setComments] = useState([]);
  const [panel, setPanel] = useState(null); // null | 'comment' | 'question' (после «Не получается»)
  const [myRating, setMyRating] = useState(null);
  const enteredAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const g = await api(`/guides/${id}`);
        if (cancelled) return;
        setGuide(g);
        setMyRating(g.myRating);
        const last = Math.max(0, g.steps.length - 1);
        const local = loadLocalProgress(id);

        try {
          const r = await api('/runs', { method: 'POST', body: { guideId: Number(id) } });
          if (cancelled) return;
          setRun(r);
          // если офлайн успели уйти дальше, чем знает сервер — берём локальное
          const useLocal = local && local.runId === r.id && local.index > r.current_step;
          const startIndex = Math.min(useLocal ? local.index : r.current_step, last);
          setIndex(startIndex);
          setMaxReached(Math.max(r.max_step, startIndex));
          setChecked(useLocal ? local.checked : r.checked);
        } catch {
          if (local) {
            setIndex(Math.min(local.index, last));
            setMaxReached(Math.min(local.maxReached ?? local.index, last));
            setChecked(local.checked || {});
          }
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
    }

    start();
    api(`/guides/${id}/comments`).then((c) => !cancelled && setComments(c)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const steps = guide?.steps || [];
  const step = steps[index];

  // заход на шаг — для аналитики времени
  useEffect(() => {
    if (!run || !step || done) return;
    enteredAt.current = Date.now();
    trackEvent(run.id, { stepId: step.id, type: 'enter' });
  }, [run, step?.id, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // сохраняем прогресс: локально сразу, на сервер — с небольшой задержкой
  useEffect(() => {
    if (!guide || done) return;
    saveLocalProgress(id, { index, maxReached, checked, runId: run?.id });
    if (!run) return;
    const t = setTimeout(() => {
      api(`/runs/${run.id}`, { method: 'PATCH', body: { currentStep: index, checked } }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [index, checked, run, guide, done, id, maxReached]);

  // стрелки на клавиатуре
  useEffect(() => {
    function onKey(e) {
      if (!step) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goBack();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <div className="container"><ErrorBox error={error} /></div>;
  if (!guide) return <Loader />;
  if (!steps.length) {
    return <div className="empty-state"><h2>В инструкции пока нет шагов</h2></div>;
  }

  const marks = checked[step.id] || [];
  const stepProgress = step.checklist.length ? marks.length / step.checklist.length : 0;
  const progress = done ? 1 : (index + stepProgress * 0.9) / steps.length;
  const minutesLeft = steps.slice(index).reduce((sum, s) => sum + s.minutes, 0);
  const isLast = index === steps.length - 1;
  const stepComments = comments.filter((c) => c.step_id === step.id);

  function goTo(i) {
    setWarnUnchecked(false);
    setPanel(null);
    setIndex(i);
    setMaxReached((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goNext() {
    if (done) return;
    const unchecked = step.checklist.length - marks.length;
    if (unchecked > 0 && !warnUnchecked) {
      setWarnUnchecked(true);
      return;
    }
    if (run) {
      trackEvent(run.id, { stepId: step.id, type: 'complete', durationMs: Date.now() - enteredAt.current });
    }
    if (isLast) finish();
    else goTo(index + 1);
  }

  function goBack() {
    if (done || index === 0) return;
    goTo(index - 1);
  }

  function toggle(i) {
    setWarnUnchecked(false);
    setChecked((prev) => {
      const current = prev[step.id] || [];
      const next = current.includes(i) ? current.filter((x) => x !== i) : [...current, i];
      return { ...prev, [step.id]: next };
    });
  }

  function stuck() {
    if (run) trackEvent(run.id, { stepId: step.id, type: 'stuck' });
    setPanel('question');
  }

  async function finish() {
    setDone(true);
    clearLocalProgress(id);
    if (!run) return;
    try {
      await flushEvents();
      await api(`/runs/${run.id}/finish`, { method: 'POST' });
    } catch {
      // не страшно, прогресс в аналитике просто останется незавершённым
    }
  }

  async function restart() {
    try {
      const r = await api('/runs', { method: 'POST', body: { guideId: Number(id), restart: true } });
      setRun(r);
    } catch {
      setRun(null);
    }
    setChecked({});
    setMaxReached(0);
    setDone(false);
    goTo(0);
  }

  async function vote(value) {
    if (!user) return navigate('/login', { state: { from: `/g/${id}/run` } });
    const newValue = step.myVote === value ? 0 : value;
    try {
      const res = await api(`/steps/${step.id}/vote`, { method: 'POST', body: { value: newValue } });
      setGuide((g) => ({ ...g, steps: g.steps.map((s) => (s.id === step.id ? { ...s, ...res } : s)) }));
    } catch (err) {
      alert(err.message);
    }
  }

  async function rate(stars) {
    try {
      await api(`/guides/${id}/rate`, { method: 'POST', body: { stars } });
      setMyRating(stars);
    } catch (err) {
      alert(err.message);
    }
  }

  const pad = (n) => String(n).padStart(2, '0');

  const header = (
    <div className="player-top">
      {embedded ? (
        <p className="embed-title">{guide.title}</p>
      ) : (
        <Link to={`/g/${id}`} className="back-link">
          ← {guide.title}
        </Link>
      )}
      <ProgressBar value={progress} />
      <p className="player-progress-text">
        {done ? 'Пройдено полностью' : `Шаг ${index + 1} из ${steps.length}`}
        {!done && <span className="muted"> · осталось около {formatMinutes(minutesLeft)}</span>}
      </p>
    </div>
  );

  if (done) {
    return (
      <div className={`player ${embedded ? 'embedded' : ''}`}>
        {header}
        <section className="finish">
          <p className="eyebrow">Готово</p>
          <h2>Вы прошли «{guide.title}»</h2>
          <p>
            {steps.length} {plural(steps.length, ['шаг', 'шага', 'шагов'])} из {steps.length}.
          </p>

          {!embedded && user && user.id !== guide.author_id && (
            <div className="finish-rate">
              <p>Насколько инструкция помогла?</p>
              <StarsInput value={myRating} onChange={rate} />
              {myRating && <p className="muted small">Оценка сохранена.</p>}
            </div>
          )}
          {!embedded && !user && (
            <p className="muted">
              <Link to="/login" state={{ from: `/g/${id}` }}>Войдите</Link>, чтобы поставить оценку. Прогресс не потеряется.
            </p>
          )}

          <div className="finish-actions">
            <button className="btn" onClick={restart}>Пройти заново</button>
            {embedded ? (
              <a className="btn btn-primary" href={appUrl(`g/${id}`)} target="_blank" rel="noreferrer">
                Открыть инструкцию на сайте
              </a>
            ) : (
              <Link to="/" className="btn btn-primary">К списку инструкций</Link>
            )}
          </div>
          {!embedded && (
            <p className="muted small">
              Что-то устарело или можно объяснить проще? <Link to={`/g/${id}`}>Сделайте свою версию</Link> или
              оставьте комментарий к шагу.
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className={`player ${embedded ? 'embedded' : ''}`}>
      {header}

      <div className="player-layout">
        {!embedded && (
          <nav className="step-map" aria-label="Шаги">
            {steps.map((s, i) => {
              const sMarks = checked[s.id] || [];
              const complete = i < index || (s.checklist.length > 0 && sMarks.length === s.checklist.length);
              return (
                <button
                  key={s.id}
                  className={`step-map-item ${i === index ? 'current' : ''} ${complete ? 'complete' : ''}`}
                  disabled={i > maxReached}
                  onClick={() => goTo(i)}
                >
                  <span className="step-map-num">{pad(i + 1)}</span>
                  <span className="step-map-title">{s.title}</span>
                </button>
              );
            })}
          </nav>
        )}

        <section className="step" key={step.id}>
          <div className="step-head">
            <span className="step-num">{pad(index + 1)}</span>
            <span className="muted">около {step.minutes} мин</span>
          </div>
          <h2>{step.title}</h2>

          <Markdown text={step.body} />

          {step.checklist.length > 0 && (
            <div className="checklist">
              <div className="checklist-head">
                <span>Проверьте себя</span>
                <span>
                  {marks.length} из {step.checklist.length}
                </span>
              </div>
              {step.checklist.map((item, i) => (
                <label key={i} className={`check ${marks.includes(i) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={marks.includes(i)} onChange={() => toggle(i)} />
                  <span className="checkmark" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}

          {step.tip && (
            <p className="tip">
              <b>Совет.</b> {step.tip}
            </p>
          )}

          {warnUnchecked && (
            <p className="warn">Отмечены не все пункты. Если всё сделано, нажмите ещё раз.</p>
          )}

          <div className="step-nav">
            <button className="btn" onClick={goBack} disabled={index === 0}>
              Назад
            </button>
            {!embedded && (
              <button className="link-btn stuck-btn" onClick={stuck} title="Автор увидит, что на этом шаге сложно">
                Не получается
              </button>
            )}
            <button className="btn btn-primary" onClick={goNext}>
              {warnUnchecked ? 'Всё равно дальше' : isLast ? 'Завершить' : 'Дальше'}
            </button>
          </div>

          {!embedded && (
            <div className="step-feedback">
              <span className="muted">Шаг понятный?</span>
              <button className={`vote ${step.myVote === 1 ? 'active' : ''}`} onClick={() => vote(1)}>
                Да <span className="vote-count">{step.up}</span>
              </button>
              <button className={`vote ${step.myVote === -1 ? 'active' : ''}`} onClick={() => vote(-1)}>
                Нет <span className="vote-count">{step.down}</span>
              </button>
              <button className="link-btn" onClick={() => setPanel(panel ? null : 'comment')}>
                Комментарии ({stepComments.length})
              </button>
            </div>
          )}

          {panel && (
            <div className="step-comments">
              {panel === 'question' && (
                <p className="notice">
                  Отметили: автор увидит это в статистике шага. Ниже вопросы других людей, можно задать свой.
                </p>
              )}
              <StepComments
                step={step}
                comments={comments}
                guideAuthorId={guide.author_id}
                initialKind={panel}
                onAdd={(c) => setComments((list) => [...list, c])}
                onDelete={(cid) => setComments((list) => list.filter((c) => c.id !== cid))}
              />
            </div>
          )}
        </section>
      </div>

      {embedded && (
        <p className="embed-footer">
          <a href={appUrl(`g/${id}`)} target="_blank" rel="noreferrer">
            Открыть инструкцию полностью
          </a>
        </p>
      )}
    </div>
  );
}
