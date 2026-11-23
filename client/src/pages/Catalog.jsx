import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import GuideCard from '../components/GuideCard';
import { ErrorBox, Loader, ProgressBar } from '../components/ui';

const SORTS = [
  { id: 'useful', name: 'Полезные' },
  { id: 'popular', name: 'Популярные' },
  { id: 'rating', name: 'По оценке' },
  { id: 'new', name: 'Новые' },
  { id: 'short', name: 'Быстрые' },
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
      .then((data) => !cancelled && setGuides(data))
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category, sort]);

  return (
    <>
      <section className="hero">
        <h1>Делаете впервые? Пройдите по шагам.</h1>
        <p>
          Инструкции с чек-листами от тех, кто уже это делал: от сборки ПК до справки в деканате.
          Отмечайте шаги, задавайте вопросы прямо там, где застряли.
        </p>
        <div className="search">
          <span className="search-icon">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Что нужно сделать? Например: поставить докер"
            aria-label="Поиск инструкций"
          />
        </div>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip chip-light" onClick={() => setQuery(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </section>

      {activeRuns.length > 0 && !q && (
        <section className="continue">
          <h2>Продолжить</h2>
          <div className="continue-list">
            {activeRuns.map((r) => (
              <Link key={r.id} to={`/g/${r.guide_id}/run`} className="continue-item">
                <span className="cover small">{r.cover}</span>
                <div>
                  <b>{r.title}</b>
                  <ProgressBar value={r.current_step / Math.max(1, r.steps_count)} />
                  <span className="muted">
                    шаг {r.current_step + 1} из {r.steps_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="filters">
        <div className="chips">
          <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setParam('category', '')}>
            Все
          </button>
          {categories
            .filter((c) => c.count > 0)
            .map((c) => (
              <button
                key={c.id}
                className={`chip ${category === c.id ? 'active' : ''}`}
                onClick={() => setParam('category', c.id)}
              >
                {c.name} <span className="chip-count">{c.count}</span>
              </button>
            ))}
        </div>
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

      {guides && guides.length === 0 && (
        <div className="empty-state">
          <div className="empty-emoji">🔍</div>
          <h2>Ничего не нашлось</h2>
          <p className="muted">Может, именно вы напишете эту инструкцию?</p>
          <Link to="/me/new" className="btn btn-primary">
            Создать инструкцию
          </Link>
        </div>
      )}

      {guides && guides.length > 0 && (
        <div className={`grid ${loading ? 'is-loading' : ''}`}>
          {guides.map((g) => (
            <GuideCard key={g.id} guide={g} />
          ))}
        </div>
      )}
    </>
  );
}
