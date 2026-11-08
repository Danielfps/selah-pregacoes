// Utilidades gerais: criação de elementos, datas, toasts e folhas inferiores.
import { icon } from './icons.js';

/** Cria um elemento DOM. props: class, style, dataset, on<Evento>, demais atributos. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ---------- Datas ----------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-11-07T19:30" no horário local de agora. */
export function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  return toLocalInput(d);
}
export function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function parseLocal(s) {
  if (!s) return new Date(NaN);
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}
export function isoDate(s) { return (s || '').slice(0, 10); }
export function fmtDate(s) {
  const d = parseLocal(s);
  if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function fmtDateTime(s) {
  const d = parseLocal(s);
  if (isNaN(d)) return '';
  return `${fmtDate(s)} às ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDateLong(s) {
  const d = parseLocal(s);
  if (isNaN(d)) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function monthLabel(s) {
  const d = parseLocal(s);
  if (isNaN(d)) return 'Sem data';
  const m = MESES[d.getMonth()];
  return `${m.charAt(0).toUpperCase() + m.slice(1)} de ${d.getFullYear()}`;
}
export function dayBadge(s) {
  const d = parseLocal(s);
  if (isNaN(d)) return { day: '--', month: '' };
  return { day: String(d.getDate()).padStart(2, '0'), month: MESES_CURTOS[d.getMonth()] };
}
export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `há ${hh} h`;
  const dd = Math.round(hh / 24);
  return dd === 1 ? 'ontem' : `há ${dd} dias`;
}
/** Segunda-feira (00:00) da semana da data. */
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  return x;
}
export function weekKey(d) {
  const w = weekStart(d);
  return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`;
}
export function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Boa noite';
  if (hr < 12) return 'Bom dia';
  if (hr < 18) return 'Boa tarde';
  return 'Boa noite';
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
export function fmtBytes(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

/** Normaliza texto para busca (sem acentos, minúsculo). */
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }

// ---------- Toast ----------
let toastTimer;
export function toast(msg, opts = {}) {
  const host = document.getElementById('toast');
  if (!host) return;
  clear(host);
  host.appendChild(h('span', null, msg));
  if (opts.action) {
    host.appendChild(h('button', { class: 'toast-action', type: 'button', onclick: () => { hide(); opts.action.fn(); } }, opts.action.label));
  }
  host.classList.add('show');
  clearTimeout(toastTimer);
  const hide = () => host.classList.remove('show');
  toastTimer = setTimeout(hide, opts.duration || (opts.action ? 6000 : 2800));
}

// ---------- Folha inferior (bottom sheet) ----------
/** Abre uma folha inferior. content: Node. Retorna { close }. */
export function sheet(title, content, opts = {}) {
  const prevFocus = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar', onclick: () => close() }, icon('x'))
    ),
    h('div', { class: 'sheet-body' }, content)
  );
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => backdrop.classList.add('open'));
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const focusable = panel.querySelector('input, select, textarea, button:not(.icon-btn)');
  setTimeout(() => (opts.autofocus && focusable ? focusable : panel.querySelector('.icon-btn'))?.focus(), 50);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => backdrop.remove(), 220);
    opts.onClose && opts.onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  return { close, panel };
}

/** Diálogo de confirmação em folha inferior. Resolve true/false. */
export function confirmSheet(title, message, { ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(title, h('div', null,
      h('p', { class: 'sheet-text' }, message),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { answered = true; s.close(); resolve(false); } }, cancel),
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: () => { answered = true; s.close(); resolve(true); } }, ok)
      )
    ), { onClose: () => { if (!answered) resolve(false); } });
  });
}

export function vibrate(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* sem suporte */ } }

/** Ajusta a altura de um textarea ao conteúdo. */
export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 640) + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

/** Comprime uma foto para JPEG (lado maior até maxSide). */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const hgt = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = hgt;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, hgt);
    bitmap.close && bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size < file.size) return blob;
    return file;
  } catch (_) {
    return file;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ---------- Navegação ----------
/** Volta para a tela anterior do app, ou vai para `fallback` se não houver. */
export function goBack(fallback = '#/') {
  if (history.state && history.state.selahDepth > 1) history.back();
  else location.replace(fallback);
}
