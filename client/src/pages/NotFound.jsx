import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="empty-state">
      <h2>Такой страницы нет</h2>
      <p className="muted">Ссылка устарела или в ней опечатка.</p>
      <Link to="/" className="btn btn-primary">
        К списку инструкций
      </Link>
    </div>
  );
}
