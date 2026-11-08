// Gravação de áudio com MediaRecorder. Os pedaços são salvos no IndexedDB a cada 10 s,
// então uma gravação longa não se perde se o app fechar no meio.
import { recChunks, blobs } from './db.js';
import { emit, patchSermon, getSermon } from './store.js';
import { uid } from './util.js';

let rec = null;

export function recordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];
  for (const t of types) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (_) { /* ignore */ } }
  return '';
}

export function current() {
  if (!rec) return null;
  const elapsed = rec.accum + (rec.paused ? 0 : Date.now() - rec.resumedAt);
  return { sermonId: rec.sermonId, paused: rec.paused, elapsed: elapsed / 1000 };
}

async function lockScreen() {
  try { if ('wakeLock' in navigator) rec.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { /* sem suporte */ }
}

export async function start(sermonId) {
  if (rec) throw new Error('Já existe uma gravação em andamento.');
  if (!recordingSupported()) throw new Error('Este navegador não permite gravar áudio.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    throw new Error(e && e.name === 'NotAllowedError'
      ? 'Permita o uso do microfone para gravar a pregação.'
      : 'Não foi possível acessar o microfone.');
  }
  const mime = pickMime();
  let mr;
  try {
    mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
  } catch (_) {
    mr = new MediaRecorder(stream);
  }
  const recId = uid();
  rec = { mr, stream, recId, sermonId, mime: mr.mimeType || mime || 'audio/webm', accum: 0, resumedAt: Date.now(), paused: false, writes: [], wakeLock: null, startedAt: Date.now() };
  mr.ondataavailable = (e) => {
    if (e.data && e.data.size && rec) rec.writes.push(recChunks.add(recId, sermonId, rec.mime, e.data));
  };
  mr.start(10_000);
  await lockScreen();
  rec.tick = setInterval(() => emit('rec'), 1000);
  document.addEventListener('visibilitychange', onVisible);
  emit('rec');
}

function onVisible() {
  if (rec && document.visibilityState === 'visible' && !rec.wakeLock) lockScreen();
  if (rec && rec.wakeLock && rec.wakeLock.released) { rec.wakeLock = null; if (document.visibilityState === 'visible') lockScreen(); }
}

export function pause() {
  if (!rec || rec.paused || rec.mr.state !== 'recording') return;
  rec.mr.pause();
  rec.accum += Date.now() - rec.resumedAt;
  rec.paused = true;
  emit('rec');
}
export function resume() {
  if (!rec || !rec.paused) return;
  rec.mr.resume();
  rec.resumedAt = Date.now();
  rec.paused = false;
  emit('rec');
}

/** Para a gravação e anexa o áudio à pregação. Retorna o anexo. */
export async function stop() {
  if (!rec) return null;
  const r = rec;
  const stopped = new Promise((res) => { r.mr.onstop = res; });
  if (!r.paused) r.accum += Date.now() - r.resumedAt;
  try { r.mr.state !== 'inactive' && r.mr.stop(); } catch (_) { /* ignore */ }
  await Promise.race([stopped, new Promise((res) => setTimeout(res, 3000))]);
  // Espera o último pedaço ser gravado no IndexedDB.
  await new Promise((res) => setTimeout(res, 50));
  await Promise.all(r.writes);
  clearInterval(r.tick);
  r.stream.getTracks().forEach((t) => t.stop());
  try { r.wakeLock && r.wakeLock.release(); } catch (_) { /* ignore */ }
  document.removeEventListener('visibilitychange', onVisible);
  rec = null;
  const att = await assemble(r.recId, r.sermonId, r.mime, r.accum / 1000, 'Áudio da pregação');
  emit('rec');
  return att;
}

async function assemble(recId, sermonId, mime, duration, name) {
  const chunks = (await recChunks.byRec(recId)).sort((a, b) => a.seq - b.seq);
  if (!chunks.length) return null;
  const type = (mime || chunks[0].mime || 'audio/webm').split(';')[0];
  const blob = new Blob(chunks.map((c) => c.blob), { type });
  const att = { id: uid(), kind: 'audio', mime: type, size: blob.size, duration: Math.round(duration || 0), name, createdAt: Date.now() };
  await blobs.put(att.id, blob);
  const saved = await patchSermon(sermonId, (s) => {
    s.attachments = s.attachments || [];
    s.attachments.push(att);
    s.updatedAt = Date.now();
    s.syncStatus = 'pending';
  });
  await recChunks.delRec(recId);
  if (!saved) { await blobs.del(att.id); return null; }
  return att;
}

/** Recupera gravações interrompidas (app fechado durante a gravação). */
export async function recoverOrphans() {
  if (rec) return [];
  const all = await recChunks.all();
  if (!all.length) return [];
  const groups = new Map();
  for (const c of all) {
    if (!groups.has(c.recId)) groups.set(c.recId, []);
    groups.get(c.recId).push(c);
  }
  const recovered = [];
  for (const [recId, list] of groups) {
    list.sort((a, b) => a.seq - b.seq);
    const sermonId = list[0].sermonId;
    if (!getSermon(sermonId)) { await recChunks.delRec(recId); continue; }
    const dur = (list[list.length - 1].at - list[0].at) / 1000 + 10;
    const att = await assemble(recId, sermonId, list[0].mime, dur, 'Áudio recuperado');
    if (att) recovered.push({ sermonId, att });
  }
  return recovered;
}
