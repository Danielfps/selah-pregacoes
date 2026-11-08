// Estatísticas, calculadas a partir do cache local.
import { h, clear, parseLocal, weekStart, weekKey, plural, norm } from '../util.js';
import { icon } from '../icons.js';
import { state, on } from '../store.js';
import { typeLabel } from '../schema.js';
import { topBar, emptyState } from '../components.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function computeStats(list) {
  const valid = list.filter((s) => !isNaN(parseLocal(s.dateTime)));
  const count = (fn) => {
    const m = new Map();
    for (const s of list) for (const v of new Set(fn(s).filter(Boolean))) {
      const k = norm(v);
      const cur = m.get(k) || { label: v, n: 0 };
      cur.n++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  };

  // Semanas com registro
  const weeks = new Set(valid.map((s) => weekKey(parseLocal(s.dateTime))));
  const thisWeek = weekStart(new Date());
  let cursor = new Date(thisWeek);
  if (!weeks.has(weekKey(cursor))) cursor = new Date(cursor.getTime() - WEEK); // semana atual ainda em aberto
  let current = 0;
  while (weeks.has(weekKey(cursor))) { current++; cursor = new Date(cursor.getTime() - WEEK); }
  const sortedWeeks = [...weeks].sort();
  let best = 0; let run = 0; let prev = null;
  for (const wk of sortedWeeks) {
    const d = parseLocal(wk);
    run = prev && Math.round((d - prev) / WEEK) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const strip = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(thisWeek.getTime() - i * WEEK);
    const n = valid.filter((s) => weekKey(parseLocal(s.dateTime)) === weekKey(d)).length;
    strip.push({ d, n });
  }

  const practice = list.flatMap((s) => (s.practice || []).filter((p) => p.text && p.text.trim()));
  const done = practice.filter((p) => p.done).length;
  const now = new Date();
  const thisMonth = valid.filter((s) => { const d = parseLocal(s.dateTime); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;

  return {
    total: list.length,
    thisMonth,
    favorites: list.filter((s) => s.favorite).length,
    books: count((s) => [s.baseText && s.baseText.book]),
    preachers: count((s) => [s.preacher && s.preacher.trim()]),
    tags: count((s) => s.tags || []),
    types: count((s) => [typeLabel(s.type)]),
    streak: current,
    bestStreak: best,
    strip,
    practiceTotal: practice.length,
    practiceDone: done,
    practicePct: practice.length ? Math.round((done / practice.length) * 100) : 0,
    attachments: list.reduce((n, s) => n + (s.attachments || []).length, 0),
  };
}

function achievements(st) {
  return [
    { ok: st.total >= 1, ic: 'sparkle', label: 'Primeira pausa', sub: '1 pregação' },
    { ok: st.total >= 10, ic: 'book', label: 'Ouvinte fiel', sub: '10 pregações' },
    { ok: st.total >= 50, ic: 'trophy', label: 'Biblioteca viva', sub: '50 pregações' },
    { ok: st.bestStreak >= 4, ic: 'flame', label: 'Constância', sub: '4 semanas seguidas' },
    { ok: st.bestStreak >= 12, ic: 'flame', label: 'Trimestre firme', sub: '12 semanas seguidas' },
    { ok: st.practiceDone >= 10, ic: 'hand', label: 'Praticante', sub: '10 aplicações feitas' },
  ];
}

export function renderStats(root) {
  const wrap = h('div', { class: 'view view-stats' });
  root.appendChild(wrap);

  function bars(title, ic, items, max = 6, tone = 'violet') {
    const top = items.slice(0, max);
    const peak = top.length ? top[0].n : 1;
    return h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-h' }, icon(ic), title),
      top.length ? h('ol', { class: 'bars' }, top.map((it) => h('li', { class: 'bar-row' },
        h('span', { class: 'bar-label' }, it.label),
        h('span', { class: 'bar-track', 'aria-hidden': 'true' }, h('span', { class: `bar-fill ${tone}`, style: { width: Math.max(8, (it.n / peak) * 100) + '%' } })),
        h('span', { class: 'bar-n' }, String(it.n))))) : h('p', { class: 'field-hint' }, 'Ainda sem dados.'));
  }

  function draw() {
    clear(wrap);
    wrap.appendChild(topBar({ title: 'Estatísticas', big: true }));
    if (!state.sermons.length) {
      wrap.appendChild(emptyState({ title: 'Ainda não há números', text: 'Assim que você registrar pregações, aparecem aqui seus livros, pregadores e etiquetas favoritos.', action: h('a', { class: 'btn btn-primary', href: '#/nova' }, icon('plus'), 'Nova pregação') }));
      return;
    }
    const st = computeStats(state.sermons);
    const peakWeek = Math.max(1, ...st.strip.map((w) => w.n));
    wrap.appendChild(h('div', { class: 'tiles' },
      h('div', { class: 'tile tile-violet' }, h('b', null, String(st.total)), h('span', null, st.total === 1 ? 'pregação registrada' : 'pregações registradas')),
      h('div', { class: 'tile tile-lime' }, h('b', null, String(st.streak)), h('span', null, st.streak === 1 ? 'semana seguida' : 'semanas seguidas'), h('small', null, `recorde: ${plural(st.bestStreak, 'semana', 'semanas')}`)),
      h('div', { class: 'tile tile-coral' }, h('b', null, st.practicePct + '%'), h('span', null, 'das aplicações feitas'), h('small', null, `${st.practiceDone} de ${st.practiceTotal}`)),
      h('div', { class: 'tile tile-pink' }, h('b', null, String(st.thisMonth)), h('span', null, 'neste mês'), h('small', null, `${plural(st.favorites, 'favorita', 'favoritas')}`))
    ));

    wrap.appendChild(h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-h' }, icon('flame'), 'Últimas 12 semanas'),
      h('div', { class: 'week-strip', role: 'img', 'aria-label': `Pregações por semana nas últimas 12 semanas: ${st.strip.map((w) => w.n).join(', ')}` },
        st.strip.map((w) => h('span', { class: 'wk' + (w.n ? ' has' : ''), style: { '--h': Math.round((w.n / peakWeek) * 100) + '%' }, title: `${w.d.toLocaleDateString('pt-BR')} – ${w.n}` }, h('i')))),
      h('p', { class: 'field-hint' }, 'Cada barra é uma semana (segunda a domingo).')));

    wrap.appendChild(h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-h' }, icon('hand'), 'Colocando em prática'),
      h('div', { class: 'ring-row' },
        h('div', { class: 'ring', style: { '--p': st.practicePct }, role: 'img', 'aria-label': `${st.practicePct}% das aplicações feitas` }, h('span', null, st.practicePct + '%')),
        h('p', null, st.practiceTotal ? `Você marcou ${plural(st.practiceDone, 'ação como feita', 'ações como feitas')} de ${st.practiceTotal}.` : 'Adicione ações em “O que vou colocar em prática nesta semana?” no Modo revisão.'))));

    wrap.appendChild(bars('Livros mais pregados', 'book', st.books));
    wrap.appendChild(bars('Pregadores mais ouvidos', 'user', st.preachers, 6, 'coral'));
    wrap.appendChild(bars('Etiquetas mais usadas', 'tag', st.tags, 8, 'pink'));
    wrap.appendChild(bars('Tipos de culto', 'pin', st.types, 5, 'aqua'));

    wrap.appendChild(h('section', { class: 'card stat-card' },
      h('h2', { class: 'card-h' }, icon('trophy'), 'Conquistas'),
      h('ul', { class: 'badges' }, achievements(st).map((a) => h('li', { class: 'badge' + (a.ok ? ' ok' : '') },
        h('span', { class: 'badge-ic' }, icon(a.ic)), h('b', null, a.label), h('small', null, a.ok ? 'conquistada ✓' : a.sub))))));
  }
  draw();
  const off = on('sermons', draw);
  return () => off();
}
