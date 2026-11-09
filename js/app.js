// Ponto de entrada: inicialização, rotas, barra de navegação, avisos e service worker.
import { h, clear, uid, nowLocalInput, toast, isStandalone, isIOS, sheet } from './util.js';
import { icon } from './icons.js';
import { state, on, emit, loadAll, putSermon, refreshQueueCount } from './store.js';
import { emptySermon } from './schema.js';
import * as G from './google.js';
import { refreshAuthState, scheduleSync, runSync } from './sync.js';
import { login, finishRedirectLogin, watchExpiry } from './auth.js';
import { notifyDue, registerPeriodic, notificationPermission } from './reminders.js';
import * as Rec from './recorder.js';
import { applyTheme, listenInstall } from './platform.js';
import { openInstall } from './install.js';
import { notifyCult } from './cultos.js';
import { APP_VERSION } from './platform.js';
import { setSetting } from './store.js';
import { renderHome } from './views/home.js';
import { renderEditor } from './views/editor.js';
import { renderDetail } from './views/detail.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderSetup } from './views/setup.js';

const viewEl = document.getElementById('view');
const bannersEl = document.getElementById('banners');
const navEl = document.getElementById('nav');
const recBarEl = document.getElementById('global-rec');

// ---------- Rotas ----------
const routes = [
  { re: /^#?\/?$/, view: renderHome, nav: 'home' },
  { re: /^#\/nova$/, view: newSermon },
  { re: /^#\/p\/([^/]+)$/, view: (root, m) => renderDetail(root, { id: decodeURIComponent(m[1]) }), nav: 'home' },
  { re: /^#\/p\/([^/]+)\/editar$/, view: (root, m) => renderEditor(root, { id: decodeURIComponent(m[1]) }), editor: true },
  { re: /^#\/estatisticas$/, view: renderStats, nav: 'stats' },
  { re: /^#\/config$/, view: renderSettings, nav: 'settings' },
  { re: /^#\/configurar-google(\?.*)?$/, view: renderSetup },
];

let cleanup = null;
let routing = Promise.resolve();

function route() {
  routing = routing.then(doRoute).catch((e) => console.error(e));
}

async function doRoute() {
  const hash = location.hash || '#/';
  // Profundidade de navegação (para o botão Voltar saber se há tela anterior no app).
  if (!history.state || !history.state.selahDepth) {
    const prev = Number(sessionStorage.getItem('selah.depth') || '0');
    history.replaceState({ selahDepth: prev + 1 }, '');
  }
  sessionStorage.setItem('selah.depth', String(history.state.selahDepth));

  if (cleanup) { const c = cleanup; cleanup = null; try { await c(); } catch (e) { console.error(e); } }
  const r = routes.find((x) => x.re.test(hash)) || routes[0];
  const m = hash.match(r.re) || [];
  clear(viewEl);
  document.body.classList.toggle('is-editor', !!r.editor);
  drawNav(r.nav);
  const res = r.view(viewEl, m);
  cleanup = typeof res === 'function' ? res : null;
  if (!r.editor) window.scrollTo(0, 0);
  viewEl.focus({ preventScroll: true });
  drawBanners();
  drawGlobalRec();
}

async function newSermon() {
  const id = uid();
  const rec = emptySermon(id, state.settings.defaultMode, nowLocalInput());
  const place = sessionStorage.getItem('selah.newPlace');
  if (place) { rec.place = place; sessionStorage.removeItem('selah.newPlace'); }
  await putSermon(rec);
  location.replace(`#/p/${id}/editar`);
  return null;
}

// ---------- Navegação inferior ----------
function drawNav(active) {
  clear(navEl);
  const item = (key, href, ic, label) => h('a', { class: 'nav-item' + (active === key ? ' on' : ''), href, 'aria-current': active === key ? 'page' : null },
    h('span', { class: 'nav-ic' }, icon(ic)), h('span', { class: 'nav-label' }, label));
  navEl.append(
    item('home', '#/', 'home', 'Início'),
    item('stats', '#/estatisticas', 'chart', 'Estatísticas'),
    item('settings', '#/config', 'gear', 'Ajustes'),
  );
}

// ---------- Avisos no topo ----------
function drawBanners() {
  clear(bannersEl);
  const add = (cls, ic, text, action) => bannersEl.appendChild(h('div', { class: 'banner ' + cls, role: 'status' },
    icon(ic), h('span', { class: 'banner-text' }, text), action || null));

  if (state.swWaiting) {
    add('banner-violet', 'sparkle', 'Tem novidade no Selah! Toque em Atualizar (leva 2 segundos, nada é perdido).', h('button', { class: 'banner-btn', type: 'button', onclick: () => { toast('Atualizando…'); state.swWaiting.postMessage('skipWaiting'); } }, 'Atualizar'));
  }
  if (!state.online) {
    add('banner-dark', 'wifiOff', 'Sem internet. Tudo continua salvo no aparelho e vai para o Docs quando voltar.');
  } else if (G.isConfigured() && state.auth === 'expired' && state.queueCount > 0) {
    add('banner-coral', 'login', 'Sua conexão com o Google expirou. Entre de novo para enviar o que falta – nada foi perdido.',
      h('button', { class: 'banner-btn', type: 'button', onclick: () => login() }, 'Entrar'));
  } else if (G.isConfigured() && state.auth === 'signed-out' && state.sermons.length > 0 && !document.body.classList.contains('is-editor')) {
    add('banner-violet', 'cloud', 'Entre com o Google para salvar suas pregações no Google Docs.',
      h('button', { class: 'banner-btn', type: 'button', onclick: () => login() }, 'Entrar'));
  }
  if (!isStandalone() && !state.settings.installDismissed && (location.hash || '#/') === '#/') {
    add('banner-lime', 'download', isIOS() ? 'Coloque o Selah na Tela de Início e use como app, até sem internet.' : 'Instale o Selah na tela inicial e use como app, até sem internet.',
      h('span', { class: 'banner-actions' },
        h('button', { class: 'banner-btn', type: 'button', onclick: () => openInstall() }, isIOS() ? 'Como fazer' : 'Instalar'),
        h('button', { class: 'banner-x', type: 'button', 'aria-label': 'Dispensar', onclick: () => { setSetting('installDismissed', true); drawBanners(); } }, icon('x', 'ic-sm'))));
  }
}

// ---------- Gravação em andamento (fora do editor) ----------
function drawGlobalRec() {
  clear(recBarEl);
  const cur = Rec.current();
  if (!cur || document.body.classList.contains('is-editor')) { recBarEl.hidden = true; return; }
  recBarEl.hidden = false;
  recBarEl.appendChild(h('a', { class: 'rec-bar', href: `#/p/${cur.sermonId}/editar` },
    h('span', { class: 'rec-dot' + (cur.paused ? ' paused' : '') }),
    h('span', { class: 'rec-time' }, `${cur.paused ? 'Pausado' : 'Gravando'} ${Math.floor(cur.elapsed / 60)}:${String(Math.floor(cur.elapsed % 60)).padStart(2, '0')}`),
    h('span', { class: 'rec-open' }, 'Abrir', icon('chevronRight', 'ic-sm'))));
}

// ---------- Novidades da versão ----------
const NEWS = {
  '1.4.0': ['🔔 Lembrete na hora do culto: cadastre os horários em Ajustes › Lembretes.', '📅 Leve os horários para o calendário do celular.', '⬆️ O app agora se atualiza sozinho com um toque.'],
};
function showWhatsNew() {
  let seen = '';
  try { seen = localStorage.getItem('selah.version') || ''; localStorage.setItem('selah.version', APP_VERSION); } catch (_) { return; }
  if (!seen || seen === APP_VERSION || !NEWS[APP_VERSION]) return;
  setTimeout(() => sheet(`Selah atualizado ✓ (versão ${APP_VERSION})`, h('div', null,
    h('ul', { class: 'news' }, NEWS[APP_VERSION].map((n) => h('li', null, n))))), 900);
}

// ---------- Service worker ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    const track = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { state.swWaiting = w; drawBanners(); }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { state.swWaiting = reg.waiting; drawBanners(); }
    reg.addEventListener('updatefound', () => track(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'navigate' && e.data.url) location.hash = e.data.url.replace(/^.*#/, '#');
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    // Procura versão nova sempre que o app volta para a tela.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch (e) {
    console.warn('Service worker não registrado', e);
  }
}

// ---------- Inicialização ----------
async function init() {
  await loadAll();
  applyTheme();
  listenInstall();
  await finishRedirectLogin();
  refreshAuthState();
  watchExpiry();

  // Pede armazenamento persistente (evita que o navegador apague o cache local).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Primeira abertura sem Google configurado → explica o que falta.
  if (!G.isConfigured() && !state.settings.setupSeen && (!location.hash || location.hash === '#/')) {
    history.replaceState(null, '', '#/configurar-google');
  }

  window.addEventListener('hashchange', route);
  route();
  document.getElementById('splash')?.remove();

  window.addEventListener('online', () => { state.online = true; emit('online'); drawBanners(); scheduleSync(500); });
  window.addEventListener('offline', () => { state.online = false; emit('online'); drawBanners(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAuthState();
      scheduleSync(300);
      notifyDue();
      notifyCult();
      if ((location.hash || '#/') === '#/') emit('settings');
    }
  });
  on('auth', drawBanners);
  on('queue', drawBanners);
  on('install', drawBanners);
  on('rec', drawGlobalRec);

  registerSW();
  showWhatsNew();

  // Recupera gravações interrompidas.
  Rec.recoverOrphans().then((list) => { if (list.length) { toast(`Recuperamos ${list.length === 1 ? 'uma gravação interrompida' : list.length + ' gravações interrompidas'} ✓`); list.forEach((x) => scheduleSync(1000)); } });

  // Corrige itens que ficaram "sincronizando" se o app foi fechado no meio.
  for (const s of state.sermons) if (s.syncStatus === 'syncing') s.syncStatus = 'pending';
  await refreshQueueCount();

  // Google: prepara o login (para o pop-up abrir na hora do toque) e sincroniza.
  if (G.isConfigured() && navigator.onLine) G.prepare().catch(() => {});
  scheduleSync(1500);
  setInterval(() => { if (state.queueCount && navigator.onLine) runSync(); }, 60_000);

  // Lembretes.
  setTimeout(() => { notifyCult(); notifyDue(); if (notificationPermission() === 'granted') registerPeriodic(); }, 2500);

}

init().catch((e) => {
  console.error(e);
  const s = document.getElementById('splash');
  if (s) s.remove();
  viewEl.appendChild(h('div', { class: 'empty' },
    h('h2', null, 'Não foi possível abrir o Selah'),
    h('p', null, 'Seu navegador pode estar bloqueando o armazenamento local (modo privado?). Detalhe: ' + (e && e.message ? e.message : e))));
});
