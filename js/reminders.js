// Lembretes de aplicação (notificação quando der + cartão na tela inicial) e o cartão "Relembre".
import { state, patchSermon } from './store.js';
import { weekKey } from './util.js';

const core = () => window.SelahReminderCore;

export function dueReminders() {
  return core() ? core().dueReminders(state.sermons, state.settings) : [];
}

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function askNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p === 'granted') await registerPeriodic();
  return p;
}

/** Pede ao navegador para acordar o app de vez em quando (Chrome/Android com app instalado). */
export async function registerPeriodic() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return false;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
    if (st && st.state !== 'granted') return false;
    await reg.periodicSync.register('selah-lembretes', { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch (_) {
    return false;
  }
}

/** Mostra notificações dos lembretes devidos (uma por dia por pregação). */
export async function notifyDue() {
  if (!core() || notificationPermission() !== 'granted') return;
  const list = core().toNotify(state.sermons, state.settings);
  if (!list.length) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const s of list.slice(0, 3)) {
      await reg.showNotification('Você colocou em prática o que ouviu?', {
        body: `${s.title || 'Pregação'}${s.preacher ? ' – ' + s.preacher : ''}`,
        tag: 'selah-' + s.id,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-maskable-192.png',
        data: { url: '#/p/' + s.id },
      });
      await patchSermon(s.id, (r) => { r.reminder = { ...(r.reminder || {}), notifiedAt: Date.now() }; }, { silent: true });
    }
  } catch (e) {
    console.warn('Notificação não exibida', e);
  }
}

export async function answerReminder(id, answer) {
  const DAY = 24 * 60 * 60 * 1000;
  await patchSermon(id, (r) => {
    r.reminder = { ...(r.reminder || {}) };
    if (answer === 'later') r.reminder.snoozeUntil = Date.now() + 2 * DAY;
    else r.reminder.answeredAt = Date.now();
  });
}

function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/** Pregação antiga sorteada para a semana (mesma durante a semana toda). */
export function weeklyPick(offset = 0) {
  if (state.settings.weeklyReview === false) return null;
  const DAY = 24 * 60 * 60 * 1000;
  const candidates = state.sermons
    .filter((s) => String((s.answers || {}).frase || '').trim() && Date.now() - (s.createdAt || 0) > 7 * DAY)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  const i = (hash(weekKey(new Date())) + offset) % candidates.length;
  return { sermon: candidates[i], total: candidates.length };
}
