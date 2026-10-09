import { h, api, toast, foodIcon } from './ui.js';
import { createCalendar } from './calendar.js';
import { createPaintGrid } from './grid.js';
import { timesBetween, minutesToTime, makeSlot, slotDate, slotTime } from '../shared/slots.js';

const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => minutesToTime(i * 30)); // 00:00 … 24:00

function timeSelect(value, { includeEnd }) {
  const options = includeEnd ? TIME_OPTIONS.slice(1) : TIME_OPTIONS.slice(0, -1);
  return h(
    'select',
    {},
    options.map((t) => h('option', { value: t, selected: t === value }, t)),
  );
}

export function renderCreateMeeting() {
  const days = new Set();
  const slots = new Set();
  let from = '09:00';
  let to = '17:00';

  const titleInput = h('input', {
    type: 'text',
    maxlength: '100',
    placeholder: 'np. Planszówki u Kuby',
    required: true,
    'aria-label': 'Nazwa spotkania',
  });

  const fromSel = timeSelect(from, { includeEnd: false });
  const toSel = timeSelect(to, { includeEnd: true });
  const gridHolder = h('div', { class: 'grid-holder' });
  const summary = h('p', { class: 'muted small' });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Utwórz spotkanie i link');

  const calendar = createCalendar({ selected: days, onChange: renderGrid });

  function pruneSlots() {
    const times = new Set(timesBetween(from, to));
    for (const s of [...slots]) {
      if (!days.has(slotDate(s)) || !times.has(slotTime(s))) slots.delete(s);
    }
  }

  function currentCells() {
    const dates = [...days].sort();
    const times = timesBetween(from, to);
    return { dates, times };
  }

  function updateSummary() {
    const hours = slots.size / 2;
    summary.textContent = slots.size
      ? `Wybrano ${slots.size} × 30 min (${hours.toLocaleString('pl-PL')} h) w ${new Set([...slots].map(slotDate)).size} dniach.`
      : 'Zaznacz w siatce godziny, które pasują Tobie jako organizatorowi.';
  }

  function renderGrid() {
    pruneSlots();
    const { dates, times } = currentCells();
    if (dates.length === 0) {
      gridHolder.replaceChildren(h('p', { class: 'empty' }, '👆 Najpierw wybierz dni w kalendarzu.'));
    } else if (times.length === 0) {
      gridHolder.replaceChildren(h('p', { class: 'empty' }, 'Godzina „do” musi być późniejsza niż „od”.'));
    } else {
      gridHolder.replaceChildren(createPaintGrid({ dates, times, selected: slots, onChange: updateSummary }));
    }
    updateSummary();
  }

  fromSel.addEventListener('change', () => {
    from = fromSel.value;
    renderGrid();
  });
  toSel.addEventListener('change', () => {
    to = toSel.value;
    renderGrid();
  });

  const selectAll = h('button', { class: 'btn btn-small', type: 'button' }, 'Zaznacz wszystko');
  const clearAll = h('button', { class: 'btn btn-small', type: 'button' }, 'Wyczyść');
  selectAll.addEventListener('click', () => {
    const { dates, times } = currentCells();
    for (const d of dates) for (const t of times) slots.add(makeSlot(d, t));
    renderGrid();
  });
  clearAll.addEventListener('click', () => {
    slots.clear();
    renderGrid();
  });

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h('section', { class: 'card' }, h('h2', {}, h('span', { class: 'step' }, '1'), 'Nazwa spotkania'), titleInput),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, h('span', { class: 'step' }, '2'), 'Wybierz możliwe dni'),
      h('p', { class: 'muted small' }, 'Kliknij dni (albo przeciągnij po kilku).'),
      calendar,
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, h('span', { class: 'step' }, '3'), 'Wybierz możliwe godziny'),
      h('div', { class: 'row wrap' }, h('label', { class: 'inline' }, 'od ', fromSel), h('label', { class: 'inline' }, 'do ', toSel), h('div', { class: 'spacer' }), selectAll, clearAll),
      h('p', { class: 'muted small' }, 'Każde pole to 30 minut. Kliknij lub przeciągnij, żeby zaznaczyć.'),
      gridHolder,
      summary,
    ),
    submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('Podaj nazwę spotkania', 'err');
      titleInput.focus();
      return;
    }
    if (slots.size === 0) {
      toast('Zaznacz co najmniej jeden termin', 'err');
      return;
    }
    submit.disabled = true;
    try {
      const { id } = await api('POST', '/meetings', { title, slots: [...slots] });
      location.href = `/spotkanie/${id}?nowe=1`;
    } catch (err) {
      toast(err.message, 'err');
      submit.disabled = false;
    }
  });

  renderGrid();
  return form;
}

export function renderCreateMeal() {
  const titleInput = h('input', {
    type: 'text',
    maxlength: '100',
    placeholder: 'np. Kolacja w piątek',
    required: true,
    'aria-label': 'Nazwa posiłku',
  });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Utwórz posiłek i link');

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Nazwa posiłku'),
      titleInput,
      h(
        'p',
        { class: 'muted small' },
        'Każda osoba z linkiem poda swoje imię i ile zje – w połówkach tosta, małych hot dogach z Żabki albo kawałkach średniej pizzy. Aplikacja przeliczy wszystko i pokaże sumę.',
      ),
      h(
        'div',
        { class: 'rate' },
        h('span', { class: 'eqv' }, foodIcon('hotdog', { decorative: true }), '1 hot dog'),
        h('span', { class: 'eq' }, '='),
        h('span', { class: 'eqv' }, foodIcon('toast', { decorative: true }), '4 połówki tosta'),
        h('span', { class: 'eq' }, '='),
        h('span', { class: 'eqv' }, foodIcon('pizza', { decorative: true }), '3 kawałki pizzy'),
      ),
    ),
    submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('Podaj nazwę posiłku', 'err');
      titleInput.focus();
      return;
    }
    submit.disabled = true;
    try {
      const { id } = await api('POST', '/meals', { title });
      location.href = `/posilek/${id}?nowe=1`;
    } catch (err) {
      toast(err.message, 'err');
      submit.disabled = false;
    }
  });

  return form;
}
