// Horários do culto: lembrete para anotar (calendário do celular, notificação e cartão no início).
import { h, clear, sheet, toast, uid, downloadBlob, isIOS } from './util.js';
import { icon } from './icons.js';
import { state, setSetting } from './store.js';

export const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const APP_URL = 'https://danielfps.github.io/selah-pregacoes/';

export function slots() { return state.settings.cultSlots || []; }
export function slotLabel(s) { return `${DAYS[s.day]} às ${s.time.replace(':', 'h')}${s.place ? ' · ' + s.place : ''}`; }

export function cultNow() {
  return window.SelahReminderCore ? window.SelahReminderCore.cultNow(slots(), Date.now()) : null;
}

const pad = (n) => String(n).padStart(2, '0');
function nextDate(slot) {
  const start = new Date(window.SelahReminderCore.slotStart(slot, Date.now()));
  if (start.getTime() < Date.now() - 2 * 3600e3) start.setDate(start.getDate() + 7);
  return start;
}
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** Link do Google Agenda com evento semanal. */
export function googleCalendarLink(slot) {
  const st = nextDate(slot);
  const en = new Date(st.getTime() + 2 * 3600e3);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Culto – anotar no Selah ✍️',
    dates: `${stamp(st)}/${stamp(en)}`,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    details: `Hora de anotar a pregação no Selah: ${APP_URL}`,
    location: slot.place || '',
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[slot.day]}`,
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

/** Arquivo .ics com todos os horários (iPhone e outros calendários). Alarme 10 min antes e no início. */
export function downloadIcs() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Selah//Horarios do culto//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const now = new Date();
  const utc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  for (const s of slots()) {
    const st = nextDate(s);
    const en = new Date(st.getTime() + 2 * 3600e3);
    lines.push('BEGIN:VEVENT', `UID:selah-${s.id}@danielfps.github.io`, `DTSTAMP:${utc}`,
      `DTSTART:${stamp(st)}`, `DTEND:${stamp(en)}`, `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[s.day]}`,
      'SUMMARY:Culto – anotar no Selah', `DESCRIPTION:Hora de anotar a pregação no Selah: ${APP_URL}`, `URL:${APP_URL}`,
      s.place ? `LOCATION:${s.place.replace(/[,;\\]/g, ' ')}` : null,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT10M', 'DESCRIPTION:O culto vai começar! Abra o Selah para anotar.', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Hora do culto! Anote a pregação no Selah.', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  downloadBlob(blob, 'selah-horarios-do-culto.ics');
}

/** Mostra notificação quando o culto está começando (se permitido) – uma vez por culto. */
export async function notifyCult() {
  const c = cultNow();
  if (!c || !('Notification' in window) || Notification.permission !== 'granted') return;
  const done = state.settings.cultNotified || {};
  if (done[c.key]) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Hora do culto! 🙌', {
      body: 'Abra o Selah e anote a pregação de hoje.', tag: 'selah-culto', icon: 'icons/icon-192.png', badge: 'icons/icon-maskable-192.png',
      data: { url: '#/nova' },
    });
    await setSetting('cultNotified', { [c.key]: Date.now() });
  } catch (_) { /* sem suporte */ }
}

/** Abre uma nova pregação já com o local do culto. */
export function startFromCult(slot) {
  if (slot && slot.place) sessionStorage.setItem('selah.newPlace', slot.place);
  location.hash = '#/nova';
}

/** Editor dos horários (folha). */
export function openCultEditor(onChange) {
  const list = h('div', { class: 'cult-list' });
  const draw = () => {
    clear(list);
    const all = slots();
    if (!all.length) list.appendChild(h('p', { class: 'field-hint' }, 'Nenhum horário ainda. Adicione os horários dos cultos que você frequenta.'));
    all.forEach((s) => list.appendChild(h('div', { class: 'cult-item' },
      h('div', { class: 'cult-when' }, h('b', null, DAYS[s.day]), h('span', null, s.time.replace(':', 'h')), s.place ? h('small', null, s.place) : null),
      h('a', { class: 'btn btn-soft sm', href: googleCalendarLink(s), target: '_blank', rel: 'noopener', title: 'Adicionar ao Google Agenda' }, icon('calendar'), 'Agenda'),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remover horário', onclick: async () => { await setSetting('cultSlots', slots().filter((x) => x.id !== s.id)); draw(); onChange && onChange(); } }, icon('trash')))));
  };
  const day = h('select', { class: 'input select', 'aria-label': 'Dia' }, DAYS.map((d, i) => h('option', { value: String(i) }, d)));
  const time = h('input', { class: 'input', type: 'time', value: '18:00', 'aria-label': 'Horário' });
  const place = h('input', { class: 'input', type: 'text', placeholder: 'Igreja (opcional)', 'aria-label': 'Igreja', value: (state.sermons[0] && state.sermons[0].place) || '' });
  draw();
  sheet('Horários do culto', h('div', null,
    h('p', { class: 'sheet-text' }, 'Na hora do culto, o Selah lembra você de anotar a pregação.'),
    list,
    h('div', { class: 'add-verse' },
      h('div', { class: 'ref-row' }, day, time),
      place,
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: async () => {
        if (!time.value) { toast('Escolha o horário.'); return; }
        await setSetting('cultSlots', [...slots(), { id: uid().slice(0, 8), day: Number(day.value), time: time.value, place: place.value.trim() }]
          .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)));
        toast('Horário adicionado ✓');
        draw(); onChange && onChange();
      } }, icon('plus'), 'Adicionar horário')),
    h('div', { class: 'cult-cal' },
      h('b', null, '📅 Lembrete na hora certa, mesmo com o app fechado'),
      h('p', { class: 'field-hint' }, isIOS()
        ? 'Adicione os horários ao Calendário do iPhone: ele avisa 10 minutos antes e na hora do culto.'
        : 'Toque em “Agenda” em cada horário para criar o lembrete semanal no Google Agenda.'),
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => { if (!slots().length) { toast('Adicione um horário primeiro.'); return; } downloadIcs(); toast('Abra o arquivo baixado e toque em “Adicionar”.', { duration: 5000 }); } },
        icon('download'), isIOS() ? 'Adicionar ao Calendário do iPhone' : 'Baixar todos para o calendário (.ics)'))
  ));
}

