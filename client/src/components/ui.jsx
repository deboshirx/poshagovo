import { useState } from 'react';

export function Loader({ text = 'Загружаем…' }) {
  return (
    <div className="loader">
      <span className="spinner" />
      {text}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div className="error-box">
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-small" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function CopyButton({ text, label = 'Копировать' }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Скопируйте вручную:', text);
    }
  }

  return (
    <button type="button" className="btn btn-small btn-ghost" onClick={copy}>
      {copied ? 'Скопировано ✓' : label}
    </button>
  );
}

export function RoleBadge({ role }) {
  if (role !== 'expert') return null;
  return <span className="badge badge-expert" title="Эксперт платформы">эксперт</span>;
}
