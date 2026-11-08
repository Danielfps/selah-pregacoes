// Tema, instalação (PWA) e versão do app.
import { state, emit } from './store.js';

export const APP_VERSION = '1.1.0';

export function applyTheme() {
  const t = state.settings.theme || 'auto';
  const root = document.documentElement;
  try { localStorage.setItem('selah.theme', t); } catch (_) { /* ignore */ }
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#15131F' : '#F4F1EA';
  document.head.appendChild(meta);
}

export function listenInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    emit('install');
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    emit('install');
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

export async function promptInstall() {
  const p = state.installPrompt;
  if (!p) return false;
  p.prompt();
  const choice = await p.userChoice.catch(() => null);
  state.installPrompt = null;
  emit('install');
  return choice && choice.outcome === 'accepted';
}
