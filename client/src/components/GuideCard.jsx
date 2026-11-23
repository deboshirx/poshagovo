import { Link } from 'react-router-dom';
import CategoryIcon from './CategoryIcon';
import { DIFFICULTY, categoryName, formatMinutes, pluralN } from '../utils';

export default function GuideCard({ guide, index }) {
  const completion = guide.runs_count ? Math.round((guide.finished_count / guide.runs_count) * 100) : null;

  return (
    <Link to={`/g/${guide.id}`} className="guide-card">
      <div className="guide-card-top">
        <span className="guide-card-num">{String(index + 1).padStart(2, '0')}</span>
        <CategoryIcon category={guide.category} size={64} />
      </div>

      <h3>{guide.title}</h3>
      {guide.match?.step && <p className="search-hit">Совпадение в шаге «{guide.match.step}»</p>}
      <p className="guide-card-meta">
        {categoryName(guide.category)} · {pluralN(guide.steps_count, ['шаг', 'шага', 'шагов'])} · около{' '}
        {formatMinutes(guide.minutes)}
      </p>

      <div className="guide-card-bottom">
        <span className="arrow-btn" aria-hidden="true">
          →
        </span>
        <span className="guide-card-stats">
          {guide.rating && <span>{guide.rating.toFixed(1).replace('.', ',')} из 5</span>}
          {completion != null && <span>{completion}% до конца</span>}
          <span>{DIFFICULTY[guide.difficulty].toLowerCase()}</span>
        </span>
      </div>
      {guide.verified && <span className="guide-card-verified">проверил эксперт</span>}
    </Link>
  );
}
