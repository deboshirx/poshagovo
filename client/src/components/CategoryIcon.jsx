import { useId } from 'react';

// Иконки категорий в стиле «матовое стекло»: сзади плотная синяя фигура,
// спереди светлая полупрозрачная, а сквозь неё размыто просвечивает задняя.
// Размытие сделано внутри SVG (clipPath + blur), поэтому работает без backdrop-filter.

const ICONS = {
  // учёба — раскрытая тетрадь и круг
  study: {
    back: <circle cx="44" cy="18" r="12" />,
    front: <rect x="8" y="20" width="40" height="34" rx="9" />,
    details: (
      <>
        <path d="M16 31h18M16 39h24M16 47h12" />
      </>
    ),
  },
  // документы — два листа
  docs: {
    back: <rect x="22" y="6" width="32" height="38" rx="7" />,
    front: <rect x="10" y="18" width="32" height="40" rx="7" />,
    details: <path d="M18 30h16M18 38h16M18 46h10" />,
  },
  // железо — системный блок и вентилятор
  tech: {
    back: <circle cx="40" cy="38" r="14" />,
    front: <rect x="10" y="8" width="30" height="48" rx="8" />,
    details: (
      <>
        <path d="M18 18h14M18 25h14" />
        <circle cx="25" cy="42" r="5" />
      </>
    ),
  },
  // разработка — окно терминала
  dev: {
    back: <rect x="28" y="6" width="28" height="24" rx="7" />,
    front: <rect x="6" y="16" width="44" height="36" rx="9" />,
    details: <path d="M16 30l6 5-6 5M27 41h11" />,
  },
  // быт — дом и солнце
  life: {
    back: <circle cx="44" cy="16" r="11" />,
    front: <path d="M10 30L30 13l20 17v18a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" />,
    details: <path d="M25 54V42h10v12" />,
  },
  // прочее — два пересекающихся круга
  other: {
    back: <circle cx="40" cy="32" r="17" />,
    front: <circle cx="24" cy="32" r="17" />,
    details: null,
  },
};

export default function CategoryIcon({ category, size = 56, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const icon = ICONS[category] || ICONS.other;

  return (
    <svg
      className={`category-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`clip-${uid}`}>{icon.front}</clipPath>
        <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <g className="ci-back">{icon.back}</g>
      <g className="ci-front">{icon.front}</g>
      <g clipPath={`url(#clip-${uid})`}>
        <g className="ci-back" filter={`url(#blur-${uid})`} opacity="0.85">
          {icon.back}
        </g>
      </g>
      {icon.details && <g className="ci-details">{icon.details}</g>}
    </svg>
  );
}
