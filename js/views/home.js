// Tela inicial: lembretes, "Relembre", busca, filtros e lista de pregações.
import { h, clear, norm, monthLabel, greeting, sheet, fmtDate, plural } from '../util.js';
import { icon } from '../icons.js';
import { state, on, sortedSermons, patchSermon, setSetting } from '../store.js';
import { searchBlob, typeLabel, SERMON_TYPES } from '../schema.js';
import { sermonCard, emptyState } from '../components.js';
import { dueReminders, answerReminder, weeklyPick } from '../reminders.js';
import { enqueue } from '../sync.js';
import { installButton } from '../install.js';
import { cultNow, slots as cultSlots, slotLabel, startFromCult, openCultEditor } from '../cultos.js';

// Filtros ficam em memória enquanto o app está aberto.
const filters = { q: '', fav: false, preacher: '', book: '', tag: '', type: '' };
let pickOffset = 0;

function hasFilters() { return !!(filters.q || filters.fav || filters.preacher || filters.book || filters.tag || filters.type); }

function applyFilters(list) {
  const tokens = norm(filters.q).split(/\s+/).filter(Boolean);
  return list.filter((s) => {
    if (filters.fav && !s.favorite) return false;
    if (filters.preacher && norm(s.preacher) !== norm(filters.preacher)) return false;
    if (filters.book && !((s.baseText && s.baseText.book === filters.book) || (s.supportVerses || []).some((v) => v.book === filters.book))) return false;
    if (filters.tag && !(s.tags || []).some((t) => norm(t) === norm(filters.tag))) return false;
    if (filters.type && s.type !== filters.type) return false;
    if (tokens.length) {
      const blob = norm(searchBlob(s));
      if (!tokens.every((t) => blob.includes(t))) return false;
    }
    return true;
  });
}

async function toggleFav(s) {
  await patchSermon(s.id, (r) => { r.favorite = !r.favorite; });
}

