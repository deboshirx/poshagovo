import { useState } from 'react';

export function StarsView({ value, count }) {
  if (!value) return <span className="muted">оценок пока нет</span>;
  return (
    <span className="stars-view" title={`${value} из 5`}>
      {value.toFixed(1).replace('.', ',')} из 5
      {count != null && <span className="muted"> · {count} оценок</span>}
    </span>
  );
}

export function StarsInput({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <div className="stars-input" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          aria-label={`Оценка ${n}`}
          aria-checked={value === n}
          role="radio"
        >
          {n}
        </button>
      ))}
    </div>
  );
}
