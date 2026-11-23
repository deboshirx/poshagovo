import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { RoleBadge } from './ui';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="logo" onClick={() => setMenuOpen(false)}>
            <img src="/icon.svg" alt="" width="30" height="30" />
            Пошагово
          </Link>

          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Меню">
            ☰
          </button>

          <nav className={`nav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end>Каталог</NavLink>
            <NavLink to="/me/new">Создать</NavLink>
            {user ? (
              <>
                <NavLink to="/me">Кабинет</NavLink>
                <span className="nav-user">
                  {user.name} <RoleBadge role={user.role} />
                </span>
                <button className="btn btn-small btn-ghost" onClick={handleLogout}>
                  Выйти
                </button>
              </>
            ) : (
              <NavLink to="/login" className="btn btn-small btn-primary">
                Войти
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      {!online && (
        <div className="offline-bar">
          Нет интернета. Сохранённые инструкции работают, прогресс отправится позже.
        </div>
      )}

      <main className="container main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">
          Пошагово — инструкции, которые можно пройти, а не просто прочитать
        </div>
      </footer>
    </>
  );
}
