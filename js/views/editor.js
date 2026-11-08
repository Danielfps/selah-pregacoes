// Editor da pregação: Modo culto (rápido) e Modo revisão (completo), em etapas, com salvamento automático.
import { h, clear, debounce, autoGrow, sheet, confirmSheet, toast, uid, compressImage, fmtBytes, fmtDuration, fmtDate, norm, vibrate } from '../util.js';
import { icon } from '../icons.js';
import { state, on, getSermon, patchSermon, removeSermon, usedValues, allTags, setSetting } from '../store.js';
import { BIBLE, SECTIONS, SERMON_TYPES, DEFAULT_TAGS, bookByName, refLabel, isBlank, missingEssentials } from '../schema.js';
import { blobs, queue } from '../db.js';
import { enqueue, enqueueDelete } from '../sync.js';
import * as Rec from '../recorder.js';
import { tagTone } from '../components.js';

const BASIC = { id: 'basico', title: 'Básico', short: 'Básico', emoji: '🗓️' };
const EXTRAS = { id: 'extras', title: 'Anexos e etiquetas', short: 'Extras', emoji: '📎' };
const CULTO = {
  id: 'culto', title: 'A mensagem', short: 'Mensagem', emoji: '⚡',
  questions: SECTIONS.flatMap((s) => s.questions.filter((q) => q.culto)),
};

function stepsFor(mode) {
  return mode === 'culto' ? [BASIC, CULTO, EXTRAS] : [BASIC, ...SECTIONS, EXTRAS];
}

const CONTENT_KEYS = ['dateTime', 'place', 'type', 'preacher', 'title', 'baseText', 'supportVerses', 'answers', 'points', 'practice', 'linkedIds', 'tags', 'mode'];

