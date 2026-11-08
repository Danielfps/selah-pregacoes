// Estado do app em memória + eventos. As pregações vêm do IndexedDB (cache local).
import { sermons as sermonsDB, settings as settingsDB, queue } from './db.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  defaultMode: 'culto',     // culto | revisao
  reminderEnabled: true,
  reminderDays: 3,
  weeklyReview: true,
  customTags: [],
  setupSeen: false,
  installDismissed: false,
  account: null,            // { email, name, photo }
};

export const state = {
  sermons: [],
  settings: { ...DEFAULT_SETTINGS },
  online: navigator.onLine,
  auth: 'signed-out',       // unconfigured | signed-out | signed-in | expired
  syncing: false,
  queueCount: 0,
  installPrompt: null,
  swWaiting: null,
  editingId: null,
};

const listeners = new Map();
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}
export function emit(type, detail) {
  (listeners.get(type) || []).forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } });
  (listeners.get('*') || []).forEach((fn) => { try { fn(type, detail); } catch (e) { console.error(e); } });
}

export async function loadAll() {
  const [list, st, q] = await Promise.all([sermonsDB.all(), settingsDB.all(), queue.all()]);
  state.sermons = list;
  state.settings = { ...DEFAULT_SETTINGS, ...st };
  state.queueCount = q.length;
}

export function getSermon(id) { return state.sermons.find((s) => s.id === id); }

/** Lista ordenada (mais recente primeiro). */
export function sortedSermons() {
  return [...state.sermons].sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || '') || b.createdAt - a.createdAt);
}

function upsertCache(rec) {
  const i = state.sermons.findIndex((s) => s.id === rec.id);
  if (i >= 0) state.sermons[i] = rec; else state.sermons.push(rec);
}

export async function putSermon(rec) {
  await sermonsDB.put(rec);
  upsertCache(rec);
  emit('sermons', rec.id);
  return rec;
}

export async function patchSermon(id, fn, { silent = false } = {}) {
  const rec = await sermonsDB.patch(id, fn);
  if (rec) {
    upsertCache(rec);
    if (!silent) emit('sermons', id);
  }
  return rec;
}

export async function removeSermon(id) {
  await sermonsDB.del(id);
  state.sermons = state.sermons.filter((s) => s.id !== id);
  emit('sermons', id);
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await settingsDB.set(key, value);
  emit('settings', key);
}

export async function refreshQueueCount() {
  state.queueCount = (await queue.all()).length;
  emit('queue');
}

/** Pregadores / locais já usados, do mais frequente para o menos. */
export function usedValues(field) {
  const count = new Map();
  for (const s of state.sermons) {
    const v = (s[field] || '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    const cur = count.get(k) || { value: v, n: 0, last: 0 };
    cur.n += 1;
    cur.last = Math.max(cur.last, s.createdAt || 0);
    count.set(k, cur);
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.last - a.last).map((x) => x.value);
}

/** Etiquetas disponíveis (padrão + criadas + usadas). */
export function allTags(defaults) {
  const set = new Map();
  [...defaults, ...(state.settings.customTags || []), ...state.sermons.flatMap((s) => s.tags || [])]
    .forEach((t) => { const k = t.toLowerCase(); if (!set.has(k)) set.set(k, t); });
  return [...set.values()];
}
