// Componentes visuais reutilizáveis.
import { h, dayBadge, fmtDuration } from './util.js';
import { icon } from './icons.js';
import { state } from './store.js';
import { refLabel, typeLabel } from './schema.js';
import * as G from './google.js';
import { retry } from './sync.js';
import { login } from './auth.js';

/** Situação da sincronização de uma pregação com o Google Docs. */
export function syncInfo(s) {
  if (!G.isConfigured()) return { cls: 'local', ic: 'phone', label: 'Só neste aparelho' };
  if (s.syncStatus === 'synced') return { cls: 'ok', ic: 'cloudCheck', label: 'Salvo no Docs ✓' };
  if (s.syncStatus === 'error') return { cls: 'err', ic: 'alert', label: 'Erro – tocar para tentar de novo', action: 'retry' };
  if (!state.online) return { cls: 'wait', ic: 'cloudOff', label: 'Aguardando internet' };
  if (state.auth !== 'signed-in') return { cls: 'auth', ic: 'login', label: 'Entre no Google para salvar', action: 'login' };
  if (s.syncStatus === 'syncing' || state.syncing) return { cls: 'busy', ic: 'refresh', label: 'Salvando no Docs…' };
  return { cls: 'busy', ic: 'cloud', label: 'Enviando para o Docs…' };
}

export function syncStatusEl(s, { big = false } = {}) {
  const info = syncInfo(s);
  const content = [icon(info.ic, info.cls === 'busy' && s.syncStatus === 'syncing' ? 'spin' : ''), h('span', null, info.label)];
  if (info.action) {
    return h('button', {
      class: `status status-${info.cls}${big ? ' status-big' : ''}`, type: 'button',
      title: s.syncError || '',
      onclick: (e) => {
        e.stopPropagation();
        if (info.action === 'retry') retry(s.id);
        else login();
      },
    }, content);
  }
  return h('span', { class: `status status-${info.cls}${big ? ' status-big' : ''}` }, content);
}

export function tagChip(t, i = 0, extra = {}) {
  return h('span', { class: `chip chip-tag ${i % 2 ? 'chip-aqua' : 'chip-pink'}`, ...extra }, '#' + t);
}

/** Cor da etiqueta estável pelo nome. */
export function tagTone(t) {
  let x = 0;
  for (const c of t) x = (x + c.charCodeAt(0)) % 2;
  return x;
}

export function sermonCard(s, { onFav } = {}) {
  const b = dayBadge(s.dateTime);
  const open = () => { location.hash = '#/p/' + s.id; };
  return h('article', {
    class: 'card sermon-card', tabindex: '0', role: 'link', 'aria-label': `${s.title || 'Sem título'} – abrir`,
    onclick: open,
    onkeydown: (e) => { if (e.key === 'Enter') open(); },
  },
  h('div', { class: 'date-badge', 'aria-hidden': 'true' }, h('b', null, b.day), h('span', null, b.month)),
  h('div', { class: 'card-main' },
    h('h3', { class: 'card-title' }, s.title || 'Sem título', s.draft ? h('span', { class: 'chip chip-draft' }, 'rascunho') : null),
    h('p', { class: 'card-sub' }, [s.preacher, typeLabel(s.type)].filter(Boolean).join(' · ') || 'Pregador não informado'),
    h('div', { class: 'chips' },
      s.baseText && s.baseText.book ? h('span', { class: 'chip chip-ref' }, icon('book'), refLabel(s.baseText)) : null,
      (s.tags || []).slice(0, 3).map((t) => tagChip(t, tagTone(t)))
    ),
    syncStatusEl(s)
  ),
  h('button', {
    class: 'fav-btn' + (s.favorite ? ' on' : ''), type: 'button', 'aria-pressed': s.favorite ? 'true' : 'false',
    'aria-label': s.favorite ? 'Remover dos favoritos' : 'Favoritar',
    onclick: (e) => { e.stopPropagation(); onFav && onFav(s); },
  }, icon('star'))
  );
}

export function topBar({ title, back, actions = [], big = false }) {
  return h('header', { class: 'topbar' + (big ? ' topbar-big' : '') },
    back ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Voltar', onclick: back }, icon('arrowLeft')) : null,
    h('h1', { class: 'topbar-title' }, title),
    h('div', { class: 'topbar-actions' }, actions)
  );
}

export function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, h('i'), h('i')),
    h('h2', null, title),
    h('p', null, text),
    action || null
  );
}

export function recordingBadge(cur) {
  return h('span', { class: 'rec-dot' + (cur.paused ? ' paused' : '') }, fmtDuration(cur.elapsed));
}