export function renderEditor(root, { id }) {
  const original = getSermon(id);
  if (!original) {
    root.appendChild(h('div', { class: 'view' }, h('p', { class: 'empty' }, 'Pregação não encontrada.'), h('a', { class: 'btn btn-primary', href: '#/' }, 'Voltar ao início')));
    return () => {};
  }
  state.editingId = id;
  const s = JSON.parse(JSON.stringify(original)); // cópia de trabalho (só o conteúdo é salvo daqui)
  s.answers = s.answers || {};
  let mode = s.mode || state.settings.defaultMode || 'culto';
  let stepIdx = 0;
  let dirty = false;
  let closed = false;

  // ---------- Salvamento automático ----------
  const savedEl = h('span', { class: 'saved', role: 'status', 'aria-live': 'polite' }, icon('check'), 'Salvo');
  const doSave = async () => {
    if (!dirty) return;
    dirty = false;
    s.mode = mode;
    const content = JSON.parse(JSON.stringify(Object.fromEntries(CONTENT_KEYS.map((k) => [k, s[k]]))));
    await patchSermon(id, (r) => {
      Object.assign(r, content);
      r.updatedAt = Date.now();
      r.syncStatus = 'pending';
      r.syncError = null;
    }, { silent: true });
    savedEl.classList.remove('saving');
    savedEl.lastChild.textContent = 'Salvo no aparelho';
    if (!isBlank(s)) enqueue(id, 10_000); // envia ao Docs após 10 s sem digitar
  };
  const save = debounce(doSave, 400);
  function changed() {
    dirty = true;
    savedEl.classList.add('saving');
    savedEl.lastChild.textContent = 'Salvando…';
    save();
    updateProgress();
  }

  // ---------- Estrutura ----------
  const progressFill = h('div', { class: 'progress-fill' });
  const progressText = h('span', { class: 'progress-text' });
  const tabsHost = h('nav', { class: 'step-tabs', 'aria-label': 'Etapas' });
  const body = h('div', { class: 'step-body' });
  const actions = h('div', { class: 'editor-actions' });
  const recHost = h('div', { class: 'rec-host' });
  const modeSeg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Modo' });

  const isNew = original.draft && Date.now() - original.createdAt < 5000;
  root.appendChild(h('div', { class: 'view view-editor' },
    h('header', { class: 'topbar editor-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar editor', onclick: () => exit() }, icon('arrowLeft')),
      h('div', { class: 'editor-title' },
        h('h1', { class: 'topbar-title' }, isNew || original.draft ? 'Nova pregação' : 'Editar pregação'),
        savedEl),
      h('button', { class: 'icon-btn mic-btn', type: 'button', 'aria-label': 'Gravar áudio', onclick: () => toggleRecording() }, icon('mic'))
    ),
    h('div', { class: 'editor-head' },
      modeSeg,
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progresso' }, progressFill),
      progressText,
      tabsHost),
    body,
    h('div', { class: 'editor-bottom' }, recHost, actions)
  ));

  function drawMode() {
    clear(modeSeg);
    [['culto', 'bolt', 'Modo culto', 'rápido'], ['revisao', 'sofa', 'Modo revisão', 'em casa']].forEach(([m, ic, label, sub]) => {
      modeSeg.appendChild(h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(mode === m), class: 'seg' + (mode === m ? ' on' : ''),
        onclick: () => {
          if (mode === m) return;
          const curId = stepsFor(mode)[stepIdx].id;
          mode = m;
          const steps = stepsFor(mode);
          let ni = steps.findIndex((x) => x.id === curId);
          if (ni < 0) ni = curId === 'culto' ? 1 : (curId === 'extras' ? steps.length - 1 : 1);
          stepIdx = Math.min(ni, steps.length - 1);
          setSetting('defaultMode', m);
          changed();
          drawAll();
        },
      }, icon(ic), h('span', null, h('b', null, label), h('small', null, sub))));
    });
  }

  // ---------- Progresso ----------
  function filledMap() {
    const a = s.answers;
    const f = (v) => !!String(v || '').trim();
    return {
      place: f(s.place), preacher: f(s.preacher), title: f(s.title), baseText: !!(s.baseText && s.baseText.book),
      supportVerses: (s.supportVerses || []).length > 0,
      points: (s.points || []).some(f), practice: (s.practice || []).some((p) => f(p.text)),
      conexao: f(a.conexao) || (s.linkedIds || []).length > 0,
      ...Object.fromEntries(Object.keys(a).map((k) => [k, f(a[k])]).filter(([k]) => k !== 'conexao')),
    };
  }
  function stepFields(step) {
    if (step.id === 'basico') return mode === 'culto' ? ['place', 'preacher', 'title', 'baseText'] : ['place', 'preacher', 'title', 'baseText', 'supportVerses'];
    if (step.id === 'extras') return [];
    return step.questions.map((q) => q.id);
  }
  function updateProgress() {
    const fm = filledMap();
    const steps = stepsFor(mode);
    const all = steps.flatMap(stepFields);
    const done = all.filter((k) => fm[k]).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressFill.parentElement.setAttribute('aria-valuenow', String(pct));
    progressText.textContent = `${pct}% preenchido · etapa ${stepIdx + 1} de ${steps.length}`;
    tabsHost.querySelectorAll('.step-tab').forEach((el, i) => {
      const flds = stepFields(steps[i]);
      el.classList.toggle('complete', flds.length > 0 && flds.every((k) => fm[k]));
    });
  }

  function drawTabs() {
    clear(tabsHost);
    stepsFor(mode).forEach((st, i) => {
      tabsHost.appendChild(h('button', {
        type: 'button', class: 'step-tab' + (i === stepIdx ? ' on' : ''), 'aria-current': i === stepIdx ? 'step' : null,
        onclick: () => { stepIdx = i; drawAll(); window.scrollTo({ top: 0 }); },
      }, h('span', { class: 'step-emoji', 'aria-hidden': 'true' }, st.emoji), st.short || st.title, h('span', { class: 'step-check', 'aria-hidden': 'true' }, icon('check', 'ic-sm'))));
    });
    requestAnimationFrame(() => {
      const on = tabsHost.querySelector('.step-tab.on');
      if (on) tabsHost.scrollTo({ left: on.offsetLeft - 16, behavior: 'smooth' });
    });
  }

  function drawActions() {
    clear(actions);
    const steps = stepsFor(mode);
    const last = stepIdx === steps.length - 1;
    actions.appendChild(h('button', {
      class: 'btn btn-ghost', type: 'button', disabled: stepIdx === 0,
      onclick: () => { if (stepIdx > 0) { stepIdx--; drawAll(); window.scrollTo({ top: 0 }); } },
    }, icon('arrowLeft'), 'Voltar'));
    if (last) actions.appendChild(h('button', { class: 'btn btn-primary btn-grow', type: 'button', onclick: () => finish() }, icon('check'), 'Concluir'));
    else actions.appendChild(h('button', {
      class: 'btn btn-primary btn-grow', type: 'button',
      onclick: () => { stepIdx++; drawAll(); window.scrollTo({ top: 0 }); },
    }, 'Próxima', icon('arrowRight')));
  }

  // ---------- Campos ----------
  function labelFor(control, labelText) {
    const cid = 'f-' + uid().slice(0, 8);
    control.id = cid;
    const lab = h('label', { class: 'field-label', for: cid }, labelText);
    return lab;
  }

  function textInput(key, labelText, { placeholder = '', list = null, essential = false, suggestions = [] } = {}) {
    const input = h('input', {
      class: 'input', type: 'text', value: s[key] || '', placeholder, autocomplete: 'off', list,
      autocapitalize: 'sentences', enterkeyhint: 'next',
      oninput: (e) => { s[key] = e.target.value; changed(); },
    });
    const lab = labelFor(input, labelText);
    if (essential && mode === 'culto') lab.appendChild(h('span', { class: 'ess' }, 'essencial'));
    const quick = suggestions.length ? h('div', { class: 'quick-chips' }, suggestions.slice(0, 4).map((v) => h('button', {
      class: 'qchip', type: 'button', onclick: () => { input.value = v; s[key] = v; changed(); },
    }, v))) : null;
    return h('div', { class: 'field' }, lab, input, quick);
  }

  function datalist(idName, values) {
    return h('datalist', { id: idName }, values.map((v) => h('option', { value: v })));
  }

  function refPicker(ref, onChange, { compact = false } = {}) {
    const book = h('select', { class: 'input select', 'aria-label': 'Livro' },
      h('option', { value: '' }, 'Livro…'),
      h('optgroup', { label: 'Antigo Testamento' }, BIBLE.filter((b) => b.testament === 'AT').map((b) => h('option', { value: b.name }, b.name))),
      h('optgroup', { label: 'Novo Testamento' }, BIBLE.filter((b) => b.testament === 'NT').map((b) => h('option', { value: b.name }, b.name)))
    );
    book.value = ref.book || '';
    const chap = h('select', { class: 'input select', 'aria-label': 'Capítulo' });
    const verses = h('input', { class: 'input', type: 'text', inputmode: 'text', placeholder: 'vers. ex.: 16-18', 'aria-label': 'Versículos', value: ref.verses || '', autocomplete: 'off' });
    function fillChapters() {
      clear(chap);
      const b = bookByName(book.value);
      chap.appendChild(h('option', { value: '' }, 'Cap.'));
      if (b) for (let i = 1; i <= b.chapters; i++) chap.appendChild(h('option', { value: String(i) }, String(i)));
      chap.disabled = !b;
      chap.value = ref.chapter ? String(ref.chapter) : '';
    }
    fillChapters();
    book.addEventListener('change', () => { ref.book = book.value; ref.chapter = ''; fillChapters(); onChange(); });
    chap.addEventListener('change', () => { ref.chapter = chap.value; onChange(); });
    verses.addEventListener('input', () => { ref.verses = verses.value; onChange(); });
    return h('div', { class: 'ref-picker' + (compact ? ' compact' : '') }, book, h('div', { class: 'ref-row' }, chap, verses));
  }

  // ---------- Etapa: Básico ----------
  function stepBasic() {
    const frag = h('div', { class: 'fields' });
    const dt = h('input', { class: 'input', type: 'datetime-local', value: s.dateTime || '', oninput: (e) => { s.dateTime = e.target.value; changed(); } });
    frag.appendChild(h('div', { class: 'field' }, labelFor(dt, 'Data e horário'), dt));

    const places = usedValues('place');
    frag.appendChild(textInput('place', 'Igreja / local', { placeholder: 'Ex.: Igreja Batista Central', list: 'dl-places', essential: true, suggestions: places }));
    frag.appendChild(datalist('dl-places', places));

    const typeGroup = h('div', { class: 'chip-group', role: 'radiogroup', 'aria-label': 'Tipo' });
    const drawTypes = () => {
      clear(typeGroup);
      SERMON_TYPES.forEach((t) => typeGroup.appendChild(h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(s.type === t.id), class: 'pick' + (s.type === t.id ? ' on' : ''),
        onclick: () => { s.type = t.id; changed(); drawTypes(); },
      }, t.label)));
    };
    drawTypes();
    frag.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tipo'), typeGroup));

    const preachers = usedValues('preacher');
    frag.appendChild(textInput('preacher', 'Quem pregou', { placeholder: 'Nome do pregador', list: 'dl-preachers', essential: true, suggestions: preachers }));
    frag.appendChild(datalist('dl-preachers', preachers));

    frag.appendChild(textInput('title', 'Título / tema da mensagem', { placeholder: 'Ex.: A paz que excede todo entendimento', essential: true }));

    s.baseText = s.baseText || { book: '', chapter: '', verses: '' };
    const baseLabel = h('span', { class: 'field-label' }, 'Texto base', mode === 'culto' ? h('span', { class: 'ess' }, 'essencial') : null);
    frag.appendChild(h('div', { class: 'field' }, baseLabel, refPicker(s.baseText, changed)));

    // Versículos de apoio
    const listHost = h('div', { class: 'chips verse-chips' });
    const draft = { book: '', chapter: '', verses: '' };
    const pickerHost = h('div');
    const drawVerses = () => {
      clear(listHost);
      (s.supportVerses || []).forEach((v, i) => listHost.appendChild(h('span', { class: 'chip chip-ref removable' },
        icon('book'), refLabel(v),
        h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remover ${refLabel(v)}`, onclick: () => { s.supportVerses.splice(i, 1); changed(); drawVerses(); } }, icon('x', 'ic-sm'))
      )));
    };
    const drawPicker = () => { clear(pickerHost); pickerHost.appendChild(refPicker(draft, () => {}, { compact: true })); };
    drawVerses();
    drawPicker();
    frag.appendChild(h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Versículos de apoio'),
      listHost,
      h('div', { class: 'add-verse' }, pickerHost,
        h('button', {
          class: 'btn btn-soft btn-block', type: 'button',
          onclick: () => {
            if (!draft.book) { toast('Escolha o livro do versículo.'); return; }
            s.supportVerses = s.supportVerses || [];
            s.supportVerses.push({ ...draft });
            Object.assign(draft, { book: '', chapter: '', verses: '' });
            changed(); drawVerses(); drawPicker();
          },
        }, icon('plus'), 'Adicionar versículo'))
    ));
    return frag;
  }

  // ---------- Perguntas ----------
  function questionField(q) {
    if (q.type === 'points') return pointsField(q);
    if (q.type === 'practice') return practiceField(q);
    const ta = autoGrow(h('textarea', {
      class: 'input textarea' + (q.highlight ? ' textarea-highlight' : ''), rows: '2', placeholder: q.placeholder || 'Sua resposta (opcional)',
      value: s.answers[q.id] || '', autocapitalize: 'sentences',
      oninput: (e) => { s.answers[q.id] = e.target.value; changed(); },
    }));
    const lab = labelFor(ta, q.q);
    if (q.culto && mode === 'culto') lab.appendChild(h('span', { class: 'ess' }, 'essencial'));
    const wrap = h('div', { class: 'field' + (q.highlight ? ' field-highlight' : '') }, lab, ta);
    if (q.type === 'link') wrap.appendChild(linkedField());
    return wrap;
  }

  function pointsField(q) {
    s.points = s.points || [];
    if (!s.points.length) s.points.push('');
    const host = h('ol', { class: 'points' });
    const draw = (focusIdx) => {
      clear(host);
      s.points.forEach((p, i) => {
        const ta = autoGrow(h('textarea', {
          class: 'input textarea', rows: '1', value: p, placeholder: `${i + 1}º ponto`, enterkeyhint: 'next',
          'aria-label': `${i + 1}º ponto`,
          oninput: (e) => { s.points[i] = e.target.value; changed(); },
          onkeydown: (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); s.points.splice(i + 1, 0, ''); changed(); draw(i + 1); }
            if (e.key === 'Backspace' && !e.target.value && s.points.length > 1) { e.preventDefault(); s.points.splice(i, 1); changed(); draw(Math.max(0, i - 1)); }
          },
        }));
        host.appendChild(h('li', { class: 'point' },
          h('span', { class: 'point-n', 'aria-hidden': 'true' }, `${i + 1}º`),
          ta,
          h('div', { class: 'point-tools' },
            i > 0 ? h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Mover para cima', onclick: () => { [s.points[i - 1], s.points[i]] = [s.points[i], s.points[i - 1]]; changed(); draw(i - 1); } }, icon('arrowUp')) : null,
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `Remover ${i + 1}º ponto`, onclick: () => { s.points.splice(i, 1); if (!s.points.length) s.points.push(''); changed(); draw(); } }, icon('trash'))
          )
        ));
        if (focusIdx === i) ta.focus();
      });
    };
    draw();
    const lab = h('span', { class: 'field-label' }, q.q, q.culto && mode === 'culto' ? h('span', { class: 'ess' }, 'essencial') : null);
    return h('div', { class: 'field' }, lab, host,
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => { s.points.push(''); changed(); draw(s.points.length - 1); } }, icon('plus'), 'Adicionar ponto'));
  }

  function practiceField(q) {
    s.practice = s.practice || [];
    const host = h('ul', { class: 'practice' });
    const draw = (focusIdx) => {
      clear(host);
      s.practice.forEach((p, i) => {
        const input = h('input', {
          class: 'input', type: 'text', value: p.text, placeholder: 'Ex.: Ligar para minha mãe e pedir perdão', enterkeyhint: 'next',
          'aria-label': `Ação ${i + 1}`,
          oninput: (e) => { p.text = e.target.value; changed(); },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); s.practice.splice(i + 1, 0, { id: uid(), text: '', done: false }); changed(); draw(i + 1); } },
        });
        host.appendChild(h('li', { class: 'practice-item' },
          h('label', { class: 'check', title: 'Feito' },
            h('input', { type: 'checkbox', checked: p.done, 'aria-label': 'Feito', onchange: (e) => { p.done = e.target.checked; p.doneAt = p.done ? Date.now() : null; changed(); } }),
            h('span', { class: 'check-box', 'aria-hidden': 'true' }, icon('check'))),
          input,
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover ação', onclick: () => { s.practice.splice(i, 1); changed(); draw(); } }, icon('trash'))
        ));
        if (focusIdx === i) input.focus();
      });
    };
    draw();
    return h('div', { class: 'field field-practice' },
      h('span', { class: 'field-label' }, q.q),
      h('p', { class: 'field-hint' }, 'Cada item vira uma tarefa com caixa “Feito”. Alguns dias depois, o Selah pergunta se você colocou em prática.'),
      host,
      h('button', { class: 'btn btn-coral-soft btn-block', type: 'button', onclick: () => { s.practice.push({ id: uid(), text: '', done: false }); changed(); draw(s.practice.length - 1); } }, icon('plus'), 'Adicionar ação'));
  }

  function linkedField() {
    s.linkedIds = s.linkedIds || [];
    const host = h('div', { class: 'chips' });
    const draw = () => {
      clear(host);
      s.linkedIds.forEach((lid, i) => {
        const l = getSermon(lid);
        if (!l) return;
        host.appendChild(h('span', { class: 'chip chip-link removable' }, icon('link'), `${l.title || 'Sem título'} · ${fmtDate(l.dateTime)}`,
          h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Remover vínculo', onclick: () => { s.linkedIds.splice(i, 1); changed(); draw(); } }, icon('x', 'ic-sm'))));
      });
    };
    draw();
    const pick = () => {
      const others = state.sermons.filter((x) => x.id !== id && !s.linkedIds.includes(x.id) && !isBlank(x))
        .sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
      if (!others.length) { toast('Ainda não há outras pregações salvas para vincular.'); return; }
      const listHost = h('div', { class: 'option-list' });
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar pregação…', 'aria-label': 'Buscar pregação' });
      const drawList = () => {
        clear(listHost);
        const qn = norm(search.value);
        others.filter((x) => !qn || norm(`${x.title} ${x.preacher}`).includes(qn)).slice(0, 50).forEach((x) => listHost.appendChild(h('button', {
          class: 'option', type: 'button', onclick: () => { s.linkedIds.push(x.id); changed(); draw(); sh.close(); },
        }, h('span', null, h('b', null, x.title || 'Sem título'), h('small', null, [x.preacher, fmtDate(x.dateTime)].filter(Boolean).join(' · '))), icon('plus'))));
      };
      search.addEventListener('input', drawList);
      drawList();
      const sh = sheet('Vincular pregação', h('div', null, search, listHost), { autofocus: false });
    };
    return h('div', { class: 'linked' }, host, h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: pick }, icon('link'), 'Vincular a outra pregação'));
  }

  function stepQuestions(step) {
    return h('div', { class: 'fields' },
      step.id === 'culto' ? h('p', { class: 'step-intro' }, 'Só o essencial, para anotar sem perder a pregação. Em casa, troque para o Modo revisão e aprofunde.') : null,
      step.questions.map(questionField));
  }

  // ---------- Etapa: Anexos e etiquetas ----------
  const attHost = h('div', { class: 'attachments' });
  const urls = [];
  function drawAttachments() {
    clear(attHost);
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const rec = getSermon(id);
    const list = (rec && rec.attachments) || [];
    if (!list.length) { attHost.appendChild(h('p', { class: 'field-hint' }, 'Nenhum anexo ainda.')); return; }
    list.forEach((a) => {
      const thumb = h('div', { class: 'att-thumb' }, icon(a.kind === 'audio' ? 'mic' : 'image'));
      blobs.get(a.id).then((b) => {
        if (!b || !b.blob) return;
        const u = URL.createObjectURL(b.blob);
        urls.push(u);
        if (a.kind === 'photo') { clear(thumb); thumb.appendChild(h('img', { src: u, alt: 'Foto anexada', loading: 'lazy' })); }
        else { const au = h('audio', { controls: true, preload: 'metadata', src: u }); thumb.replaceWith(h('div', { class: 'att-audio' }, au)); }
      });
      attHost.appendChild(h('div', { class: 'att' },
        thumb,
        h('div', { class: 'att-info' },
          h('b', null, a.kind === 'audio' ? (a.name || 'Áudio') : 'Foto'),
          h('small', null, [a.duration ? fmtDuration(a.duration) : '', fmtBytes(a.size), a.driveId ? 'no Drive ✓' : 'aguardando envio'].filter(Boolean).join(' · '))),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover anexo', onclick: () => removeAttachment(a) }, icon('trash'))
      ));
    });
  }

  async function removeAttachment(a) {
    const ok = await confirmSheet('Remover anexo?', a.driveId ? 'O arquivo também vai para a lixeira do seu Google Drive.' : 'O arquivo será apagado deste aparelho.', { ok: 'Remover', danger: true });
    if (!ok) return;
    await patchSermon(id, (r) => { r.attachments = (r.attachments || []).filter((x) => x.id !== a.id); r.updatedAt = Date.now(); r.syncStatus = 'pending'; }, { silent: true });
    await blobs.del(a.id);
    if (a.driveId) await enqueueDelete('att-' + a.id, null, [a.driveId]);
    enqueue(id, 3000);
    drawAttachments();
  }

  async function addPhotos(files) {
    if (!files || !files.length) return;
    toast(files.length > 1 ? `Adicionando ${files.length} fotos…` : 'Adicionando foto…');
    for (const file of files) {
      const blob = await compressImage(file);
      const att = { id: uid(), kind: 'photo', mime: blob.type || 'image/jpeg', size: blob.size, name: 'Foto', createdAt: Date.now() };
      await blobs.put(att.id, blob);
      await patchSermon(id, (r) => { r.attachments = r.attachments || []; r.attachments.push(att); r.updatedAt = Date.now(); r.syncStatus = 'pending'; }, { silent: true });
    }
    enqueue(id, 3000);
    drawAttachments();
  }

  const recBtnHost = h('div');
  function drawRecButton() {
    clear(recBtnHost);
    const cur = Rec.current();
    if (!Rec.recordingSupported()) { recBtnHost.appendChild(h('p', { class: 'field-hint' }, 'Este navegador não permite gravar áudio.')); return; }
    if (cur && cur.sermonId === id) {
      recBtnHost.appendChild(h('button', { class: 'btn btn-rec on btn-block', type: 'button', onclick: () => toggleRecording() }, icon('stop'), `Parar gravação (${fmtDuration(cur.elapsed)})`));
    } else if (cur) {
      recBtnHost.appendChild(h('p', { class: 'field-hint' }, 'Há uma gravação em andamento em outra pregação.'));
    } else {
      recBtnHost.appendChild(h('button', { class: 'btn btn-rec btn-block', type: 'button', onclick: () => toggleRecording() }, icon('mic'), 'Gravar áudio da pregação'));
    }
  }

  function stepExtras() {
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { addPhotos([...e.target.files]); e.target.value = ''; } });
    const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { addPhotos([...e.target.files]); e.target.value = ''; } });
    drawRecButton();
    drawAttachments();

    // Etiquetas
    const tagsHost = h('div', { class: 'chip-group tags-group' });
    const drawTags = () => {
      clear(tagsHost);
      allTags(DEFAULT_TAGS).forEach((t) => {
        const onT = (s.tags || []).some((x) => x.toLowerCase() === t.toLowerCase());
        tagsHost.appendChild(h('button', {
          type: 'button', class: `pick tag-pick ${tagTone(t) ? 'aqua' : 'pink'}${onT ? ' on' : ''}`, 'aria-pressed': String(onT),
          onclick: () => {
            s.tags = s.tags || [];
            if (onT) s.tags = s.tags.filter((x) => x.toLowerCase() !== t.toLowerCase()); else s.tags.push(t);
            vibrate(8); changed(); drawTags();
          },
        }, '#' + t));
      });
    };
    drawTags();
    const newTag = h('input', { class: 'input', type: 'text', placeholder: 'Criar etiqueta…', 'aria-label': 'Nova etiqueta', enterkeyhint: 'done', autocapitalize: 'none' });
    const addTag = async () => {
      const t = newTag.value.trim().replace(/^#/, '').slice(0, 30);
      if (!t) return;
      const custom = state.settings.customTags || [];
      if (!allTags(DEFAULT_TAGS).some((x) => x.toLowerCase() === t.toLowerCase())) await setSetting('customTags', [...custom, t]);
      s.tags = s.tags || [];
      if (!s.tags.some((x) => x.toLowerCase() === t.toLowerCase())) s.tags.push(t);
      newTag.value = '';
      changed(); drawTags();
    };
    newTag.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

    return h('div', { class: 'fields' },
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Áudio'),
        recBtnHost,
        h('p', { class: 'field-hint' }, 'Dica: deixe a tela ligada durante a gravação. O áudio vai para a pasta “Anexos” no seu Drive.')),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Fotos das anotações ou dos slides'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-soft', type: 'button', onclick: () => cam.click() }, icon('camera'), 'Câmera'),
          h('button', { class: 'btn btn-soft', type: 'button', onclick: () => gal.click() }, icon('image'), 'Galeria')),
        cam, gal),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Anexos'), attHost),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Etiquetas'),
        tagsHost,
        h('div', { class: 'inline-add' }, newTag, h('button', { class: 'btn btn-soft', type: 'button', onclick: addTag }, icon('plus'), 'Criar')))
    );
  }

  // ---------- Gravação ----------
  async function toggleRecording() {
    const cur = Rec.current();
    if (cur && cur.sermonId === id) {
      const att = await Rec.stop();
      if (att) { toast('Áudio salvo ✓'); enqueue(id, 3000); }
      drawRecBar(); drawRecButton(); drawAttachments();
      return;
    }
    if (cur) { toast('Já existe uma gravação em andamento.'); return; }
    try {
      await Rec.start(id);
      toast('Gravando… pode continuar anotando.');
    } catch (e) {
      toast(e.message);
    }
    drawRecBar(); drawRecButton();
  }

  function drawRecBar() {
    clear(recHost);
    const cur = Rec.current();
    if (!cur) return;
    recHost.appendChild(h('div', { class: 'rec-bar' },
      h('span', { class: 'rec-dot' + (cur.paused ? ' paused' : '') }),
      h('span', { class: 'rec-time' }, (cur.paused ? 'Pausado ' : 'Gravando ') + fmtDuration(cur.elapsed)),
      cur.sermonId === id ? [
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': cur.paused ? 'Continuar gravação' : 'Pausar gravação', onclick: () => { cur.paused ? Rec.resume() : Rec.pause(); drawRecBar(); } }, icon(cur.paused ? 'play' : 'pause')),
        h('button', { class: 'btn btn-rec on sm', type: 'button', onclick: () => toggleRecording() }, icon('stop'), 'Parar'),
      ] : null
    ));
  }

  // ---------- Desenho ----------
  function drawStep() {
    clear(body);
    const step = stepsFor(mode)[stepIdx];
    body.appendChild(h('h2', { class: 'step-title' }, h('span', { 'aria-hidden': 'true' }, step.emoji + ' '), step.title));
    if (step.id === 'basico') body.appendChild(stepBasic());
    else if (step.id === 'extras') body.appendChild(stepExtras());
    else body.appendChild(stepQuestions(step));
    body.classList.remove('enter');
    void body.offsetWidth;
    body.classList.add('enter');
  }
  function drawAll() { drawMode(); drawTabs(); drawStep(); drawActions(); updateProgress(); drawRecBar(); }
  drawAll();

  // ---------- Saída ----------
  async function finish() {
    const miss = missingEssentials(s);
    if (miss.length) {
      const goOn = await confirmSheet('Faltam alguns campos essenciais',
        `Ainda não preenchidos: ${miss.join(', ')}. Você pode concluir assim mesmo e completar depois.`,
        { ok: 'Concluir mesmo assim', cancel: 'Continuar preenchendo' });
      if (!goOn) return;
    }
    await patchSermon(id, (r) => { r.draft = false; }, { silent: true });
    exit(true);
  }

  async function exit(concluded = false) {
    await flush();
    const fromDetail = sessionStorage.getItem('selah.editFrom') === id;
    sessionStorage.removeItem('selah.editFrom');
    if (concluded) toast(navigator.onLine ? 'Pregação salva ✓' : 'Salva no aparelho. Vai para o Docs quando a internet voltar.');
    if (!getSermon(id)) { location.replace('#/'); return; }
    if (fromDetail) history.back();
    else location.replace('#/p/' + id);
  }

  async function flush() {
    if (closed) return;
    closed = true;
    save.cancel();
    dirty = true;
    await doSave();
    const rec = getSermon(id);
    if (rec && isBlank(rec) && !Rec.current()) {
      await removeSermon(id);
      await queue.del(id);
      for (const a of rec.attachments || []) await blobs.del(a.id);
      return;
    }
    if (rec) await enqueue(id, 0);
  }

  const onHide = () => { if (document.visibilityState === 'hidden') { save.flush(); enqueue(id, 0); } };
  document.addEventListener('visibilitychange', onHide);
  const offRec = on('rec', () => { drawRecBar(); const cur = Rec.current(); if (cur && stepsFor(mode)[stepIdx].id === 'extras') { const b = recBtnHost.querySelector('.btn-rec.on'); if (b) b.lastChild.textContent = `Parar gravação (${fmtDuration(cur.elapsed)})`; } });

  return async () => {
    document.removeEventListener('visibilitychange', onHide);
    offRec();
    urls.forEach((u) => URL.revokeObjectURL(u));
    state.editingId = null;
    await flush();
  };
}
