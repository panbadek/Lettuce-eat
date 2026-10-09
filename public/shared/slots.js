// Shared between the browser and the server.
// A slot is a 30-minute block identified by its local start time: "YYYY-MM-DDTHH:MM".

export const SLOT_MINUTES = 30;
export const SLOT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(00|30)$/;

export function isValidSlot(slot) {
  const m = SLOT_RE.exec(slot);
  if (!m) return false;
  const [, y, mo, d, h] = m.map(Number);
  if (h > 23) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function slotDate(slot) {
  return slot.slice(0, 10);
}

export function slotTime(slot) {
  return slot.slice(11);
}

export function makeSlot(date, time) {
  return `${date}T${time}`;
}

export function minutesToTime(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** All slot start times between `from` (inclusive) and `to` (exclusive), e.g. "09:00".."17:00". */
export function timesBetween(from, to) {
  const out = [];
  for (let t = timeToMinutes(from); t < timeToMinutes(to); t += SLOT_MINUTES) {
    out.push(minutesToTime(t));
  }
  return out;
}

/** Derives the grid (sorted unique dates and continuous time rows) covering the given slots. */
export function gridFromSlots(slots) {
  const dates = [...new Set(slots.map(slotDate))].sort();
  const mins = slots.map((s) => timeToMinutes(slotTime(s)));
  if (mins.length === 0) return { dates: [], times: [] };
  const from = Math.min(...mins);
  const to = Math.max(...mins) + SLOT_MINUTES;
  const times = [];
  for (let t = from; t < to; t += SLOT_MINUTES) times.push(minutesToTime(t));
  return { dates, times };
}
