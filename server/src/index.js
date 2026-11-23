import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { loadUser } from './auth.js';
import { seed } from './seed.js';
import authRoutes from './routes/auth.js';
import guideRoutes from './routes/guides.js';
import runRoutes from './routes/runs.js';
import commentRoutes from './routes/comments.js';
import assistRoutes from './routes/assist.js';

// первый запуск на чистой базе — заливаем демо-данные, чтобы было что смотреть
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  console.log('База пустая, заполняю демо-данными…');
  seed();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(loadUser);

// клиент отправляет PATCH как POST + X-HTTP-Method-Override (см. client/src/api.js)
app.use((req, res, next) => {
  if (req.method === 'POST' && req.get('x-http-method-override') === 'PATCH') req.method = 'PATCH';
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/guides', guideRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/assist', assistRoutes);
app.use('/api', commentRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Нет такого метода API' }));

// в продакшене фронт собран в client/dist и раздаётся отсюда же
const dist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Ошибка на сервере, попробуйте ещё раз' : err.message });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
