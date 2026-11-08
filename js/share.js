// Compartilhar um resumo bonito (WhatsApp / Web Share API / copiar).
import { refLabel } from './schema.js';
import { fmtDate, h, sheet, toast } from './util.js';
import { icon } from './icons.js';

export function summaryText(s) {
  const lines = [];
  lines.push(`*${(s.title || 'Pregação').trim()}*`);
  const meta = [s.preacher && `🎤 ${s.preacher.trim()}`, s.dateTime && `📅 ${fmtDate(s.dateTime)}`].filter(Boolean).join('  ·  ');
  if (meta) lines.push(meta);
  if (s.baseText && s.baseText.book) lines.push(`📖 ${refLabel(s.baseText)}`);
  const frase = String((s.answers || {}).frase || '').trim().replace(/^["“”]+|["“”]+$/g, '');
  if (frase) { lines.push(''); lines.push(`✨ _“${frase}”_`); }
  const resumo = String((s.answers || {}).resumo || '').trim();
  if (resumo) { lines.push(''); lines.push(resumo); }
  const pts = (s.points || []).map((p) => p.trim()).filter(Boolean);
  if (pts.length) {
    lines.push('');
    lines.push('*Pontos:*');
    pts.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  lines.push('');
  lines.push('— anotado no Selah ⏸');
  return lines.join('\n');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
    ta.remove();
    return ok;
  }
}

export function openShare(s) {
  const text = summaryText(s);
  const canShare = !!navigator.share;
  const preview = h('pre', { class: 'share-preview' }, text);
  const sh = sheet('Compartilhar resumo', h('div', null,
    preview,
    h('div', { class: 'share-actions' },
      canShare && h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: async () => {
          try { await navigator.share({ title: s.title || 'Pregação', text }); sh.close(); } catch (e) { if (e && e.name !== 'AbortError') toast('Não foi possível compartilhar.'); }
        },
      }, icon('share'), 'Compartilhar…'),
      h('a', {
        class: 'btn btn-whatsapp btn-block', href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener',
        onclick: () => setTimeout(() => sh.close(), 300),
      }, icon('whatsapp'), 'Enviar no WhatsApp'),
      h('button', {
        class: 'btn btn-ghost btn-block', type: 'button',
        onclick: async () => { const ok = await copy(text); toast(ok ? 'Texto copiado!' : 'Não deu para copiar. Selecione o texto acima.'); if (ok) sh.close(); },
      }, icon('copy'), 'Copiar texto'),
    )
  ));
}
