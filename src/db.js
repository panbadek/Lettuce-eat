import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slots TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meeting_responses (
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL,
    name TEXT NOT NULL,
    slots TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (meeting_id, name_key)
  );

  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_entries (
    meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (meal_id, name_key)
  );
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const q = {
    insertMeeting: db.prepare('INSERT INTO meetings (id, title, slots, created_at) VALUES (?, ?, ?, ?)'),
    getMeeting: db.prepare('SELECT id, title, slots, created_at FROM meetings WHERE id = ?'),
    listResponses: db.prepare(
      'SELECT name, slots, updated_at FROM meeting_responses WHERE meeting_id = ? ORDER BY updated_at',
    ),
    upsertResponse: db.prepare(`
      INSERT INTO meeting_responses (meeting_id, name_key, name, slots, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (meeting_id, name_key)
      DO UPDATE SET name = excluded.name, slots = excluded.slots, updated_at = excluded.updated_at
    `),
    deleteResponse: db.prepare('DELETE FROM meeting_responses WHERE meeting_id = ? AND name_key = ?'),

    insertMeal: db.prepare('INSERT INTO meals (id, title, created_at) VALUES (?, ?, ?)'),
    getMeal: db.prepare('SELECT id, title, created_at FROM meals WHERE id = ?'),
    listEntries: db.prepare(
      'SELECT name, amount, unit, updated_at FROM meal_entries WHERE meal_id = ? ORDER BY updated_at',
    ),
    upsertEntry: db.prepare(`
      INSERT INTO meal_entries (meal_id, name_key, name, amount, unit, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (meal_id, name_key)
      DO UPDATE SET name = excluded.name, amount = excluded.amount, unit = excluded.unit,
                    updated_at = excluded.updated_at
    `),
    deleteEntry: db.prepare('DELETE FROM meal_entries WHERE meal_id = ? AND name_key = ?'),
  };

  const now = () => new Date().toISOString();

  return {
    close: () => db.close(),

    createMeeting(id, title, slots) {
      q.insertMeeting.run(id, title, JSON.stringify(slots), now());
    },
    getMeeting(id) {
      const row = q.getMeeting.get(id);
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        slots: JSON.parse(row.slots),
        createdAt: row.created_at,
        responses: q.listResponses.all(id).map((r) => ({
          name: r.name,
          slots: JSON.parse(r.slots),
          updatedAt: r.updated_at,
        })),
      };
    },
    saveResponse(meetingId, nameKey, name, slots) {
      q.upsertResponse.run(meetingId, nameKey, name, JSON.stringify(slots), now());
    },
    deleteResponse(meetingId, nameKey) {
      return q.deleteResponse.run(meetingId, nameKey).changes > 0;
    },

    createMeal(id, title) {
      q.insertMeal.run(id, title, now());
    },
    getMeal(id) {
      const row = q.getMeal.get(id);
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        entries: q.listEntries.all(id).map((e) => ({
          name: e.name,
          amount: e.amount,
          unit: e.unit,
          updatedAt: e.updated_at,
        })),
      };
    },
    saveEntry(mealId, nameKey, name, amount, unit) {
      q.upsertEntry.run(mealId, nameKey, name, amount, unit, now());
    },
    deleteEntry(mealId, nameKey) {
      return q.deleteEntry.run(mealId, nameKey).changes > 0;
    },
  };
}
