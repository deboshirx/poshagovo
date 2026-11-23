import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Markdown from '../components/Markdown';
import { ErrorBox, Loader } from '../components/ui';
import { CATEGORIES, formatMinutes } from '../utils';

let keyCounter = 0;
const newKey = () => `k${++keyCounter}`;

const emptyStep = () => ({ key: newKey(), id: null, title: '', body: '', checklistText: '', tip: '', minutes: 5 });

const fromServerStep = (s) => ({
  key: newKey(),
  id: s.id,
  title: s.title,
  body: s.body,
  checklistText: s.checklist.join('\n'),
  tip: s.tip,
  minutes: s.minutes,
});

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'other',
  tags: '',
  cover: '📋',
  difficulty: 'easy',
  status: 'draft',
};

// «Линтер» инструкции — подсказывает автору, где читатели скорее всего споткнутся
function lint(form, steps) {
  const warnings = [];
  if (form.title.trim().length < 3) warnings.push('Добавьте название');
  if (form.description.trim().length < 30) warnings.push('Опишите в паре предложений, для кого инструкция и что получится в конце');
  if (steps.length === 0) warnings.push('Добавьте хотя бы один шаг');
  if (steps.length === 1) warnings.push('Всего один шаг — может, стоит разбить на несколько?');

  steps.forEach((s, i) => {
    const n = `Шаг ${i + 1}`;
    if (!s.title.trim()) warnings.push(`${n}: нет заголовка`);
    if (!s.checklistText.trim()) warnings.push(`${n}: нет чек-листа — читателю нечего отметить`);
    if (s.body.length > 1500) warnings.push(`${n}: длинный текст, лучше разбить на два шага`);
    if (Number(s.minutes) > 60) warnings.push(`${n}: дольше часа — разбейте на части`);
    if (/\b(и т\.?д|и т\.?п)\b/i.test(s.body)) warnings.push(`${n}: «и т.д.» — новичок не знает, что там «далее». Распишите`);
  });
  return warnings;
}

