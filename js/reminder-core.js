// Regras dos lembretes de aplicação. Script clássico: usado pela página e pelo service worker.
(function (g) {
  var DAY = 24 * 60 * 60 * 1000;

  function parseLocal(s) {
    if (!s) return NaN;
    var p = s.split('T');
    var d = p[0].split('-').map(Number);
    var t = (p[1] || '00:00').split(':').map(Number);
    return new Date(d[0], (d[1] || 1) - 1, d[2] || 1, t[0] || 0, t[1] || 0).getTime();
  }

  /** Pregações que pedem o lembrete "Você colocou em prática o que ouviu?". */
  function dueReminders(sermons, settings, now) {
    now = now || Date.now();
    if (!settings || settings.reminderEnabled === false) return [];
    var days = Number(settings.reminderDays) || 3;
    return (sermons || []).filter(function (s) {
      var items = (s.practice || []).filter(function (p) { return p.text && p.text.trim(); });
      if (!items.length) return false;
      if (items.every(function (p) { return p.done; })) return false;
      var r = s.reminder || {};
      if (r.answeredAt) return false;
      if (r.snoozeUntil && r.snoozeUntil > now) return false;
      var when = parseLocal(s.dateTime);
      if (isNaN(when)) when = s.createdAt;
      if (now < when + days * DAY) return false;
      if (now > when + 45 * DAY) return false; // não insiste em mensagens muito antigas
      return true;
    }).sort(function (a, b) { return (b.dateTime || '').localeCompare(a.dateTime || ''); });
  }

  /** Lembretes devidos que ainda não viraram notificação hoje. */
  function toNotify(sermons, settings, now) {
    now = now || Date.now();
    return dueReminders(sermons, settings, now).filter(function (s) {
      var r = s.reminder || {};
      return !r.notifiedAt || now - r.notifiedAt > DAY;
    });
  }

  // ----- Horários do culto -----
  // slot: { id, day (0 = domingo … 6 = sábado), time: 'HH:MM', place }
  function slotStart(slot, now) {
    var d = new Date(now);
    var hm = (slot.time || '00:00').split(':').map(Number);
    var s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0] || 0, hm[1] || 0).getTime();
    var diff = (Number(slot.day) - d.getDay() + 7) % 7;
    s += diff * DAY;
    if (s - now > 6 * DAY) s -= 7 * DAY; // ocorrência desta semana pode já ter começado
    return s;
  }
  function dateKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  /** Culto acontecendo agora (de 30 min antes até 2 h depois do início). */
  function cultNow(slots, now) {
    now = now || Date.now();
    for (var i = 0; i < (slots || []).length; i++) {
      var st = slotStart(slots[i], now);
      if (now >= st - 30 * 60000 && now <= st + 120 * 60000) return { slot: slots[i], start: st, key: slots[i].id + '@' + dateKey(st) };
    }
    return null;
  }

  g.SelahReminderCore = { dueReminders: dueReminders, toNotify: toNotify, cultNow: cultNow, slotStart: slotStart, DAY: DAY };
})(typeof self !== 'undefined' ? self : window);
