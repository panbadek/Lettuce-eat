import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { isValidSlot } from '../public/shared/slots.js';
import { UNITS, MAX_AMOUNT, parseAmount } from '../public/shared/food.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

const MAX_TITLE = 100;
const MAX_NAME = 40;
const MAX_SLOTS = 3000; // ~62 days of full 24h coverage
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newId(length = 10) {
  const bytes = randomBytes(length);
  let id = '';
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, max, field) {
  if (typeof value !== 'string') throw new HttpError(400, `Brak pola: ${field}`);
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s) throw new HttpError(400, `Pole „${field}” nie może być puste`);
  if (s.length > max) throw new HttpError(400, `Pole „${field}” może mieć maks. ${max} znaków`);
  return s;
}

function cleanName(value) {
  const name = cleanText(value, MAX_NAME, 'imię');
  return { name, key: name.toLocaleLowerCase('pl') };
}

function cleanSlots(value, { allowEmpty, allowed } = {}) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Nieprawidłowa lista terminów');
  if (value.length > MAX_SLOTS) throw new HttpError(400, 'Za dużo terminów');
  const unique = [...new Set(value)];
  for (const s of unique) {
    if (typeof s !== 'string' || !isValidSlot(s)) throw new HttpError(400, `Nieprawidłowy termin: ${s}`);
    if (allowed && !allowed.has(s)) throw new HttpError(400, `Termin ${s} nie należy do tego spotkania`);
  }
  if (!allowEmpty && unique.length === 0) throw new HttpError(400, 'Wybierz co najmniej jeden termin');
  return unique.sort();
}

export function createApp({ dbPath = join(ROOT, 'data', 'lettuce-eat.db') } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  const api = express.Router();

  // ---- Meetings ----
  api.post('/meetings', (req, res) => {
    const title = cleanText(req.body?.title, MAX_TITLE, 'nazwa spotkania');
    const slots = cleanSlots(req.body?.slots);
    const id = newId();
    db.createMeeting(id, title, slots);
    res.status(201).json({ id });
  });

  function loadMeeting(id) {
    const meeting = db.getMeeting(id);
    if (!meeting) throw new HttpError(404, 'Nie znaleziono spotkania');
    return meeting;
  }

  api.get('/meetings/:id', (req, res) => {
    res.json(loadMeeting(req.params.id));
  });

  api.put('/meetings/:id/responses', (req, res) => {
    const meeting = loadMeeting(req.params.id);
    const { name, key } = cleanName(req.body?.name);
    const slots = cleanSlots(req.body?.slots, { allowEmpty: true, allowed: new Set(meeting.slots) });
    db.saveResponse(meeting.id, key, name, slots);
    res.json(loadMeeting(meeting.id));
  });

  api.delete('/meetings/:id/responses/:name', (req, res) => {
    const meeting = loadMeeting(req.params.id);
    const { key } = cleanName(req.params.name);
    if (!db.deleteResponse(meeting.id, key)) throw new HttpError(404, 'Nie znaleziono odpowiedzi');
    res.json(loadMeeting(meeting.id));
  });

  // ---- Meals ----
  api.post('/meals', (req, res) => {
    const title = cleanText(req.body?.title, MAX_TITLE, 'nazwa posiłku');
    const id = newId();
    db.createMeal(id, title);
    res.status(201).json({ id });
  });

  function loadMeal(id) {
    const meal = db.getMeal(id);
    if (!meal) throw new HttpError(404, 'Nie znaleziono posiłku');
    return meal;
  }

  api.get('/meals/:id', (req, res) => {
    res.json(loadMeal(req.params.id));
  });

  api.put('/meals/:id/entries', (req, res) => {
    const meal = loadMeal(req.params.id);
    const { name, key } = cleanName(req.body?.name);
    const unit = req.body?.unit;
    if (!Object.hasOwn(UNITS, unit)) throw new HttpError(400, 'Nieprawidłowa jednostka');
    const amount = parseAmount(req.body?.amount);
    if (!(amount > 0) || amount > MAX_AMOUNT) {
      throw new HttpError(400, `Podaj ilość większą od 0 i nie większą niż ${MAX_AMOUNT}`);
    }
    db.saveEntry(meal.id, key, name, amount, unit);
    res.json(loadMeal(meal.id));
  });

  api.delete('/meals/:id/entries/:name', (req, res) => {
    const meal = loadMeal(req.params.id);
    const { key } = cleanName(req.params.name);
    if (!db.deleteEntry(meal.id, key)) throw new HttpError(404, 'Nie znaleziono wpisu');
    res.json(loadMeal(meal.id));
  });

  api.use((req, res) => res.status(404).json({ error: 'Nie znaleziono' }));

  app.use('/api', api);
  app.use(express.static(PUBLIC_DIR, { index: false }));

  // Single-page app: "/", "/spotkanie/:id" and "/posilek/:id" all serve the same shell.
  app.get(['/', '/spotkanie/:id', '/posilek/:id'], (req, res) => {
    res.sendFile(join(PUBLIC_DIR, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Nieprawidłowy JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Za duże żądanie' });
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  });

  app.locals.db = db;
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp(process.env.DB_PATH ? { dbPath: process.env.DB_PATH } : {});
  app.listen(port, () => {
    console.log(`Lettuce Eat działa na http://localhost:${port}`);
  });
}