export default function Editor() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;

  const [form, setForm] = useState(EMPTY_FORM);
  const [steps, setSteps] = useState(() => [emptyStep()]);
  const [openKey, setOpenKey] = useState(null);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [forkedFrom, setForkedFrom] = useState(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInfo, setAiInfo] = useState(null);

  function applyGuide(g) {
    setForm({
      title: g.title,
      description: g.description,
      category: g.category,
      tags: g.tags.join(', '),
      cover: g.cover,
      difficulty: g.difficulty,
      status: g.status,
    });
    const loaded = g.steps.map(fromServerStep);
    setSteps(loaded.length ? loaded : [emptyStep()]);
    setForkedFrom(g.forked_from ? { id: g.forked_from, title: g.parent_title } : null);
  }

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setSteps([emptyStep()]);
      setForkedFrom(null);
      return;
    }
    setLoading(true);
    api(`/guides/${id}`)
      .then((g) => {
        if (g.author_id !== user.id) throw new Error('Редактировать можно только свои инструкции');
        applyGuide(g);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, isNew, user.id]);

  if (loading) return <Loader />;
  if (error && !form.title && !isNew) return <ErrorBox error={error} />;

  const warnings = lint(form, steps);
  const totalMinutes = steps.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const setField = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  function updateStep(key, patch) {
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addStep() {
    const step = emptyStep();
    setSteps((list) => [...list, step]);
    setOpenKey(step.key);
  }

  function moveStep(index, dir) {
    setSteps((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function removeStep(step) {
    const hasContent = step.title || step.body || step.checklistText;
    if (hasContent && !confirm(`Удалить шаг «${step.title || 'без названия'}»?`)) return;
    setSteps((list) => list.filter((s) => s.key !== step.key));
  }

  async function save(status) {
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      status,
      steps: steps.map((s) => ({
        id: s.id,
        title: s.title,
        body: s.body,
        tip: s.tip,
        minutes: Number(s.minutes) || 5,
        checklist: s.checklistText.split('\n').map((l) => l.trim()).filter(Boolean),
      })),
    };

    try {
      if (isNew) {
        const { id: newId } = await api('/guides', { method: 'POST', body: payload });
        navigate(`/me/guides/${newId}/edit`, { replace: true });
      } else {
        await api(`/guides/${id}`, { method: 'PUT', body: payload });
        // перечитываем, чтобы у новых шагов появились id
        applyGuide(await api(`/guides/${id}`));
      }
      setSavedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function splitText() {
    setAiLoading(true);
    setAiInfo(null);
    try {
      const res = await api('/assist/split', { method: 'POST', body: { text: aiText } });
      const generated = res.steps.map((s) => ({
        ...emptyStep(),
        title: s.title,
        body: s.body,
        tip: s.tip || '',
        minutes: s.minutes || 5,
        checklistText: (s.checklist || []).join('\n'),
      }));
      const onlyEmpty = steps.every((s) => !s.title && !s.body && !s.checklistText);
      setSteps(onlyEmpty ? generated : [...steps, ...generated]);
      setAiInfo(
        `Добавлено шагов: ${generated.length} (${res.source === 'ai' ? 'разбивала нейросеть' : 'по нумерации и спискам в тексте'}). Проверьте их ниже.`,
      );
      setAiText('');
    } catch (err) {
      setAiInfo(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <div>
          <Link to="/me" className="back-link">← Кабинет</Link>
          <h1>{isNew ? 'Новая инструкция' : 'Редактирование'}</h1>
          {(forkedFrom || location.state?.forked) && (
            <p className="notice">
              Это ваша копия{forkedFrom?.title && <> инструкции «<Link to={`/g/${forkedFrom.id}`}>{forkedFrom.title}</Link>»</>}.
              Улучшите её и опубликуйте — она появится в разделе «Улучшенные версии» у оригинала.
            </p>
          )}
        </div>
        <div className="editor-actions">
          {savedAt && <span className="muted small">Сохранено в {savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}
          {!isNew && <Link to={`/g/${id}`} className="btn" target="_blank">Открыть</Link>}
          <button className="btn" onClick={() => save('draft')} disabled={saving}>
            {form.status === 'published' ? 'Снять с публикации' : 'Сохранить черновик'}
          </button>
          <button className="btn btn-primary" onClick={() => save('published')} disabled={saving}>
            {saving ? 'Сохраняем…' : form.status === 'published' ? 'Сохранить' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      <div className="editor-layout">
        <div>
          <section className="card form-grid">
            <label className="span-2">
              Название
              <input value={form.title} onChange={setField('title')} placeholder="Как …" maxLength={120} />
            </label>
            <label className="span-2">
              Описание
              <textarea
                value={form.description}
                onChange={setField('description')}
                rows={3}
                placeholder="Для кого эта инструкция и что получится в конце"
              />
            </label>
            <label>
              Категория
              <select value={form.category} onChange={setField('category')}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Сложность
              <select value={form.difficulty} onChange={setField('difficulty')}>
                <option value="easy">Легко</option>
                <option value="medium">Средне</option>
                <option value="hard">Сложно</option>
              </select>
            </label>
            <label className="span-2">
              Теги через запятую
              <input value={form.tags} onChange={setField('tags')} placeholder="docker, linux, установка" />
            </label>
          </section>

          <section className="card ai-box">
            <button className="ai-toggle" onClick={() => setAiOpen(!aiOpen)}>
              {aiOpen ? 'Скрыть разбивку текста' : 'Вставить готовый текст и разбить на шаги'}
            </button>
            {aiOpen && (
              <>
                <p className="muted small">
                  Вставьте инструкцию с форума, из заметок или чата. Нумерованные пункты станут шагами, а пункты списков — чек-листом.
                </p>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  rows={7}
                  placeholder={'1. Скачайте установщик с официального сайта\n- проверьте разрядность системы\n2. Запустите установку...'}
                />
                <button className="btn btn-primary btn-small" onClick={splitText} disabled={aiLoading || aiText.trim().length < 20}>
                  {aiLoading ? 'Разбираем…' : 'Разбить на шаги'}
                </button>
              </>
            )}
            {aiInfo && <p className="notice">{aiInfo}</p>}
          </section>

          <div className="steps-head">
            <h2>Шаги <span className="muted">· всего ~{formatMinutes(totalMinutes)}</span></h2>
            <label className="toggle">
              <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
              предпросмотр
            </label>
          </div>

          {steps.map((s, i) => {
            const open = openKey === s.key || steps.length === 1;
            return (
              <section key={s.key} className={`card step-editor ${open ? 'open' : ''}`}>
                <div className="step-editor-head" onClick={() => setOpenKey(open && steps.length > 1 ? null : s.key)}>
                  <span className="step-num">{i + 1}</span>
                  <b>{s.title || 'Новый шаг'}</b>
                  <span className="muted small">
                    {s.checklistText.split('\n').filter((l) => l.trim()).length} пунктов · {s.minutes} мин
                  </span>
                  <div className="step-editor-tools" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => moveStep(i, -1)} disabled={i === 0} title="Выше">↑</button>
                    <button className="icon-btn" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Ниже">↓</button>
                    <button className="icon-btn danger" onClick={() => removeStep(s)} title="Удалить">✕</button>
                  </div>
                </div>

                {open && (
                  <div className="step-editor-body">
                    <label>
                      Что сделать
                      <input
                        value={s.title}
                        onChange={(e) => updateStep(s.key, { title: e.target.value })}
                        placeholder="Например: Установите процессор"
                        autoFocus={!s.title}
                      />
                    </label>
                    <label>
                      Подробности <span className="muted small">(**жирный**, `код`, ``` блок кода ```, списки через «-»)</span>
                      <textarea value={s.body} onChange={(e) => updateStep(s.key, { body: e.target.value })} rows={6} />
                    </label>
                    {preview && s.body && (
                      <div className="preview">
                        <Markdown text={s.body} />
                      </div>
                    )}
                    <label>
                      Чек-лист — каждый пункт с новой строки
                      <textarea
                        value={s.checklistText}
                        onChange={(e) => updateStep(s.key, { checklistText: e.target.value })}
                        rows={3}
                        placeholder={'Кабель подключён\nИндикатор горит'}
                      />
                    </label>
                    <div className="form-row">
                      <label className="grow">
                        Совет (необязательно)
                        <input value={s.tip} onChange={(e) => updateStep(s.key, { tip: e.target.value })} placeholder="Частая ошибка на этом шаге…" />
                      </label>
                      <label className="narrow">
                        Минут
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={s.minutes}
                          onChange={(e) => updateStep(s.key, { minutes: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          <button className="btn btn-block add-step" onClick={addStep}>
            + Добавить шаг
          </button>
        </div>

        <aside>
          <div className="card sticky lint">
            <h3>Проверка качества</h3>
            {warnings.length === 0 ? (
              <p className="lint-ok">Замечаний нет.</p>
            ) : (
              <ul>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <p className="muted small">
              После публикации в «Аналитике» будет видно, на каких шагах читатели застревают и бросают.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
