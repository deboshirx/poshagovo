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
            Пошагово
          </Link>

          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
            Меню
          </button>

          <nav className={`nav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end>Инструкции</NavLink>
            <NavLink to="/me/new">Написать</NavLink>
            {user ? (
              <>
                <NavLink to="/me">Кабинет</NavLink>
                <span className="nav-user">
                  {user.name}
                  <RoleBadge role={user.role} />
                </span>
                <button className="link-btn nav-logout" onClick={handleLogout}>
                  Выйти
                </button>
              </>
            ) : (
              <NavLink to="/login">Войти</NavLink>
            )}
          </nav>
        </div>
      </header>

      {!online && (
        <p className="offline-bar">
          Нет интернета. Открытые раньше инструкции работают, отметки отправятся, когда сеть вернётся.
        </p>
      )}

      <main className="container main">
        <Outlet />
      </main>
    </>
  );
}
