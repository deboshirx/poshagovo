import { Link } from 'react-router-dom';
import { StarsView } from './Stars';
import { DIFFICULTY, categoryName, formatMinutes, pluralN } from '../utils';

export default function GuideCard({ guide }) {
  const completion = guide.runs_count ? Math.round((guide.finished_count / guide.runs_count) * 100) : null;

  return (
    <Link to={`/g/${guide.id}`} className="guide-card">
      <div className="guide-card-top">
        <span className="cover">{guide.cover}</span>
        <div className="guide-card-badges">
          {guide.verified && <span className="badge badge-verified" title={`Проверено: ${guide.verified_by_name}`}>✓ проверено</span>}
          {guide.forked_from && <span className="badge">форк</span>}
        </div>
      </div>

      <h3>{guide.title}</h3>
      {guide.match?.step && (
        <p className="search-hit">
          Нашлось в шаге «{guide.match.step}»
        </p>
      )}
      <p className="guide-card-desc">{guide.description}</p>

      <div className="guide-card-meta">
        <span>{pluralN(guide.steps_count, ['шаг', 'шага', 'шагов'])}</span>
        <span>~{formatMinutes(guide.minutes)}</span>
        <span className={`diff diff-${guide.difficulty}`}>{DIFFICULTY[guide.difficulty]}</span>
      </div>

      <div className="guide-card-footer">
        <span className="muted">
          {guide.author_name} · {categoryName(guide.category)}
        </span>
        <span className="guide-card-stats">
          <StarsView value={guide.rating} />
          {completion != null && (
            <span title="Сколько прошедших дошли до конца" className="muted">
              {completion}% до конца
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
