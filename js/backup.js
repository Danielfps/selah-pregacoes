// Backup .json (exportar / importar) – segurança extra, além do Google Docs.
import { blobs, queue } from './db.js';
import { state, putSermon, setSetting } from './store.js';
import { blobToDataURL, dataURLToBlob, downloadBlob } from './util.js';
import { enqueue } from './sync.js';

const FORMAT = 'selah-backup';

export async function exportBackup({ includeFiles = false } = {}) {
  const list = state.sermons.map((s) => ({ ...s }));
  const files = {};
  if (includeFiles) {
    for (const s of list) {
      for (const a of s.attachments || []) {
        const b = await blobs.get(a.id);
        if (b && b.blob) files[a.id] = await blobToDataURL(b.blob);
      }
    }
  }
  const data = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    sermons: list,
    customTags: state.settings.customTags || [],
    files,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  downloadBlob(blob, `selah-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`);
  return { count: list.length, files: Object.keys(files).length };
}

/** Importa um backup. Mantém a versão mais recente de cada pregação. */
export async function importBackup(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { throw new Error('Arquivo inválido: não é um JSON.'); }
  if (!data || data.format !== FORMAT || !Array.isArray(data.sermons)) throw new Error('Este arquivo não é um backup do Selah.');
  let added = 0; let updated = 0; let skipped = 0;
  const files = data.files || {};
  for (const s of data.sermons) {
    if (!s || !s.id) continue;
    const cur = state.sermons.find((x) => x.id === s.id);
    if (cur && (cur.updatedAt || 0) >= (s.updatedAt || 0)) { skipped++; continue; }
    const rec = { ...s };
    // Restaura arquivos embutidos.
    for (const a of rec.attachments || []) {
      if (files[a.id]) {
        try { await blobs.put(a.id, await dataURLToBlob(files[a.id])); } catch (_) { /* ignora arquivo corrompido */ }
      }
    }
    if (cur) {
      // Preserva o vínculo com o documento já existente neste aparelho.
      rec.docId = rec.docId || cur.docId;
      rec.docUrl = rec.docUrl || cur.docUrl;
      updated++;
    } else added++;
    if (rec.syncStatus === 'syncing') rec.syncStatus = 'pending';
    await putSermon(rec);
    if (rec.syncStatus !== 'synced') await queue.add({ id: rec.id, op: 'upsert' });
  }
  if (Array.isArray(data.customTags)) {
    const merged = [...new Set([...(state.settings.customTags || []), ...data.customTags])];
    await setSetting('customTags', merged);
  }
  if (added || updated) {
    const pending = (await queue.all()).filter((q) => q.op === 'upsert');
    if (pending.length) await enqueue(pending[0].id, 500);
  }
  return { added, updated, skipped };
}
