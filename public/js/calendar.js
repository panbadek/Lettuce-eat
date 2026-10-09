import { h, attachPainter, toDateStr } from './ui.js';

const WEEKDAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
const monthFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });

/**
 * Month calendar where the user picks any number of days (click or drag).
 * `selected` is a Set of "YYYY-MM-DD" strings that is mutated in place.
 */
export function createCalendar({ selected, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  const title = h('div', { class: 'cal-title' });
  const prev = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Poprzedni miesiąc' }, '‹');
  const next = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Następny miesiąc' }, '›');
  const days = h('div', { class: 'cal-days' });
  const root = h(
    'div',
    { class: 'calendar' },
    h('div', { class: 'cal-header' }, prev, title, next),
    h('div', { class: 'cal-weekdays' }, WEEKDAYS.map((d) => h('div', {}, d))),
    days,
  );

  prev.addEventListener('click', () => {
    if (viewMonth === 0) [viewYear, viewMonth] = [viewYear - 1, 11];
    else viewMonth -= 1;
    render();
  });
  next.addEventListener('click', () => {
    if (viewMonth === 11) [viewYear, viewMonth] = [viewYear + 1, 0];
    else viewMonth += 1;
    render();
  });

  attachPainter(days, {
    selector: '.cal-day',
    isSelected: (el) => selected.has(el.dataset.date),
    apply: (el, on) => {
      if (on) selected.add(el.dataset.date);
      else selected.delete(el.dataset.date);
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', String(on));
    },
    onEnd: () => onChange?.(),
  });

  function render() {
    title.textContent = monthFmt.format(new Date(viewYear, viewMonth, 1));
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    prev.disabled = isCurrentMonth;

    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    days.replaceChildren();
    for (let i = 0; i < offset; i++) days.append(h('div', { class: 'cal-empty' }));
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const dateStr = toDateStr(date);
      const past = date < today;
      const on = selected.has(dateStr);
      days.append(
        h(
          'button',
          {
            type: 'button',
            class: `cal-day${on ? ' selected' : ''}${dateStr === todayStr ? ' today' : ''}`,
            dataset: { date: dateStr },
            disabled: past,
            'aria-pressed': String(on),
            'aria-label': date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }),
          },
          String(d),
        ),
      );
    }
  }

  render();
  return root;
}
