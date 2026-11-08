// Detalhe da pregação: seções recolhíveis, favoritar, editar, compartilhar e "Abrir no Google Docs".
import { h, clear, fmtDateLong, fmtDate, fmtDuration, fmtBytes, timeAgo, confirmSheet, sheet, toast, toLocalInput, goBack } from '../util.js';
import { icon } from '../icons.js';
import { state, on, getSermon, patchSermon, removeSermon } from '../store.js';
import { SECTIONS, refLabel, typeLabel } from '../schema.js';
import { syncStatusEl, tagChip, tagTone, topBar } from '../components.js';
import { blobs, queue } from '../db.js';
import { enqueue, enqueueDelete } from '../sync.js';
import { openShare } from '../share.js';
import * as G from '../google.js';

export function renderDetail(root, { id }) {
  const urls = [];
  const openState = new Map(); // seções abertas/fechadas
  const wrap = h('div', { class: 'view view-detail' });
  root.appendChild(wrap);

  // Partes que mudam com a sincronização (atualizadas sem redesenhar a tela toda,
  // para não interromper um áudio que esteja tocando).
  const statusHost = h('div', { class: 'hero-status' });
  const docHost = h('div', { class: 'doc-host' });
  let lastSig = '';
  const sig = (s) => JSON.stringify([s.title, s.preacher, s.place, s.type, s.dateTime, s.baseText, s.supportVerses, s.tags, s.answers, s.points, s.practice, s.linkedIds, s.favorite, s.draft, (s.attachments || []).map((a) => a.id)]);

  function drawSyncParts(s) {
    clear(statusHost);
    statusHost.appendChild(syncStatusEl(s, { big: true }));
    clear(docHost);
    if (s.docUrl) {
      docHost.appendChild(h('a', { class: 'btn btn-primary btn-lg btn-block', href: s.docUrl, target: '_blank', rel: 'noopener' }, icon('doc'), 'Abrir no Google Docs', icon('external', 'ic-sm')));
    } else {
      const why = !G.isConfigured() ? 'O Google ainda não foi configurado.' : (!state.online ? 'Vai para o Docs quando a internet voltar.' : (state.auth !== 'signed-in' ? 'Entre no Google para criar o documento.' : 'Criando o documento…'));
      docHost.appendChild(h('div', { class: 'doc-pending' },
        h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', disabled: true }, icon('doc'), 'Abrir no Google Docs'),
        h('p', { class: 'field-hint center' }, why)));
    }
  }

  function update() {
    const s = getSermon(id);
    if (s && sig(s) === lastSig) drawSyncParts(s);
    else draw();
  }

  function draw() {
    const s = getSermon(id);
    lastSig = s ? sig(s) : '';
    clear(wrap);
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    if (!s) {
      wrap.appendChild(topBar({ title: 'Pregação', back: () => goBack('#/') }));
      wrap.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Pregação não encontrada'), h('a', { class: 'btn btn-primary', href: '#/' }, 'Voltar ao início')));
      return;
    }

    wrap.appendChild(topBar({
      title: '',
      back: () => goBack('#/'),
      actions: [
        h('button', {
          class: 'icon-btn fav-top' + (s.favorite ? ' on' : ''), type: 'button', 'aria-pressed': String(!!s.favorite),
          'aria-label': s.favorite ? 'Remover dos favoritos' : 'Favoritar',
          onclick: async () => { await patchSermon(id, (r) => { r.favorite = !r.favorite; }); toast(getSermon(id).favorite ? 'Adicionada às favoritas ★' : 'Removida das favoritas'); },
        }, icon('star')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Compartilhar', onclick: () => openShare(getSermon(id)) }, icon('share')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Editar', onclick: () => edit() }, icon('edit')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mais opções', onclick: () => more(s) }, icon('more')),
      ],
    }));

    const frase = String((s.answers || {}).frase || '').trim().replace(/^["“”]+|["“”]+$/g, '');
    wrap.appendChild(h('section', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        h('span', { class: 'chip chip-type' }, typeLabel(s.type) || 'Pregação'),
        s.draft ? h('span', { class: 'chip chip-draft' }, 'rascunho') : null),
      h('h1', { class: 'hero-title' }, s.title || 'Sem título'),
      h('ul', { class: 'meta-list' },
        s.preacher ? h('li', null, icon('user'), s.preacher) : null,
        s.dateTime ? h('li', null, icon('calendar'), fmtDateLong(s.dateTime)) : null,
        s.place ? h('li', null, icon('pin'), s.place) : null,
        s.baseText && s.baseText.book ? h('li', null, icon('book'), h('b', null, refLabel(s.baseText))) : null),
      (s.supportVerses || []).length ? h('div', { class: 'chips' }, s.supportVerses.map((v) => h('span', { class: 'chip chip-ref' }, refLabel(v)))) : null,
      (s.tags || []).length ? h('div', { class: 'chips' }, s.tags.map((t) => tagChip(t, tagTone(t)))) : null,
      statusHost
    ));

    if (frase) wrap.appendChild(h('figure', { class: 'quote-card' }, icon('quote'), h('blockquote', null, frase), h('figcaption', null, 'Frase marcante')));

    // Abrir no Google Docs
    wrap.appendChild(docHost);
    drawSyncParts(s);

    // Seções
    SECTIONS.forEach((sec) => {
      const items = sectionItems(s, sec);
      if (!items.length) return;
      const isOpen = openState.has(sec.id) ? openState.get(sec.id) : true;
      const det = h('details', { class: 'section', open: isOpen, ontoggle: () => openState.set(sec.id, det.open) },
        h('summary', null, h('span', { class: 'sec-emoji', 'aria-hidden': 'true' }, sec.emoji), h('span', { class: 'sec-title' }, sec.title), h('span', { class: 'sec-count' }, String(items.length)), icon('chevronDown', 'sec-chev')),
        h('div', { class: 'section-body' }, items));
      wrap.appendChild(det);
    });

    // Anexos
    const att = s.attachments || [];
    if (att.length) {
      const grid = h('div', { class: 'att-grid' });
      att.forEach((a) => {
        const cell = h('div', { class: 'att-cell ' + a.kind });
        grid.appendChild(cell);
        blobs.get(a.id).then((b) => {
          if (b && b.blob) {
            const u = URL.createObjectURL(b.blob);
            urls.push(u);
            if (a.kind === 'photo') cell.appendChild(h('button', { class: 'photo-btn', type: 'button', 'aria-label': 'Ver foto', onclick: () => lightbox(u) }, h('img', { src: u, alt: 'Foto anexada', loading: 'lazy' })));
            else cell.appendChild(h('div', { class: 'audio-cell' }, h('b', null, icon('mic'), a.name || 'Áudio', a.duration ? ` · ${fmtDuration(a.duration)}` : ''), h('audio', { controls: true, preload: 'metadata', src: u })));
          } else if (a.driveLink) {
            cell.appendChild(h('a', { class: 'drive-link', href: a.driveLink, target: '_blank', rel: 'noopener' }, icon(a.kind === 'audio' ? 'mic' : 'image'), a.kind === 'audio' ? 'Ouvir no Drive' : 'Ver no Drive', icon('external', 'ic-sm')));
          } else {
            cell.appendChild(h('span', { class: 'field-hint' }, 'Arquivo indisponível'));
          }
          if (a.driveLink && b && b.blob) cell.appendChild(h('a', { class: 'mini-link', href: a.driveLink, target: '_blank', rel: 'noopener' }, 'no Drive ✓'));
          else if (!a.driveId && b && b.blob) cell.appendChild(h('span', { class: 'mini-link muted' }, `${fmtBytes(a.size)} · aguardando envio`));
        });
      });
      wrap.appendChild(h('details', { class: 'section', open: true }, h('summary', null, h('span', { class: 'sec-emoji', 'aria-hidden': 'true' }, '📎'), h('span', { class: 'sec-title' }, 'Anexos'), h('span', { class: 'sec-count' }, String(att.length)), icon('chevronDown', 'sec-chev')), h('div', { class: 'section-body' }, grid)));
    }

    wrap.appendChild(h('p', { class: 'foot-meta' }, `Criada em ${fmtDate(toLocalInput(new Date(s.createdAt)))} · atualizada ${timeAgo(s.updatedAt)}`, s.syncedAt ? ` · Docs ${timeAgo(s.syncedAt)}` : ''));
    wrap.appendChild(h('div', { class: 'detail-bottom-space' }));
  }

  function sectionItems(s, sec) {
    const out = [];
    for (const q of sec.questions) {
      if (q.type === 'points') {
        const pts = (s.points || []).filter((p) => p.trim());
        if (pts.length) out.push(h('div', { class: 'qa' }, h('h3', { class: 'q' }, q.q), h('ol', { class: 'points-view' }, pts.map((p) => h('li', null, p)))));
      } else if (q.type === 'practice') {
        const items = (s.practice || []).filter((p) => p.text && p.text.trim());
        if (items.length) {
          out.push(h('div', { class: 'qa qa-practice' }, h('h3', { class: 'q' }, q.q),
            h('ul', { class: 'check-list' }, items.map((p) => h('li', null,
              h('label', { class: 'check' + (p.done ? ' done' : '') },
                h('input', { type: 'checkbox', checked: p.done, onchange: (e) => togglePractice(p.id, e.target.checked) }),
                h('span', { class: 'check-box', 'aria-hidden': 'true' }, icon('check')),
                h('span', null, p.text),
                h('span', { class: 'done-tag' }, 'Feito')))))));
        }
      } else {
        const ans = String((s.answers || {})[q.id] || '').trim();
        const linked = q.type === 'link' ? (s.linkedIds || []).map(getSermon).filter(Boolean) : [];
        if (!ans && !linked.length) continue;
        out.push(h('div', { class: 'qa' + (q.highlight ? ' qa-highlight' : '') },
          h('h3', { class: 'q' }, q.q),
          ans ? h('p', { class: 'a' }, ans) : null,
          linked.length ? h('div', { class: 'chips' }, linked.map((l) => h('a', { class: 'chip chip-link', href: '#/p/' + l.id }, icon('link'), `${l.title || 'Sem título'} · ${fmtDate(l.dateTime)}`))) : null));
      }
    }
    return out;
  }

  async function togglePractice(pid, done) {
    await patchSermon(id, (r) => {
      const it = (r.practice || []).find((x) => x.id === pid);
      if (it) { it.done = done; it.doneAt = done ? Date.now() : null; }
      r.updatedAt = Date.now();
      r.syncStatus = 'pending';
    });
    if (done) toast('Boa! Colocou em prática 🔥');
    enqueue(id, 2000);
  }

  function edit() {
    sessionStorage.setItem('selah.editFrom', id);
    location.hash = `#/p/${id}/editar`;
  }

  function lightbox(url) {
    const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Foto', onclick: () => box.remove() },
      h('img', { src: url, alt: 'Foto anexada' }),
      h('button', { class: 'icon-btn lightbox-x', type: 'button', 'aria-label': 'Fechar' }, icon('x')));
    document.body.appendChild(box);
  }

  function more(s) {
    const sh = sheet('Opções', h('div', { class: 'option-list' },
      h('button', { class: 'option', type: 'button', onclick: () => { sh.close(); edit(); } }, h('span', null, icon('edit'), ' Editar'), null),
      h('button', { class: 'option', type: 'button', onclick: () => { sh.close(); openShare(getSermon(id)); } }, h('span', null, icon('share'), ' Compartilhar resumo'), null),
      s.docUrl ? h('a', { class: 'option', href: s.docUrl, target: '_blank', rel: 'noopener' }, h('span', null, icon('doc'), ' Abrir no Google Docs'), icon('external')) : null,
      h('button', { class: 'option danger', type: 'button', onclick: () => { sh.close(); del(s); } }, h('span', null, icon('trash'), ' Excluir pregação'), null)
    ));
  }

  async function del(s) {
    const hasCloud = !!s.docId || (s.attachments || []).some((a) => a.driveId);
    const ok = await confirmSheet('Excluir esta pregação?',
      hasCloud ? 'Ela será apagada deste aparelho, e o documento (e os anexos) irão para a lixeira do seu Google Drive, de onde podem ser recuperados por 30 dias.' : 'Ela será apagada deste aparelho. Esta ação não pode ser desfeita.',
      { ok: 'Excluir', danger: true });
    if (!ok) return;
    const driveIds = (s.attachments || []).map((a) => a.driveId).filter(Boolean);
    await queue.del(id);
    for (const a of s.attachments || []) await blobs.del(a.id);
    await removeSermon(id);
    if (hasCloud && G.isConfigured()) await enqueueDelete(id, s.docId, driveIds);
    toast('Pregação excluída');
    location.replace('#/');
  }

  draw();
  const offs = [on('sermons', (sid) => { if (!sid || sid === id) update(); }), on('sync', update), on('auth', update), on('online', update)];
  return () => { offs.forEach((f) => f()); urls.forEach((u) => URL.revokeObjectURL(u)); };
}
