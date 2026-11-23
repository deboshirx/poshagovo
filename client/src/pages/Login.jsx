import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/me';

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', expertCode: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="segmented wide">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Вход
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Регистрация
          </button>
        </div>

        {mode === 'register' && (
          <label>
            Имя
            <input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {mode === 'register' && (
          <>
            <div className="role-pick">
              <span>Я здесь как</span>
              <label className={`role-option ${form.role === 'student' ? 'active' : ''}`}>
                <input type="radio" name="role" value="student" checked={form.role === 'student'} onChange={set('role')} />
                <b>Ученик</b>
                <small>прохожу инструкции, пишу свои</small>
              </label>
              <label className={`role-option ${form.role === 'expert' ? 'active' : ''}`}>
                <input type="radio" name="role" value="expert" checked={form.role === 'expert'} onChange={set('role')} />
                <b>Эксперт</b>
                <small>проверяю инструкции, мои ответы выделяются</small>
              </label>
            </div>
            {form.role === 'expert' && (
              <label>
                Код эксперта
                <input value={form.expertCode} onChange={set('expertCode')} placeholder="выдаётся модератором" />
              </label>
            )}
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            className="link-btn demo-fill"
            onClick={() => setForm({ ...form, email: 'artem@poshagovo.ru', password: 'demo1234' })}
          >
            Заполнить демо-аккаунт автора
          </button>
        )}
      </form>
    </div>
  );
}
