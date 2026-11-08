// Monta o documento do Google Docs (lista de requisições do batchUpdate) a partir de uma pregação.
import { SECTIONS, refLabel, typeLabel } from './schema.js';
import { fmtDate, fmtDateTime, isoDate } from './util.js';

const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { color: { rgbColor: { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 } } };
};
const LIME = rgb('#C6F432');
const GRAY = rgb('#5B5670');
const VIOLET = rgb('#5537E6');

/** Remove caracteres de controle (exceto quebra de linha) que o Docs não aceita bem. */
function clean(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F￰-￿]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const oneLine = (t) => clean(t).replace(/\s*\n\s*/g, ' ');

/** Nome do arquivo: "AAAA-MM-DD – Título – Pregador". */
export function docName(s) {
  const date = isoDate(s.dateTime) || new Date().toISOString().slice(0, 10);
  const parts = [date, oneLine(s.title) || 'Sem título'];
  if (oneLine(s.preacher)) parts.push(oneLine(s.preacher));
  return parts.join(' – ').slice(0, 240);
}

/**
 * Gera as requisições para preencher um documento vazio (a partir do índice 1).
 * ctx.linked: pregações vinculadas [{ title, dateTime, docUrl }]
 */
export function buildDocRequests(s, ctx = {}) {
  const blocks = [];
  // Um bloco = um parágrafo (pode conter quebras internas).
  const P = (text, o = {}) => { const t = o.raw ? text : clean(text); blocks.push({ text: t, runs: [], ...o }); return blocks[blocks.length - 1]; };
  /** Parágrafo com trechos (rótulo em negrito etc.). parts: [{ text, bold, link, color }] */
  const Rich = (parts, o = {}) => {
    let text = '';
    const runs = [];
    for (const part of parts) {
      const t = part.keepRaw ? part.text : oneLine(part.text);
      if (!t) continue;
      const start = text.length;
      text += t;
      runs.push({ start, end: text.length, ...part });
    }
    return P(text, { raw: true, runs, ...o });
  };

  // Cabeçalho
  P(oneLine(s.title) || 'Sem título', { style: 'TITLE' });

  const meta = [];
  const sep = () => meta.length && meta.push({ text: '   ·   ', keepRaw: true, color: GRAY });
  if (oneLine(s.preacher)) { sep(); meta.push({ text: 'Pregador: ', bold: true, keepRaw: true }, { text: s.preacher }); }
  if (s.dateTime) { sep(); meta.push({ text: 'Data: ', bold: true, keepRaw: true }, { text: fmtDateTime(s.dateTime) }); }
  const place = [oneLine(s.place), typeLabel(s.type)].filter(Boolean).join(' – ');
  if (place) { sep(); meta.push({ text: 'Local: ', bold: true, keepRaw: true }, { text: place }); }
  if (s.baseText && s.baseText.book) { sep(); meta.push({ text: 'Texto base: ', bold: true, keepRaw: true }, { text: refLabel(s.baseText) }); }
  if (meta.length) Rich(meta, { spaceBelow: 6 });

  const support = (s.supportVerses || []).map(refLabel).filter(Boolean);
  if (support.length) Rich([{ text: 'Versículos de apoio: ', bold: true, keepRaw: true }, { text: support.join('; ') }], { spaceBelow: 4 });
  if ((s.tags || []).length) Rich([{ text: 'Etiquetas: ', bold: true, keepRaw: true }, { text: s.tags.join(' · ') }], { spaceBelow: 4 });

  // Seções
  for (const sec of SECTIONS) {
    const items = [];
    for (const qq of sec.questions) {
      if (qq.type === 'points') {
        const pts = (s.points || []).map(oneLine).filter(Boolean);
        if (pts.length) items.push({ q: qq, list: pts });
      } else if (qq.type === 'practice') {
        const pr = (s.practice || []).filter((p) => oneLine(p.text));
        if (pr.length) items.push({ q: qq, practice: pr });
      } else if (qq.type === 'link') {
        const ans = clean((s.answers || {})[qq.id]);
        const linked = (ctx.linked || []).filter(Boolean);
        if (ans || linked.length) items.push({ q: qq, answer: ans, linked });
      } else {
        const ans = clean((s.answers || {})[qq.id]);
        if (ans) items.push({ q: qq, answer: ans });
      }
    }
    if (!items.length) continue; // seção sem respostas não aparece

    P(sec.title, { style: 'HEADING_2' });
    for (const it of items) {
      P(it.q.q, { bold: true, spaceAbove: 8, spaceBelow: 2, keepNext: true });
      if (it.list) {
        it.list.forEach((t) => P(t, { bullet: 'NUMBERED_DECIMAL_ALPHA_ROMAN', group: 'pts' }));
      } else if (it.practice) {
        it.practice.forEach((p) => {
          const b = P(oneLine(p.text) + (p.done ? '  ✓ feito' : ''), { bullet: 'BULLET_CHECKBOX', group: 'pr' });
          if (p.done) b.strike = true;
        });
      } else if (it.q.highlight) {
        const b = P(`“${it.answer.replace(/^["“”]+|["“”]+$/g, '')}”`, { spaceBelow: 6 });
        b.highlight = true;
      } else {
        if (it.answer) P(it.answer, { spaceBelow: 6 });
        if (it.linked && it.linked.length) {
          Rich([{ text: 'Pregações relacionadas:', bold: true, color: GRAY }], { spaceAbove: 4 });
          it.linked.forEach((l) => {
            const label = `${oneLine(l.title) || 'Sem título'}${l.preacher ? ' – ' + oneLine(l.preacher) : ''} (${fmtDate(l.dateTime)})`;
            Rich([{ text: label, link: l.docUrl || null }], { bullet: 'BULLET_DISC_CIRCLE_SQUARE', group: 'lk' });
          });
        }
      }
    }
  }

  // Anexos
  const att = (s.attachments || []).filter((a) => a.driveLink);
  if (att.length) {
    P('Anexos', { style: 'HEADING_2' });
    let nf = 0; let na = 0;
    att.forEach((a) => {
      let label;
      if (a.kind === 'audio') { na += 1; label = `Áudio da pregação${na > 1 ? ' ' + na : ''}${a.duration ? ` (${Math.round(a.duration / 60)} min)` : ''}`; }
      else { nf += 1; label = `Foto ${nf}${a.name && !/^foto/i.test(a.name) ? ' – ' + oneLine(a.name) : ''}`; }
      Rich([{ text: label, link: a.driveLink }], { bullet: 'BULLET_DISC_CIRCLE_SQUARE', group: 'att' });
    });
  }

  // Rodapé
  P(`Registrado no Selah · atualizado em ${fmtDateTime(toLocalNow())}`, { footer: true, spaceAbove: 18 });

  return toRequests(blocks);
}

function toLocalNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toRequests(blocks) {
  // Índices no Docs contam unidades UTF-16, igual ao String.length do JavaScript.
  let idx = 1;
  blocks.forEach((b, i) => {
    b.start = idx;
    b.end = idx + b.text.length;
    idx = b.end + (i < blocks.length - 1 ? 1 : 0);
  });
  const fullText = blocks.map((b) => b.text).join('\n');
  const total = { startIndex: 1, endIndex: 1 + fullText.length };
  const reqs = [];
  if (!fullText.length) return reqs;

  reqs.push({ insertText: { location: { index: 1 }, text: fullText } });
  // Zera estilos herdados do conteúdo anterior.
  reqs.push({ updateTextStyle: { range: total, textStyle: {}, fields: 'bold,italic,underline,strikethrough,link,backgroundColor,foregroundColor,fontSize' } });
  reqs.push({ updateParagraphStyle: { range: total, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType,spaceAbove,spaceBelow,keepWithNext,alignment' } });
  reqs.push({ deleteParagraphBullets: { range: total } });

  const pt = (n) => ({ magnitude: n, unit: 'PT' });
  for (const b of blocks) {
    if (b.end <= b.start) continue;
    const range = { startIndex: b.start, endIndex: b.end };
    const ps = {}; const pf = [];
    if (b.style && b.style !== 'NORMAL_TEXT') { ps.namedStyleType = b.style; pf.push('namedStyleType'); }
    if (b.spaceAbove) { ps.spaceAbove = pt(b.spaceAbove); pf.push('spaceAbove'); }
    if (b.spaceBelow) { ps.spaceBelow = pt(b.spaceBelow); pf.push('spaceBelow'); }
    if (b.keepNext) { ps.keepWithNext = true; pf.push('keepWithNext'); }
    if (pf.length) reqs.push({ updateParagraphStyle: { range, paragraphStyle: ps, fields: pf.join(',') } });

    if (b.bold) reqs.push({ updateTextStyle: { range, textStyle: { bold: true }, fields: 'bold' } });
    if (b.strike) reqs.push({ updateTextStyle: { range, textStyle: { strikethrough: true, foregroundColor: GRAY }, fields: 'strikethrough,foregroundColor' } });
    if (b.highlight) reqs.push({ updateTextStyle: { range, textStyle: { bold: true, backgroundColor: LIME, fontSize: pt(13) }, fields: 'bold,backgroundColor,fontSize' } });
    if (b.footer) reqs.push({ updateTextStyle: { range, textStyle: { italic: true, foregroundColor: GRAY, fontSize: pt(9) }, fields: 'italic,foregroundColor,fontSize' } });
    for (const r of b.runs) {
      const rr = { startIndex: b.start + r.start, endIndex: b.start + r.end };
      const ts = {}; const tf = [];
      if (r.bold) { ts.bold = true; tf.push('bold'); }
      if (r.color) { ts.foregroundColor = r.color; tf.push('foregroundColor'); }
      if (r.link) { ts.link = { url: r.link }; ts.foregroundColor = VIOLET; ts.underline = true; tf.push('link', 'foregroundColor', 'underline'); }
      if (tf.length) reqs.push({ updateTextStyle: { range: rr, textStyle: ts, fields: [...new Set(tf)].join(',') } });
    }
  }

  // Listas: agrupa parágrafos consecutivos do mesmo grupo.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.bullet) continue;
    let j = i;
    while (j + 1 < blocks.length && blocks[j + 1].bullet === b.bullet && blocks[j + 1].group === b.group) j++;
    reqs.push({ createParagraphBullets: { range: { startIndex: b.start, endIndex: blocks[j].end }, bulletPreset: b.bullet } });
    i = j;
  }
  return reqs;
}
