// Instalação do app na tela inicial: Android (botão nativo), iPhone (passo a passo no Safari)
// e navegadores internos (Instagram, Facebook, WhatsApp), onde é preciso abrir no navegador.
import { h, sheet, toast, isIOS, isStandalone } from './util.js';
import { icon } from './icons.js';
import { state } from './store.js';
import { promptInstall } from './platform.js';

const APP_URL = 'https://danielfps.github.io/selah-pregacoes/';

export function inAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|WhatsApp|TikTok|Snapchat/i.test(navigator.userAgent);
}
function iosNotSafari() {
  return isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(navigator.userAgent);
}
export function canShowInstall() { return !isStandalone(); }

async function copyLink() {
  try { await navigator.clipboard.writeText(APP_URL); toast('Link copiado ✓ Cole no navegador.'); }
  catch (_) { toast(APP_URL, { duration: 8000 }); }
}

// Ícones desenhados como no sistema, para a pessoa reconhecer.
const shareIOS = () => h('span', { class: 'sys-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="#0A84FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>' });
const plusSquare = () => h('span', { class: 'sys-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>' });
const dots = () => h('span', { class: 'sys-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' });

const step = (n, ...content) => h('li', { class: 'inst-step' }, h('span', { class: 'inst-n' }, String(n)), h('div', null, ...content));

/** Abre o fluxo de instalação certo para o aparelho. */
export async function openInstall() {
  if (isStandalone()) { toast('O Selah já está instalado ✓'); return; }
  if (state.installPrompt && !inAppBrowser()) {
    const ok = await promptInstall();
    if (ok) toast('Instalado! Procure o ícone do Selah na tela inicial 🎉');
    return;
  }
  let title; let body;
  if (inAppBrowser()) {
    title = 'Abra no navegador para instalar';
    body = h('div', null,
      h('p', { class: 'sheet-text' }, 'Você está dentro de outro app (Instagram, WhatsApp…). Para instalar o Selah, abra este link no ', h('b', null, isIOS() ? 'Safari' : 'Chrome'), '.'),
      h('ol', { class: 'inst-steps' },
        step(1, 'Toque nos ', dots(), ' no canto da tela.'),
        step(2, isIOS() ? 'Escolha “Abrir no navegador” (ou “Abrir no Safari”).' : 'Escolha “Abrir no Chrome” (ou “Abrir no navegador”).'),
        step(3, 'Lá, toque em “Instalar” de novo.')),
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: copyLink }, icon('copy'), 'Copiar o link'));
  } else if (isIOS()) {
    title = 'Colocar na Tela de Início';
    body = h('div', null,
      iosNotSafari() ? h('p', { class: 'sheet-text warn-box' }, 'No iPhone, a instalação funciona pelo ', h('b', null, 'Safari'), '. Copie o link e abra lá.') : null,
      h('ol', { class: 'inst-steps' },
        step(1, 'Toque no botão ', h('b', null, 'Compartilhar '), shareIOS(), ' na barra do Safari (embaixo ou em cima).'),
        step(2, 'Role a lista e toque em ', h('b', null, '“Adicionar à Tela de Início” '), plusSquare(), '.'),
        step(3, 'Toque em ', h('b', null, 'Adicionar'), '. O ícone do Selah aparece junto dos seus apps.')),
      iosNotSafari() ? h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: copyLink }, icon('copy'), 'Copiar o link') : null,
      h('div', { class: 'inst-arrow', 'aria-hidden': 'true' }, icon('arrowDown')));
  } else {
    title = 'Instalar na tela inicial';
    body = h('div', null,
      h('ol', { class: 'inst-steps' },
        step(1, 'Toque nos ', dots(), ' (menu do Chrome, no canto de cima).'),
        step(2, 'Escolha ', h('b', null, '“Instalar app”'), ' ou ', h('b', null, '“Adicionar à tela inicial”'), '.'),
        step(3, 'Confirme. O ícone do Selah aparece junto dos seus apps.')),
      h('p', { class: 'field-hint' }, 'Não aparece a opção? Abra o link no Google Chrome.'),
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: copyLink }, icon('copy'), 'Copiar o link'));
  }
  sheet(title, body);
}

/** Botão compacto de instalar (cabeçalho do início). */
export function installButton() {
  if (!canShowInstall()) return null;
  return h('button', { class: 'install-btn', type: 'button', onclick: () => openInstall() }, icon('download'), isIOS() ? 'Pôr na tela' : 'Instalar');
}
