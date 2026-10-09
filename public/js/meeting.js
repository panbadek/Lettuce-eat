import { h, api, toast, storage, shareBox, formatDayShort, formatDayLong } from './ui.js';
import { createPaintGrid, createHeatGrid } from './grid.js';
import { gridFromSlots, slotDate, slotTime, timeToMinutes, minutesToTime, SLOT_MINUTES } from '../shared/slots.js';

const REFRESH_MS = 15000;

function endOf(time) {
  return minutesToTime(timeToMinutes(time) + SLOT_MINUTES);
}

function availabilityMap(meeting) {
  const who = new Map(meeting.slots.map((s) => [s, []]));
  for (const r of meeting.responses) {
    for (const s of r.slots) who.get(s)?.push(r.name);
  }
  return who;
}

/** Merges consecutive slots on the same day with the same set of people into ranges, best first. */
export function bestRanges(meeting, who, limit = 5) {
  const ranges = [];
  let current = null;
  for (const slot of meeting.slots) {
    const names = who.get(slot) ?? [];
    const key = names.slice().sort().join('\u0000');
    const date = slotDate(slot);
    const time = slotTime(slot);
    if (current && current.date === date && current.key === key && current.end === time) {
      current.end = endOf(time);
    } else {
      current = { date, start: time, end: endOf(time), key, names };
      if (names.length > 0) ranges.push(current);
    }
  }
  const len = (r) => timeToMinutes(r.end) - timeToMinutes(r.start);
  ranges.sort((a, b) => b.names.length - a.names.length || len(b) - len(a) || a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return ranges.slice(0, limit);
}

export async function renderMeeting(root, id) {
  let meeting;
  try {
    meeting = await api('GET', `/meetings/${id}`);
  } catch (err) {
    root.replaceChildren(notFound(err));
    return;
  }

  document.title = `${meeting.title} – Lettuce Eat`;
  const params = new URLSearchParams(location.search);
  const isNew = params.has('nowe');
  if (isNew) history.replaceState(null, '', location.pathname);

  const nameKey = `meeting:${id}:name`;
  const { dates, times } = gridFromSlots(meeting.slots);
  const enabled = new Set(meeting.slots);

  let myName = storage.get(nameKey);
  let mySlots = new Set();
  let dirty = false;
  let focusName = null;

  const findResponse = (name) =>
    meeting.responses.find((r) => r.name.toLocaleLowerCase('pl') === name?.toLocaleLowerCase('pl'));

  function loadMine() {
    const existing = findResponse(myName);
    mySlots = new Set(existing?.slots ?? []);
    if (existing) myName = existing.name;
    dirty = false;
  }
  if (myName) loadMine();

  const subtitle = h('p', { class: 'muted' });
  const mineCard = h('section', { class: 'card' });
  const groupCard = h('section', { class: 'card' });

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('p', { class: 'kicker' }, '📅 Spotkanie'), h('h1', {}, meeting.title), subtitle),
    shareBox(location.origin + location.pathname, meeting.title, { highlight: isNew }),
    h('div', { class: 'two-col' }, mineCard, groupCard),
  );

  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  // ---------- my availability ----------
  function renderMine() {
    if (!myName) {
      const input = h('input', {
        type: 'text',
        maxlength: '40',
        placeholder: 'Twoje imię',
        autocomplete: 'given-name',
        'aria-label': 'Twoje imię',
      });
      const form = h(
        'form',
        { class: 'stack-sm' },
        h('div', { class: 'row' }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Dalej')),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = input.value.replace(/\s+/g, ' ').trim();
        if (!name) {
          toast('Podaj imię', 'err');
          return;
        }
        myName = name;
        storage.set(nameKey, name);
        loadMine();
        renderMine();
      });
      mineCard.replaceChildren(
        h('h2', {}, 'Twoja dostępność'),
        h('p', {}, 'Podaj imię, a potem zaznacz terminy, które Ci pasują.'),
        form,
        h('p', { class: 'muted small' }, 'Odpowiadałeś/aś już? Wpisz to samo imię, żeby edytować swoje terminy.'),
      );
      setTimeout(() => input.focus(), 0);
      return;
    }

    const existing = findResponse(myName);
    const status = h('p', { class: 'muted small save-status' });
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Zapisz zmiany' : 'Zapisz');
    const updateStatus = () => {
      status.textContent = dirty
        ? 'Masz niezapisane zmiany.'
        : existing
          ? 'Zapisane ✔'
          : 'Zaznacz terminy i kliknij „Zapisz”.';
      status.classList.toggle('warn', dirty);
      saveBtn.disabled = !dirty && Boolean(existing);
    };
    const markDirty = () => {
      dirty = true;
      updateStatus();
    };

    const holder = h('div');
    const drawGrid = () =>
      holder.replaceChildren(createPaintGrid({ dates, times, enabled, selected: mySlots, onChange: markDirty }));
    drawGrid();

    const allBtn = h('button', { class: 'btn btn-small', type: 'button' }, 'Pasuje mi wszystko');
    allBtn.addEventListener('click', () => {
      mySlots = new Set(meeting.slots);
      drawGrid();
      markDirty();
    });
    const noneBtn = h('button', { class: 'btn btn-small', type: 'button' }, 'Wyczyść');
    noneBtn.addEventListener('click', () => {
      mySlots = new Set();
      drawGrid();
      markDirty();
    });

    const change = h('button', { class: 'link', type: 'button' }, 'zmień imię');
    change.addEventListener('click', () => {
      if (dirty && !confirm('Masz niezapisane zmiany. Na pewno zmienić imię?')) return;
      myName = null;
      dirty = false;
      storage.remove(nameKey);
      renderMine();
    });

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        meeting = await api('PUT', `/meetings/${id}/responses`, { name: myName, slots: [...mySlots] });
        dirty = false;
        loadMine();
        toast('Zapisano Twoje terminy ✔');
        renderMine();
        renderGroup();
      } catch (err) {
        toast(err.message, 'err');
        saveBtn.disabled = false;
      }
    });

    const extra = [];
    if (existing) {
      const del = h('button', { class: 'btn btn-small btn-danger', type: 'button' }, 'Usuń moją odpowiedź');
      del.addEventListener('click', async () => {
        if (!confirm(`Usunąć odpowiedź „${existing.name}”?`)) return;
        try {
          meeting = await api('DELETE', `/meetings/${id}/responses/${encodeURIComponent(existing.name)}`);
          loadMine();
          toast('Usunięto odpowiedź');
          renderMine();
          renderGroup();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
      extra.push(del);
    }

    mineCard.replaceChildren(
      h('h2', {}, 'Twoja dostępność'),
      h('p', {}, 'Zaznaczasz jako ', h('strong', {}, myName), ' · ', change),
      h('div', { class: 'row wrap' }, allBtn, noneBtn),
      h('p', { class: 'muted small' }, 'Kliknij lub przeciągnij po polach, które Ci pasują. Szare pola nie są w propozycji organizatora.'),
      holder,
      h('div', { class: 'row wrap actions' }, saveBtn, h('div', { class: 'spacer' }), extra),
      status,
    );
    updateStatus();
  }

  // ---------- group availability ----------
  function renderGroup() {
    const total = meeting.responses.length;
    subtitle.textContent =
      total === 0 ? 'Nikt jeszcze nie odpowiedział.' : `Odpowiedzi: ${total}`;

    const who = availabilityMap(meeting);
    const inspect = h('div', { class: 'inspect' });
    const allNames = meeting.responses.map((r) => r.name);

    function showInspect(slot) {
      if (!slot) {
        inspect.replaceChildren(
          h('p', { class: 'muted small' }, total ? 'Najedź lub kliknij pole, żeby zobaczyć, kto może.' : 'Tu pojawi się, kto może w danym terminie.'),
        );
        return;
      }
      const yes = who.get(slot) ?? [];
      const no = allNames.filter((n) => !yes.includes(n));
      const { weekday, date } = formatDayShort(slotDate(slot));
      inspect.replaceChildren(
        h('p', { class: 'inspect-title' }, `${weekday} ${date}, ${slotTime(slot)}–${endOf(slotTime(slot))} · ${yes.length}/${total}`),
        h(
          'div',
          { class: 'inspect-cols' },
          h('div', {}, h('p', { class: 'small strong ok-text' }, '✅ Mogą'), yes.length ? h('ul', {}, yes.map((n) => h('li', {}, n))) : h('p', { class: 'muted small' }, '—')),
          h('div', {}, h('p', { class: 'small strong err-text' }, '❌ Nie mogą'), no.length ? h('ul', {}, no.map((n) => h('li', {}, n))) : h('p', { class: 'muted small' }, '—')),
        ),
      );
    }

    const heat = createHeatGrid({ dates, times, enabled, who, total, onInspect: showInspect });
    showInspect(null);

    function applyFocus() {
      heat.classList.toggle('focus-mode', Boolean(focusName));
      heat.querySelectorAll('button.heat').forEach((cell) => {
        const names = who.get(cell.dataset.slot) ?? [];
        cell.classList.toggle('hl', Boolean(focusName) && names.includes(focusName));
      });
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.name === focusName));
    }

    if (focusName && !allNames.includes(focusName)) focusName = null;
    const chips = h(
      'div',
      { class: 'chips' },
      allNames.map((name) => {
        const r = findResponse(name);
        const chip = h(
          'button',
          { type: 'button', class: 'chip', dataset: { name }, title: 'Pokaż terminy tej osoby' },
          name,
          r.slots.length === 0 ? h('span', { class: 'muted' }, ' (nic nie pasuje)') : null,
        );
        chip.addEventListener('click', () => {
          focusName = focusName === name ? null : name;
          applyFocus();
        });
        return chip;
      }),
    );
    applyFocus();

    const best = bestRanges(meeting, who);
    const bestList = best.length
      ? h(
          'ol',
          { class: 'best' },
          best.map((r) => {
            const missing = allNames.filter((n) => !r.names.includes(n));
            return h(
              'li',
              {},
              h('span', { class: 'best-when' }, `${formatDayLong(r.date)}, ${r.start}–${r.end}`),
              h('span', { class: `badge${r.names.length === total ? ' badge-full' : ''}` }, `${r.names.length}/${total}`),
              missing.length ? h('div', { class: 'muted small' }, `brakuje: ${missing.join(', ')}`) : h('div', { class: 'muted small' }, 'pasuje wszystkim 🎉'),
            );
          }),
        )
      : h('p', { class: 'muted small' }, 'Brak wspólnych terminów (jeszcze).');

    groupCard.replaceChildren(
      h('h2', {}, 'Dostępność grupy'),
      h(
        'div',
        { class: 'legend' },
        h('span', {}, `0/${total}`),
        h('span', { class: 'legend-bar' }),
        h('span', {}, `${total}/${total} dostępnych`),
      ),
      heat,
      inspect,
      total ? h('h3', {}, 'Kto odpowiedział') : null,
      total ? chips : null,
      total ? h('p', { class: 'muted small' }, 'Kliknij imię, żeby podświetlić terminy tej osoby.') : null,
      h('h3', {}, 'Najlepsze terminy'),
      bestList,
    );
  }

  renderMine();
  renderGroup();

  // Keep the group view fresh while people are answering.
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const fresh = await api('GET', `/meetings/${id}`);
      if (JSON.stringify(fresh.responses) === JSON.stringify(meeting.responses)) return;
      meeting = fresh;
      renderGroup();
      if (!dirty && myName && findResponse(myName)) {
        loadMine();
        renderMine();
      }
    } catch {
      // offline for a moment – try again next tick
    }
  }, REFRESH_MS);
}

export function notFound(err) {
  return h(
    'section',
    { class: 'card center' },
    h('h1', {}, err?.status === 404 ? 'Nie znaleziono 🥬' : 'Ups, coś poszło nie tak'),
    h('p', { class: 'muted' }, err?.status === 404 ? 'Ten link jest nieprawidłowy albo wygasł.' : err?.message),
    h('a', { class: 'btn btn-primary', href: '/' }, 'Utwórz nowe'),
  );
}
