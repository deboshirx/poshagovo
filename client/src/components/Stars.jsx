import { useState } from 'react';

export function StarsView({ value, count }) {
  if (!value) return <span className="muted">нет оценок</span>;
  return (
    <span className="stars-view" title={`${value} из 5`}>
      <span className="star-icon">★</span> {value.toFixed(1)}
      {count != null && <span className="muted"> ({count})</span>}
    </span>
  );
}

export function StarsInput({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <div className="stars-input" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          aria-label={`Оценка ${n}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
