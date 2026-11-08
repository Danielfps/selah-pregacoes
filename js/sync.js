// Fila de sincronização: IndexedDB → Google Drive/Docs.
import * as G from './google.js';
import { sermons as sermonsDB, blobs, queue, settings as settingsDB } from './db.js';
import { state, emit, patchSermon, refreshQueueCount, setSetting } from './store.js';
import { buildDocRequests, docName } from './docbuilder.js';
import { isoDate } from './util.js';

export const ROOT_FOLDER = 'Selah – Pregações';
export const ATTACH_FOLDER = 'Anexos';

let running = false;
let again = false;
let timer = null;
let foldersChecked = false;

/** Coloca a pregação na fila e agenda o envio. */
export async function enqueue(id, delay = 0) {
  await queue.add({ id, op: 'upsert' });
  await refreshQueueCount();
  scheduleSync(delay);
}

export async function enqueueDelete(id, docId, driveIds) {
  await queue.add({ id, op: 'delete', docId, driveIds });
  await refreshQueueCount();
  scheduleSync(0);
}

export function scheduleSync(delay = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => { runSync().catch((e) => console.error(e)); }, delay);
}

/** Atualiza o estado de autenticação a partir do token guardado. */
export function refreshAuthState() {
  const prev = state.auth;
  if (!G.isConfigured()) state.auth = 'unconfigured';
  else if (G.getToken()) state.auth = 'signed-in';
  else if (state.settings.account) state.auth = 'expired';
  else state.auth = 'signed-out';
  if (prev !== state.auth) emit('auth');
  return state.auth;
}

export async function runSync() {
  if (running) { again = true; return; }
  if (!G.isConfigured()) return;
  const items = (await queue.all()).sort((a, b) => a.at - b.at);
  state.queueCount = items.length;
  if (!items.length) { emit('queue'); return; }
  if (!navigator.onLine) { state.online = false; emit('online'); return; }
  if (refreshAuthState() !== 'signed-in') return;

  running = true;
  state.syncing = true;
  emit('sync');
  try {
    const folders = await ensureFolders();
    for (const item of items) {
      try {
        if (item.op === 'delete') await syncDelete(item);
        else await syncUpsert(item.id, folders);
      } catch (e) {
        if (e instanceof G.AuthError) { refreshAuthState(); break; }
        if (e instanceof G.NetError) { break; }
        console.error('Falha ao sincronizar', item, e);
        if (item.op !== 'delete') {
          await patchSermon(item.id, (r) => { r.syncStatus = 'error'; r.syncError = e.message || 'Erro desconhecido'; });
        }
      }
    }
  } catch (e) {
    // Falha ao preparar as pastas.
    if (e instanceof G.AuthError) refreshAuthState();
    else if (!(e instanceof G.NetError)) {
      console.error(e);
      for (const item of items) {
        if (item.op !== 'delete') await patchSermon(item.id, (r) => { r.syncStatus = 'error'; r.syncError = e.message; });
      }
    }
  } finally {
    running = false;
    state.syncing = false;
    await refreshQueueCount();
    emit('sync');
    if (again) { again = false; scheduleSync(800); }
  }
}

/** Garante as pastas "Selah – Pregações" e "Anexos" no Drive. */
export async function ensureFolders() {
  const email = (state.settings.account && state.settings.account.email) || '';
  let f = await settingsDB.get('drive', null);
  if (f && f.email !== email) f = null;
  if (f && !foldersChecked) {
    for (const key of ['folderId', 'attachId']) {
      if (!f[key]) continue;
      try {
        const m = await G.getFile(f[key], 'id,trashed');
        if (m.trashed) f[key] = null;
      } catch (e) {
        if (e.status === 404) f[key] = null; else throw e;
      }
    }
    if (!f.folderId) f.attachId = null;
  }
  if (!f) f = { email };
  let changed = false;
  if (!f.folderId) { f.folderId = await G.findOrCreateFolder(ROOT_FOLDER); changed = true; }
  if (!f.attachId) { f.attachId = await G.findOrCreateFolder(ATTACH_FOLDER, f.folderId); changed = true; }
  foldersChecked = true;
  if (changed) await setSetting('drive', f);
  return f;
}

