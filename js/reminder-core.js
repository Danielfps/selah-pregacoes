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

  g.SelahReminderCore = { dueReminders: dueReminders, toNotify: toNotify, DAY: DAY };
})(typeof self !== 'undefined' ? self : window);
