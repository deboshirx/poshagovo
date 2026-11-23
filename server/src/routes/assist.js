import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { splitByRules, splitWithAI } from '../lib/assist.js';
import { HttpError } from '../utils.js';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ ai: Boolean(process.env.ANTHROPIC_API_KEY) });
});

router.post('/split', requireAuth, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 20000) : '';
  if (text.trim().length < 20) throw new HttpError(400, 'Вставьте текст подлиннее');

  const aiSteps = await splitWithAI(text);
  if (aiSteps) return res.json({ source: 'ai', steps: aiSteps });

  res.json({ source: 'rules', steps: splitByRules(text) });
});

export default router;
