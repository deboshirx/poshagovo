import { Link } from 'react-router-dom';
import { DIFFICULTY, categoryName, formatMinutes, pluralN } from '../utils';

// Строка каталога. Каталог сделан как оглавление справочника, а не сетка карточек:
// так быстрее пробежать глазами и сравнить время, оценку и сложность.
export default function GuideCard({ guide, index }) {
  const completion = guide.runs_count ? Math.round((guide.finished_count / guide.runs_count) * 100) : null;

  return (
    <article className="guide-row">
      <span className="guide-row-num">{String(index + 1).padStart(2, '0')}</span>

      <div className="guide-row-main">
        <h3>
          <Link to={`/g/${guide.id}`}>{guide.title}</Link>
        </h3>
        {guide.match?.step && <p className="search-hit">Совпадение в шаге «{guide.match.step}»</p>}
        <p className="guide-row-desc">{guide.description}</p>
        <p className="guide-row-meta">
          {categoryName(guide.category)} · {pluralN(guide.steps_count, ['шаг', 'шага', 'шагов'])} · около{' '}
          {formatMinutes(guide.minutes)} · {DIFFICULTY[guide.difficulty].toLowerCase()}
          {guide.verified && <> · <span className="verified">проверено экспертом</span></>}
        </p>
      </div>

      <dl className="guide-row-stats">
        <div>
          <dt>оценка</dt>
          <dd>{guide.rating ? guide.rating.toFixed(1).replace('.', ',') : '—'}</dd>
        </div>
        <div>
          <dt>до конца</dt>
          <dd>{completion != null ? `${completion}%` : '—'}</dd>
        </div>
      </dl>
    </article>
  );
}