function extFor(mime, kind) {
  if (/jpeg|jpg/.test(mime)) return 'jpg';
  if (/png/.test(mime)) return 'png';
  if (/webp/.test(mime)) return 'webp';
  if (/heic/.test(mime)) return 'heic';
  if (/webm/.test(mime)) return 'webm';
  if (/ogg/.test(mime)) return 'ogg';
  if (/mp4|m4a|aac/.test(mime)) return 'm4a';
  if (/mpeg|mp3/.test(mime)) return 'mp3';
  return kind === 'audio' ? 'audio' : 'bin';
}

async function syncUpsert(id, folders) {
  const first = await sermonsDB.get(id);
  if (!first) { await queue.del(id); return; }
  await patchSermon(id, (r) => { r.syncStatus = 'syncing'; r.syncError = null; });

  // 1) Anexos ainda não enviados → pasta "Anexos".
  let n = { photo: 0, audio: 0 };
  for (const a of first.attachments || []) {
    n[a.kind] = (n[a.kind] || 0) + 1;
    if (a.driveId) continue;
    const b = await blobs.get(a.id);
    if (!b || !b.blob) continue;
    const label = a.kind === 'audio' ? `Áudio ${n.audio}` : `Foto ${n.photo}`;
    const name = `${isoDate(first.dateTime)} – ${(first.title || 'Sem título').trim()} – ${label}.${extFor(a.mime || b.blob.type, a.kind)}`;
    const f = await G.uploadFile(b.blob, name, a.mime || b.blob.type, folders.attachId);
    const saved = await patchSermon(id, (r) => {
      const x = (r.attachments || []).find((y) => y.id === a.id);
      if (x) { x.driveId = f.id; x.driveLink = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`; }
    }, { silent: true });
    // Se o anexo foi removido durante o envio, manda o arquivo para a lixeira.
    if (saved && !(saved.attachments || []).some((y) => y.id === a.id)) await G.trashFile(f.id);
  }

  // 2) Documento.
  const startedAt = Date.now();
  const cur = await sermonsDB.get(id);
  if (!cur) { await queue.del(id); return; }
  const version = cur.updatedAt;
  const linked = [];
  for (const lid of cur.linkedIds || []) {
    const l = await sermonsDB.get(lid);
    if (l) linked.push({ title: l.title, preacher: l.preacher, dateTime: l.dateTime, docUrl: l.docUrl });
  }
  const name = docName(cur);
  let docId = cur.docId;
  if (docId) {
    try {
      const m = await G.getFile(docId, 'id,trashed');
      if (m.trashed) docId = null;
    } catch (e) {
      if (e.status === 404) docId = null; else throw e;
    }
  }
  let renamed = false;
  if (!docId) {
    const f = await G.createDoc(name, folders.folderId);
    docId = f.id;
    renamed = true;
    // Guarda o ID já, para nunca criar um segundo documento para a mesma pregação.
    await patchSermon(id, (r) => { r.docId = docId; r.docUrl = G.docUrl(docId); r.docName = name; }, { silent: true });
  } else if (cur.docName !== name) {
    await G.renameFile(docId, name);
    renamed = true;
  }

  const doc = await G.getDoc(docId);
  const content = (doc.body && doc.body.content) || [];
  const endIndex = content.length ? content[content.length - 1].endIndex : 2;
  const requests = [];
  if (endIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  requests.push(...buildDocRequests(cur, { linked }));
  await G.batchUpdate(docId, requests);

  let upToDate = false;
  await patchSermon(id, (r) => {
    r.docId = docId;
    r.docUrl = G.docUrl(docId);
    if (renamed || !r.docName) r.docName = name;
    r.syncedAt = Date.now();
    r.syncError = null;
    upToDate = r.updatedAt === version;
    r.syncStatus = upToDate ? 'synced' : 'pending';
  });
  if (upToDate) await queue.delIfOlder(id, startedAt);
  else again = true;
  state.settings.lastSyncAt = Date.now();
  settingsDB.set('lastSyncAt', state.settings.lastSyncAt);
}

async function syncDelete(item) {
  if (item.docId) await G.trashFile(item.docId);
  for (const fid of item.driveIds || []) await G.trashFile(fid);
  await queue.del(item.id);
}

/** Tenta de novo uma pregação com erro (toque no cartão). */
export async function retry(id) {
  await patchSermon(id, (r) => { r.syncStatus = 'pending'; r.syncError = null; });
  await enqueue(id, 0);
}
