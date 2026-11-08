// Fluxos de login/logout com o Google usados pelas telas.
import * as G from './google.js';
import { state, setSetting, emit } from './store.js';
import { refreshAuthState, scheduleSync } from './sync.js';
import { h, sheet, toast } from './util.js';
import { icon } from './icons.js';

let expiryTimer = null;

export function watchExpiry() {
  clearTimeout(expiryTimer);
  const ms = G.tokenExpiresAt() - 60_000 - Date.now();
  if (ms > 0) expiryTimer = setTimeout(() => { refreshAuthState(); watchExpiry(); }, Math.min(ms + 500, 2 ** 31 - 1));
}

async function afterLogin() {
  try {
    const a = await G.about();
    const u = (a && a.user) || {};
    const prev = state.settings.account;
    await setSetting('account', { email: u.emailAddress || '', name: u.displayName || '', photo: u.photoLink || '' });
    if (prev && prev.email && u.emailAddress && prev.email !== u.emailAddress) {
      toast('Você entrou com outra conta. As pregações serão salvas nesta conta.');
    }
  } catch (e) {
    console.warn('Não foi possível ler os dados da conta', e);
    if (!state.settings.account) await setSetting('account', { email: '', name: '', photo: '' });
  }
  refreshAuthState();
  watchExpiry();
  emit('auth');
  scheduleSync(0);
}

/** Entrar com o Google (pop-up). Chame a partir de um toque. */
export async function login({ silent = false } = {}) {
  if (!G.isConfigured()) { if (!silent) location.hash = '#/configurar-google'; return false; }
  if (!navigator.onLine) { if (!silent) toast('Sem internet. Conecte-se para entrar com o Google.'); return false; }
  try {
    const acc = state.settings.account;
    await G.signIn({ hint: acc && acc.email ? acc.email : undefined });
    await afterLogin();
    if (!silent) toast('Conectado ao Google ✓');
    return true;
  } catch (e) {
    if (!silent) loginErrorSheet(e);
    return false;
  }
}

/**
 * Reconecta sem perguntar nada quando a conexão expirou (chame dentro de um toque,
 * por exemplo no "Concluir"). Se a pessoa já autorizou antes, a janela do Google
 * abre e fecha sozinha.
 */
export function reconnectIfExpired() {
  if (G.isConfigured() && navigator.onLine && state.settings.account && !G.getToken()) login({ silent: true });
}

function loginErrorSheet(e) {
  const s = sheet('Não deu para entrar', h('div', null,
    h('p', { class: 'sheet-text' }, e && e.message ? e.message : 'Não foi possível entrar com o Google.'),
    h('p', { class: 'sheet-text muted' }, 'Nada do que você digitou foi perdido: está tudo guardado neste aparelho.'),
    h('div', { class: 'sheet-actions stack' },
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { s.close(); login(); } }, icon('refresh'), 'Tentar de novo'),
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button',
        onclick: () => G.signInRedirect(location.hash || '#/'),
      }, icon('external'), 'Entrar pelo navegador (sem pop-up)'),
    )
  ));
}

/** Volta de um login por redirecionamento. */
export async function finishRedirectLogin() {
  const r = G.handleRedirectResult();
  if (!r) return;
  if (r.ok) await afterLogin().then(() => toast('Conectado ao Google ✓'));
  else toast(r.error);
}

export async function logout() {
  await G.signOut();
  await setSetting('account', null);
  await setSetting('drive', null);
  refreshAuthState();
  emit('auth');
  toast('Você saiu da conta Google. Suas pregações continuam neste aparelho.');
}
