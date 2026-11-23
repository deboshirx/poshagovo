import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import Markdown from '../components/Markdown';
import { ErrorBox, Loader } from '../components/ui';
import { DIFFICULTY, absoluteUrl, formatMinutes } from '../utils';

// Версия для печати. PDF делается через системный диалог печати → «Сохранить как PDF».
// Так шрифты и кириллица гарантированно в порядке, в отличие от генерации PDF на клиенте.
export default function PrintPage() {
  const { id } = useParams();
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/guides/${id}`)
      .then((g) => {
        setGuide(g);
        document.title = `${g.title} — Пошагово`;
      })
      .catch(setError);
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (!guide) return <Loader />;

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link to={`/g/${id}`}>← Назад</Link>
        <span className="muted">В диалоге печати выберите «Сохранить как PDF»</span>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Скачать PDF
        </button>
      </div>

      <header className="print-header">
        <h1>
          {guide.title}
        </h1>
        <p>{guide.description}</p>
        <p className="muted">
          Автор: {guide.author_name} · {guide.steps.length} шагов · ~{formatMinutes(guide.minutes)} ·{' '}
          {DIFFICULTY[guide.difficulty]}
          {guide.verified && ` · проверил эксперт: ${guide.verified_by_name}`}
        </p>
      </header>

      {guide.steps.map((s, i) => (
        <section key={s.id} className="print-step">
          <h2>
            <span className="print-num">{i + 1}</span> {s.title}
            <small> ~{s.minutes} мин</small>
          </h2>
          <Markdown text={s.body} />
          {s.checklist.length > 0 && (
            <ul className="print-checklist">
              {s.checklist.map((item, j) => (
                <li key={j}>
                  <span className="box" /> {item}
                </li>
              ))}
            </ul>
          )}
          {s.tip && <p className="tip">Совет: {s.tip}</p>}
        </section>
      ))}

      <footer className="print-footer muted">
        {absoluteUrl(`g/${guide.id}`)} — пройти интерактивно с отметками и комментариями
      </footer>
    </div>
  );
}
