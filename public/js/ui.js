// Small DOM + network helpers used by every page.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Błąd ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(message, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = `toast ${kind}`), 2600);
}

export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private mode etc. – it's only a convenience
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

/** Box with the shareable link, a copy button and (where supported) the native share sheet. */
export function shareBox(url, title, { highlight = false } = {}) {
  const input = h('input', { class: 'share-url', type: 'text', readonly: true, value: url, 'aria-label': 'Link' });
  input.addEventListener('focus', () => input.select());

  const copyBtn = h('button', { class: 'btn', type: 'button' }, '📋 Kopiuj');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = '✅ Skopiowano';
    setTimeout(() => (copyBtn.textContent = '📋 Kopiuj'), 1800);
  });

  const buttons = [copyBtn];
  if (navigator.share) {
    const shareBtn = h('button', { class: 'btn btn-primary', type: 'button' }, '📤 Udostępnij');
    shareBtn.addEventListener('click', () => {
      navigator.share({ title, text: title, url }).catch(() => {});
    });
    buttons.push(shareBtn);
  }

  return h(
    'section',
    { class: `card share${highlight ? ' share-highlight' : ''}` },
    highlight ? h('p', { class: 'share-title' }, '🎉 Gotowe! Wyślij ten link znajomym:') : h('p', { class: 'share-title' }, 'Link do udostępnienia:'),
    h('div', { class: 'share-row' }, input, h('div', { class: 'share-buttons' }, buttons)),
  );
}

const weekdayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' });
const longFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "pon. 12.10" */
export function formatDayShort(dateStr) {
  const d = parseDate(dateStr);
  return {
    weekday: weekdayFmt.format(d),
    date: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}

/** "poniedziałek, 12 października" */
export function formatDayLong(dateStr) {
  return longFmt.format(parseDate(dateStr));
}

/**
 * Click-and-drag toggling of many elements at once (mouse and touch).
 * The first element touched decides whether the drag selects or deselects.
 * With `rect: true` elements need data-col/data-row and the drag selects the
 * rectangle between the start and the current cell (like When2meet / Lettuce Meet);
 * otherwise only the cells under the pointer path are toggled.
 */
export function attachPainter(container, { selector, isSelected, apply, onEnd, rect = false }) {
  let painting = null; // true = selecting, false = deselecting
  let touched = new Set();
  let start = null;
  let snapshot = null; // rect mode: state of every cell before the drag

  const isOff = (el) => el.disabled || el.classList.contains('disabled');
  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest(selector);
  const pos = (el) => [Number(el.dataset.col), Number(el.dataset.row)];

  function paint(el) {
    if (!el || !container.contains(el) || touched.has(el) || isOff(el)) return;
    touched.add(el);
    apply(el, painting);
  }

  function paintRect(el) {
    if (!el || !container.contains(el)) return;
    const [c0, r0] = pos(start);
    const [c1, r1] = pos(el);
    const [cMin, cMax] = [Math.min(c0, c1), Math.max(c0, c1)];
    const [rMin, rMax] = [Math.min(r0, r1), Math.max(r0, r1)];
    for (const [cell, was] of snapshot) {
      const [c, r] = pos(cell);
      const want = c >= cMin && c <= cMax && r >= rMin && r <= rMax ? painting : was;
      if (isSelected(cell) !== want) apply(cell, want);
    }
  }

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest(selector);
    if (!el || isOff(el)) return;
    e.preventDefault();
    // Touch pointers are implicitly captured by the first element; release so we can track movement.
    if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
    painting = !isSelected(el);
    if (rect) {
      start = el;
      snapshot = new Map([...container.querySelectorAll(selector)].filter((c) => !isOff(c)).map((c) => [c, isSelected(c)]));
      paintRect(el);
    } else {
      touched = new Set();
      paint(el);
    }
  });

  container.addEventListener('pointermove', (e) => {
    if (painting === null) return;
    const el = targetAt(e.clientX, e.clientY);
    if (rect) paintRect(el);
    else paint(el);
  });

  const end = () => {
    if (painting === null) return;
    painting = null;
    touched = new Set();
    start = null;
    snapshot = null;
    onEnd?.();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // Keyboard access: Space/Enter toggles the focused element.
  container.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const el = e.target.closest(selector);
    if (!el || el.disabled || el.classList.contains('disabled')) return;
    e.preventDefault();
    apply(el, !isSelected(el));
    onEnd?.();
  });

  return () => {
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
}
