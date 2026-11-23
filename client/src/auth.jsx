import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Loader } from './components/ui';

const AuthContext = createContext(null);

function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(cachedUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setUser(null);
      setReady(true);
      return;
    }
    api('/auth/me')
      .then((data) => saveUser(data.user))
      .catch((err) => {
        // офлайн — оставляем закэшированного пользователя
        if (err.status !== 0) saveUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  function saveUser(u) {
    setUser(u);
    if (u) {
      localStorage.setItem('user', JSON.stringify(u));
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  }

  function applySession({ token, user }) {
    localStorage.setItem('token', token);
    saveUser(user);
  }

  const login = async (email, password) =>
    applySession(await api('/auth/login', { method: 'POST', body: { email, password } }));

  const register = async (form) =>
    applySession(await api('/auth/register', { method: 'POST', body: form }));

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // всё равно выходим локально
    }
    saveUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready && !user) return <Loader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}
