import { h, api, toast, storage, shareBox } from './ui.js';
import { notFound } from './meeting.js';
import { UNITS, UNIT_KEYS, MAX_AMOUNT, parseAmount, convert, totals, formatAmount } from '../shared/food.js';

const REFRESH_MS = 15000;
const AMOUNT_RE = /^\s*\d+([.,]\d)?\s*$/;
const PIZZA_SLICES = 8;

function equivalents(amount, unit) {
  const c = convert(amount, unit);
  return UNIT_KEYS.map((k) => `${UNITS[k].emoji} ${formatAmount(c[k])}`).join('  ·  ');
}

export async function renderMeal(root, id) {
  let meal;
  try {
    meal = await api('GET', `/meals/${id}`);
  } catch (err) {
    root.replaceChildren(notFound(err));
    return;
  }

  document.title = `${meal.title} – Lettuce Eat`;
  const isNew = new URLSearchParams(location.search).has('nowe');
  if (isNew) history.replaceState(null, '', location.pathname);
  const nameKey = `meal:${id}:name`;

  const findEntry = (name) =>
    meal.entries.find((e) => e.name.toLocaleLowerCase('pl') === name?.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl'));

  // ---------- form ----------
  const nameInput = h('input', {
    type: 'text',
    maxlength: '40',
    placeholder: 'Twoje imię',
    autocomplete: 'given-name',
    'aria-label': 'Twoje imię',
    value: storage.get(nameKey) ?? '',
  });
  const amountInput = h('input', {
    type: 'text',
    inputmode: 'decimal',
    placeholder: 'np. 2,5',
    'aria-label': 'Ilość',
    class: 'amount',
  });
  let unit = 'toast';
  const unitButtons = UNIT_KEYS.map((key) => {
    const btn = h(
      'button',
      { type: 'button', class: 'unit', dataset: { unit: key }, 'aria-pressed': 'false' },
      h('span', { class: 'unit-emoji' }, UNITS[key].emoji),
      h('span', { class: 'unit-label' }, UNITS[key].label),
    );
    btn.addEventListener('click', () => {
      unit = key;
      syncUnits();
      updatePreview();
    });
    return btn;
  });
  const syncUnits = () =>
    unitButtons.forEach((b) => {
      const on = b.dataset.unit === unit;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });

  const preview = h('p', { class: 'preview' });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Zapisz');

  function updatePreview() {
    const raw = amountInput.value;
    if (!raw.trim()) {
      preview.textContent = 'Wpisz ilość – przeliczę ją na pozostałe jednostki.';
      preview.className = 'preview muted';
      return;
    }
    if (!AMOUNT_RE.test(raw)) {
      preview.textContent = 'Podaj liczbę z maks. jednym miejscem po przecinku, np. 1,5';
      preview.className = 'preview err-text';
      return;
    }
    const amount = parseAmount(raw);
    if (!(amount > 0) || amount > MAX_AMOUNT) {
      preview.textContent = `Ilość musi być większa od 0 i nie większa niż ${MAX_AMOUNT}.`;
      preview.className = 'preview err-text';
      return;
    }
    preview.textContent = `= ${equivalents(amount, unit)}`;
    preview.className = 'preview';
  }

  function syncFromName() {
    const existing = findEntry(nameInput.value);
    submit.textContent = existing ? 'Zaktualizuj' : 'Zapisz';
    return existing;
  }

  function fillFrom(entry) {
    nameInput.value = entry.name;
    amountInput.value = formatAmount(entry.amount);
    unit = entry.unit;
    syncUnits();
    updatePreview();
    syncFromName();
  }

  nameInput.addEventListener('input', syncFromName);
  nameInput.addEventListener('change', () => {
    const existing = syncFromName();
    if (existing && !amountInput.value.trim()) fillFrom(existing);
  });
  amountInput.addEventListener('input', updatePreview);

  const form = h(
    'form',
    { class: 'stack-sm', novalidate: true },
    h('label', { class: 'field' }, h('span', {}, 'Imię'), nameInput),
    h('div', { class: 'field' }, h('span', {}, 'Ile zjesz?'), h('div', { class: 'units' }, unitButtons)),
    h('label', { class: 'field' }, h('span', {}, 'Ilość'), amountInput),
    preview,
    submit,
    h('p', { class: 'muted small' }, 'Przelicznik: 1 hot dog = 4 połówki tosta = 3 kawałki pizzy. Wpisanie tego samego imienia ponownie poprawia Twój wpis.'),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      toast('Podaj imię', 'err');
      nameInput.focus();
      return;
    }
    if (!AMOUNT_RE.test(amountInput.value)) {
      toast('Podaj ilość, np. 2 albo 1,5', 'err');
      amountInput.focus();
      return;
    }
    const amount = parseAmount(amountInput.value);
    if (!(amount > 0) || amount > MAX_AMOUNT) {
      toast(`Ilość musi być większa od 0 i nie większa niż ${MAX_AMOUNT}`, 'err');
      return;
    }
    submit.disabled = true;
    try {
      meal = await api('PUT', `/meals/${id}/entries`, { name, amount, unit });
      storage.set(nameKey, name);
      toast('Zapisano ✔');
      renderList();
      syncFromName();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- list + totals ----------
  const listCard = h('section', { class: 'card' });
  const totalsBox = h('section', { class: 'card totals' });
  const subtitle = h('p', { class: 'muted' });

  function renderList() {
    const n = meal.entries.length;
    subtitle.textContent = n === 0 ? 'Nikt jeszcze się nie wpisał.' : `Wpisy: ${n}`;

    if (n === 0) {
      listCard.replaceChildren(h('h2', {}, 'Kto ile zje'), h('p', { class: 'empty' }, 'Bądź pierwszy! 🍽️'));
    } else {
      const rows = meal.entries.map((e) => {
        const c = convert(e.amount, e.unit);
        const edit = h('button', { class: 'btn btn-icon btn-ghost', type: 'button', title: 'Edytuj', 'aria-label': `Edytuj ${e.name}` }, '✏️');
        edit.addEventListener('click', () => {
          fillFrom(e);
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          amountInput.focus();
        });
        const del = h('button', { class: 'btn btn-icon btn-ghost', type: 'button', title: 'Usuń', 'aria-label': `Usuń ${e.name}` }, '🗑️');
        del.addEventListener('click', async () => {
          if (!confirm(`Usunąć wpis „${e.name}”?`)) return;
          try {
            meal = await api('DELETE', `/meals/${id}/entries/${encodeURIComponent(e.name)}`);
            toast('Usunięto wpis');
            renderList();
            syncFromName();
          } catch (err) {
            toast(err.message, 'err');
          }
        });
        return h(
          'tr',
          {},
          h('td', { class: 'strong' }, e.name),
          h('td', { class: 'declared' }, `${formatAmount(e.amount)} ${UNITS[e.unit].emoji}`),
          UNIT_KEYS.map((k) => h('td', { class: `num${k === e.unit ? ' own' : ''}` }, formatAmount(c[k]))),
          h('td', { class: 'row-actions' }, edit, del),
        );
      });
      listCard.replaceChildren(
        h('h2', {}, 'Kto ile zje'),
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'entries' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, 'Imię'),
                h('th', {}, 'Podał(a)'),
                UNIT_KEYS.map((k) => h('th', { class: 'num', title: UNITS[k].label }, UNITS[k].emoji)),
                h('th', {}, h('span', { class: 'sr-only' }, 'Akcje')),
              ),
            ),
            h('tbody', {}, rows),
          ),
        ),
      );
    }

    const sum = totals(meal.entries);
    const tile = (key, hint) =>
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'tile-emoji' }, UNITS[key].emoji),
        h('div', { class: 'tile-value' }, formatAmount(sum[key])),
        h('div', { class: 'tile-label' }, UNITS[key].label),
        hint ? h('div', { class: 'tile-hint' }, hint) : null,
      );
    totalsBox.replaceChildren(
      h('h2', {}, 'Razem'),
      h(
        'div',
        { class: 'tiles' },
        tile('toast', `całe tosty: ${formatAmount(sum.toast / 2)}`),
        tile('hotdog'),
        tile('pizza', `całe pizze (po ${PIZZA_SLICES} kaw.): ${formatAmount(sum.pizza / PIZZA_SLICES)}`),
      ),
      h('p', { class: 'muted small center' }, 'Każda kolumna to ta sama ilość jedzenia – wybierz, co zamawiacie.'),
    );
  }

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('p', { class: 'kicker' }, '🍕 Posiłek'), h('h1', {}, meal.title), subtitle),
    shareBox(location.origin + location.pathname, meal.title, { highlight: isNew }),
    h('div', { class: 'two-col meal' }, h('section', { class: 'card' }, h('h2', {}, 'Twój apetyt'), form), listCard),
    totalsBox,
  );

  syncUnits();
  updatePreview();
  const remembered = findEntry(nameInput.value);
  if (remembered) fillFrom(remembered);
  renderList();

  setInterval(async () => {
    if (document.hidden) return;
    try {
      const fresh = await api('GET', `/meals/${id}`);
      if (JSON.stringify(fresh.entries) === JSON.stringify(meal.entries)) return;
      meal = fresh;
      renderList();
      syncFromName();
    } catch {
      // try again next tick
    }
  }, REFRESH_MS);
}
