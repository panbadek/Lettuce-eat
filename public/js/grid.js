import { h, attachPainter, formatDayShort } from './ui.js';
import { makeSlot } from '../shared/slots.js';

function frame(dates, times, makeCell) {
  const grid = h('div', {
    class: 'tgrid',
    style: { gridTemplateColumns: `3.4rem repeat(${dates.length}, minmax(2.9rem, 1fr))` },
  });
  grid.append(h('div', { class: 'tgrid-corner' }));
  for (const date of dates) {
    const { weekday, date: dm } = formatDayShort(date);
    grid.append(h('div', { class: 'tgrid-day' }, h('span', { class: 'wd' }, weekday), h('span', { class: 'dm' }, dm)));
  }
  times.forEach((time, row) => {
    const fullHour = time.endsWith(':00');
    grid.append(h('div', { class: `tgrid-time${fullHour ? '' : ' half'}` }, fullHour ? time : ''));
    dates.forEach((date, col) => {
      const slot = makeSlot(date, time);
      const cell = makeCell(slot);
      cell.classList.add('tgrid-cell');
      if (!fullHour) cell.classList.add('half');
      cell.dataset.slot = slot;
      cell.dataset.col = col;
      cell.dataset.row = row;
      grid.append(cell);
    });
  });
  return h('div', { class: 'tgrid-scroll' }, grid);
}

/**
 * Grid where the user drags over 30-minute cells to mark them.
 * `enabled` (Set or null = everything) limits which cells can be marked; `selected` is mutated in place.
 */
export function createPaintGrid({ dates, times, enabled = null, selected, onChange }) {
  const root = frame(dates, times, (slot) => {
    const isEnabled = !enabled || enabled.has(slot);
    const on = isEnabled && selected.has(slot);
    return h('button', {
      type: 'button',
      class: `paint${on ? ' selected' : ''}${isEnabled ? '' : ' disabled'}`,
      disabled: !isEnabled,
      'aria-pressed': String(on),
      'aria-label': slot.replace('T', ' '),
      tabindex: isEnabled ? '0' : '-1',
    });
  });

  attachPainter(root, {
    selector: '.tgrid-cell',
    rect: true,
    isSelected: (el) => selected.has(el.dataset.slot),
    apply: (el, on) => {
      if (on) selected.add(el.dataset.slot);
      else selected.delete(el.dataset.slot);
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', String(on));
      onChange?.();
    },
  });

  return root;
}

/**
 * Read-only heat map: darker = more people available. Hover/tap a cell to see who.
 * `who` maps slot -> array of names available then.
 */
export function createHeatGrid({ dates, times, enabled, who, total, onInspect }) {
  let pinned = null;
  const root = frame(dates, times, (slot) => {
    if (!enabled.has(slot)) return h('div', { class: 'heat disabled', 'aria-hidden': 'true' });
    const n = who.get(slot)?.length ?? 0;
    const level = total ? n / total : 0;
    const cell = h('button', {
      type: 'button',
      class: `heat${n > 0 && n === total ? ' full' : ''}${level > 0.6 ? ' hot' : ''}`,
      style: { '--level': level.toFixed(3) },
      'aria-label': `${slot.replace('T', ' ')}: ${n} z ${total}`,
    });
    if (n > 0) cell.append(h('span', { class: 'heat-n' }, String(n)));
    return cell;
  });

  const show = (slot) => onInspect?.(slot);
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('button.heat');
    if (el) show(el.dataset.slot);
  });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') show(pinned);
  });
  root.addEventListener('click', (e) => {
    const el = e.target.closest('button.heat');
    if (!el) return;
    root.querySelectorAll('.heat.pinned').forEach((c) => c.classList.remove('pinned'));
    if (pinned === el.dataset.slot) {
      pinned = null;
    } else {
      pinned = el.dataset.slot;
      el.classList.add('pinned');
    }
    show(pinned);
  });
  root.addEventListener('focusin', (e) => {
    const el = e.target.closest('button.heat');
    if (el) show(el.dataset.slot);
  });

  return root;
}
