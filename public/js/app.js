import { h, storage } from './ui.js';
import { renderCreateMeeting, renderCreateMeal } from './create.js';
import { renderMeeting } from './meeting.js';
import { renderMeal } from './meal.js';

const root = document.getElementById('app');

function renderHome() {
  const tabs = [
    { key: 'spotkanie', label: '📅 Spotkanie', render: renderCreateMeeting, lead: 'Wybierz możliwe dni i godziny, wyślij link – każdy zaznaczy, kiedy może.' },
    { key: 'posilek', label: '🍕 Posiłek', render: renderCreateMeal, lead: 'Zbierz, kto ile zje – w tostach, hot dogach z Żabki albo kawałkach pizzy.' },
  ];
  const initial = new URLSearchParams(location.search).get('tab') ?? storage.get('home:tab') ?? 'spotkanie';
  const panel = h('div', { id: 'tab-panel', role: 'tabpanel' });
  const lead = h('p', { class: 'lead' });

  const buttons = tabs.map((t) =>
    h('button', { type: 'button', role: 'tab', class: 'tab', id: `tab-${t.key}`, 'aria-controls': 'tab-panel', dataset: { key: t.key } }, t.label),
  );

  function select(key) {
    const tab = tabs.find((t) => t.key === key) ?? tabs[0];
    buttons.forEach((b) => {
      const on = b.dataset.key === tab.key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${tab.key}`);
    lead.textContent = tab.lead;
    panel.replaceChildren(tab.render());
    storage.set('home:tab', tab.key);
    const url = tab.key === 'spotkanie' ? '/' : `/?tab=${tab.key}`;
    history.replaceState(null, '', url);
  }

  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.key)));
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Co tworzysz?' }, buttons);
  tablist.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.focus();
    select(next.dataset.key);
  });

  root.replaceChildren(tablist, lead, panel);
  select(initial);
}

const path = location.pathname.replace(/\/+$/, '');
let match;
if ((match = path.match(/^\/spotkanie\/([\w-]+)$/))) {
  renderMeeting(root, match[1]);
} else if ((match = path.match(/^\/posilek\/([\w-]+)$/))) {
  renderMeal(root, match[1]);
} else {
  renderHome();
}
