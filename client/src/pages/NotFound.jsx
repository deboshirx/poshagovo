import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="empty-state">
      <div className="empty-emoji">🧭</div>
      <h2>Такой страницы нет</h2>
      <p className="muted">Кажется, вы свернули не туда на каком-то шаге.</p>
      <Link to="/" className="btn btn-primary">
        В каталог
      </Link>
    </div>
  );
}