export function renderHome(root) {
  const listHost = h('div', { class: 'list' });
  const topHost = h('div', { class: 'home-top' });
  const chipsHost = h('div', { class: 'filter-row', role: 'toolbar', 'aria-label': 'Filtros' });

  const search = h('input', {
    class: 'search-input', type: 'search', placeholder: 'Buscar pregador, livro, etiqueta…', value: filters.q,
    'aria-label': 'Buscar pregações', enterkeyhint: 'search',
    oninput: (e) => { filters.q = e.target.value; drawList(); drawTop(); },
  });

  root.appendChild(h('div', { class: 'view view-home' },
    h('header', { class: 'home-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, greeting() + ' 👋'),
        h('h1', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i')), 'Selah')
      ),
      installButton() || h('p', { class: 'brand-tag' }, 'pausa para refletir')
    ),
    topHost,
    h('div', { class: 'search-wrap' }, icon('search'), search),
    chipsHost,
    listHost,
    h('div', { class: 'fab-space' })
  ));

  root.appendChild(h('a', { class: 'fab', href: '#/nova' }, icon('plus'), 'Nova pregação'));

  function drawTop() {
    clear(topHost);
    if (hasFilters()) return;
    // Hora do culto
    const c = cultNow();
    if (c) topHost.appendChild(cultCard(c));
    else if (!cultSlots().length && state.sermons.length >= 1 && !state.settings.cultTipDismissed) topHost.appendChild(cultTip());
    // Lembretes de aplicação
    for (const s of dueReminders().slice(0, 2)) topHost.appendChild(reminderCard(s));
    // Relembre
    const pick = weeklyPick(pickOffset);
    if (pick) topHost.appendChild(relembreCard(pick));
  }

  function cultCard(c) {
    const started = Date.now() >= c.start;
    return h('section', { class: 'card card-cult', 'aria-label': 'Hora do culto' },
      h('p', { class: 'eyebrow' }, icon('bell'), started ? 'O culto começou' : 'O culto já vai começar'),
      h('h2', { class: 'card-h' }, 'Hora de anotar a pregação ✍️'),
      h('p', { class: 'card-sub' }, slotLabel(c.slot)),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startFromCult(c.slot) }, icon('plus'), 'Anotar agora')));
  }

  function cultTip() {
    return h('section', { class: 'card card-tip' },
      h('p', { class: 'eyebrow' }, icon('calendar'), 'Dica'),
      h('h2', { class: 'card-h' }, 'Quer um lembrete na hora do culto?'),
      h('p', { class: 'card-sub' }, 'Cadastre os dias e horários dos seus cultos e o Selah avisa para você anotar.'),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-soft', type: 'button', onclick: () => openCultEditor(refresh) }, icon('plus'), 'Cadastrar horários'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => setSetting('cultTipDismissed', true) }, 'Agora não')));
  }

  function reminderCard(s) {
    const items = (s.practice || []).filter((p) => p.text && p.text.trim());
    return h('section', { class: 'card card-reminder', 'aria-label': 'Lembrete de aplicação' },
      h('p', { class: 'eyebrow' }, icon('bell'), 'Lembrete'),
      h('h2', { class: 'card-h' }, 'Você colocou em prática o que ouviu?'),
      h('p', { class: 'card-sub' }, h('a', { href: '#/p/' + s.id }, s.title || 'Pregação'), s.preacher ? ` · ${s.preacher}` : '', ` · ${fmtDate(s.dateTime)}`),
      h('ul', { class: 'check-list' }, items.map((p) => h('li', null,
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: p.done,
            onchange: async (e) => {
              const done = e.target.checked;
              await patchSermon(s.id, (r) => {
                const it = (r.practice || []).find((x) => x.id === p.id);
                if (it) { it.done = done; it.doneAt = done ? Date.now() : null; }
                r.updatedAt = Date.now(); r.syncStatus = 'pending';
              });
              enqueue(s.id, 2000);
            },
          }),
          h('span', { class: 'check-box', 'aria-hidden': 'true' }, icon('check')),
          h('span', null, p.text)
        )))),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn btn-coral', type: 'button', onclick: async () => {
          await patchSermon(s.id, (r) => {
            (r.practice || []).forEach((x) => { if (x.text && x.text.trim() && !x.done) { x.done = true; x.doneAt = Date.now(); } });
            r.updatedAt = Date.now(); r.syncStatus = 'pending';
          });
          await answerReminder(s.id, 'yes');
          enqueue(s.id, 2000);
          celebrate();
        } }, 'Sim, coloquei! 🎉'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => answerReminder(s.id, 'later') }, 'Ainda não')
      )
    );
  }

  function relembreCard({ sermon: s, total }) {
    const frase = String(s.answers.frase || '').replace(/^["“”]+|["“”]+$/g, '');
    return h('section', { class: 'card card-relembre', 'aria-label': 'Relembre' },
      h('div', { class: 'relembre-head' },
        h('p', { class: 'eyebrow' }, icon('sparkle'), 'Relembre'),
        total > 1 ? h('button', { class: 'link-btn', type: 'button', onclick: () => { pickOffset++; drawTop(); } }, icon('refresh'), 'Outra') : null
      ),
      h('blockquote', { class: 'quote' }, `“${frase}”`),
      h('a', { class: 'relembre-meta', href: '#/p/' + s.id },
        h('strong', null, s.title || 'Sem título'),
        h('span', null, [s.preacher, fmtDate(s.dateTime)].filter(Boolean).join(' · ')),
        icon('arrowRight'))
    );
  }

  function drawChips() {
    clear(chipsHost);
    chipsHost.appendChild(h('button', {
      class: 'fchip' + (filters.fav ? ' on' : ''), type: 'button', 'aria-pressed': String(filters.fav),
      onclick: () => { filters.fav = !filters.fav; refresh(); },
    }, icon('star'), 'Favoritas'));
    const defs = [
      ['preacher', 'Pregador', 'user', () => countBy((s) => s.preacher && s.preacher.trim() ? [s.preacher.trim()] : [])],
      ['book', 'Livro', 'book', () => countBy((s) => [s.baseText && s.baseText.book, ...(s.supportVerses || []).map((v) => v.book)].filter(Boolean))],
      ['tag', 'Etiqueta', 'tag', () => countBy((s) => s.tags || [])],
      ['type', 'Tipo', 'pin', () => SERMON_TYPES.map((t) => [t.id, state.sermons.filter((s) => s.type === t.id).length, t.label]).filter((x) => x[1])],
    ];
    for (const [key, label, ic, options] of defs) {
      const val = filters[key];
      chipsHost.appendChild(h('button', {
        class: 'fchip' + (val ? ' on' : ''), type: 'button',
        onclick: () => {
          if (val) { filters[key] = ''; refresh(); return; }
          pickFilter(label, options(), (v) => { filters[key] = v; refresh(); });
        },
      }, icon(ic), val ? (key === 'type' ? typeLabel(val) : val) : label, val ? icon('x', 'ic-sm') : icon('chevronDown', 'ic-sm')));
    }
  }

  function countBy(fn) {
    const m = new Map();
    for (const s of state.sermons) {
      for (const v of new Set(fn(s))) {
        const k = norm(v);
        const cur = m.get(k) || [v, 0];
        cur[1]++;
        m.set(k, cur);
      }
    }
    return [...m.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function pickFilter(label, options, onPick) {
    if (!options.length) {
      sheet(label, h('p', { class: 'sheet-text' }, 'Ainda não há opções. Elas aparecem conforme você registra pregações.'));
      return;
    }
    const s = sheet('Filtrar por ' + label.toLowerCase(), h('div', { class: 'option-list' },
      options.map(([value, n, text]) => h('button', {
        class: 'option', type: 'button', onclick: () => { s.close(); onPick(value); },
      }, h('span', null, text || value), h('span', { class: 'option-count' }, n)))
    ));
  }

  function drawList() {
    clear(listHost);
    const all = sortedSermons();
    if (!all.length) {
      listHost.appendChild(emptyState({
        title: 'Sua primeira pausa começa aqui',
        text: 'Toque em “Nova pregação” para registrar a próxima mensagem que ouvir. No culto, use o Modo culto (rápido). Em casa, aprofunde no Modo revisão.',
      }));
      return;
    }
    const list = applyFilters(all);
    if (hasFilters()) {
      listHost.appendChild(h('p', { class: 'result-count', role: 'status' }, list.length ? plural(list.length, 'pregação encontrada', 'pregações encontradas') : ''));
    }
    if (!list.length) {
      listHost.appendChild(emptyState({
        title: 'Nada encontrado',
        text: 'Tente outra palavra ou limpe os filtros.',
        action: h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { Object.assign(filters, { q: '', fav: false, preacher: '', book: '', tag: '', type: '' }); search.value = ''; refresh(); } }, 'Limpar filtros'),
      }));
      return;
    }
    let curMonth = null;
    for (const s of list) {
      const m = monthLabel(s.dateTime);
      if (m !== curMonth) { curMonth = m; listHost.appendChild(h('h2', { class: 'month' }, m)); }
      listHost.appendChild(sermonCard(s, { onFav: toggleFav }));
    }
  }

  function celebrate() {
    const c = h('div', { class: 'confetti', 'aria-hidden': 'true' }, Array.from({ length: 18 }, (_, i) => h('i', { style: { '--i': i } })));
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1400);
  }

  function refresh() { drawTop(); drawChips(); drawList(); }
  refresh();

  const offs = [on('sermons', refresh), on('sync', drawList), on('auth', drawList), on('online', drawList), on('settings', refresh)];
  return () => offs.forEach((f) => f());
}

