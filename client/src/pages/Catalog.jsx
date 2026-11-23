import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import GuideCard from '../components/GuideCard';
import { ErrorBox, Loader, ProgressBar } from '../components/ui';
import { plural, pluralN } from '../utils';

const SORTS = [
  { id: 'useful', name: 'сначала полезные' },
  { id: 'popular', name: 'сначала популярные' },
  { id: 'rating', name: 'по оценке' },
  { id: 'new', name: 'сначала новые' },
  { id: 'short', name: 'сначала короткие' },
];

const EXAMPLES = ['докер', 'справка в военкомат', 'собрать комп', 'оформить лабу', 'общага'];

export default function Catalog() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || 'all';
  const sort = params.get('sort') || 'useful';

  const [query, setQuery] = useState(q);
  const [guides, setGuides] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [totals, setTotals] = useState(null);

  function setParam(key, value, defaultValue = '') {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== defaultValue) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    api('/guides/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return setActiveRuns([]);
    api('/runs/mine')
      .then((runs) => setActiveRuns(runs.filter((r) => !r.finished_at).slice(0, 3)))
      .catch(() => {});
  }, [user]);

  // поиск с небольшой задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const t = setTimeout(() => setParam('q', query.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const search = new URLSearchParams({ q, category, sort });
    api(`/guides?${search}`)
      .then((data) => {
        if (cancelled) return;
        setGuides(data);
        // общие цифры для шапки считаем по полному списку
        if (!q && category === 'all') {
          setTotals({
            guides: data.length,
            steps: data.reduce((sum, g) => sum + g.steps_count, 0),
            runs: data.reduce((sum, g) => sum + g.runs_count, 0),
          });
        }
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category, sort]);

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>Пошаговые инструкции с чек-листами</h1>
          <div className="search">
            <label htmlFor="search" className="visually-hidden">
              Поиск инструкций
            </label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Что нужно сделать?"
              autoComplete="off"
            />
          </div>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => setQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="orb" />
          <div className="strips">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="hero-word">ПОШАГОВО</span>
          {totals && (
            <>
              <span className="hero-fact f1">
                {totals.guides} {plural(totals.guides, ['инструкция', 'инструкции', 'инструкций'])}
              </span>
              <span className="hero-fact f2">
                {totals.steps} {plural(totals.steps, ['шаг', 'шага', 'шагов'])}
              </span>
              <span className="hero-fact f3">
                {totals.runs} {plural(totals.runs, ['прохождение', 'прохождения', 'прохождений'])}
              </span>
            </>
          )}
        </div>
      </section>

      {activeRuns.length > 0 && !q && (
        <section className="continue">
          <h2>Вы остановились</h2>
          <div className="continue-list">
          {activeRuns.map((r) => (
            <Link key={r.id} to={`/g/${r.guide_id}/run`} className="continue-item">
              <span className="continue-title">{r.title}</span>
              <span className="continue-step">
                шаг {r.current_step + 1} из {r.steps_count}
              </span>
              <ProgressBar value={r.current_step / Math.max(1, r.steps_count)} />
            </Link>
          ))}
          </div>
        </section>
      )}

      <div className="filters">
        <nav className="tabs-inline" aria-label="Категории">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setParam('category', '')}>
            Все
          </button>
          {categories
            .filter((c) => c.count > 0)
            .map((c) => (
              <button
                key={c.id}
                className={category === c.id ? 'active' : ''}
                onClick={() => setParam('category', c.id)}
              >
                {c.name} <span className="count">{c.count}</span>
              </button>
            ))}
        </nav>
        {!q && (
          <select value={sort} onChange={(e) => setParam('sort', e.target.value, 'useful')} aria-label="Сортировка">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ErrorBox error={error} />
      {loading && !guides && <Loader />}

      {guides && q && (
        <p className="result-count muted">
          {guides.length ? `Нашлось: ${pluralN(guides.length, ['инструкция', 'инструкции', 'инструкций'])}` : ''}
        </p>
      )}

      {guides && guides.length === 0 && (
        <div className="empty-state">
          <h2>По запросу «{q}» ничего нет</h2>
          <p>
            Попробуйте другие слова или <Link to="/me/new">напишите эту инструкцию сами</Link>.
          </p>
        </div>
      )}

      {guides && guides.length > 0 && (
        <div className={`guide-grid ${loading ? 'is-loading' : ''}`}>
          {guides.map((g, i) => (
            <GuideCard key={g.id} guide={g} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
