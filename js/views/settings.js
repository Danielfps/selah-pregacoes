// Configurações: conta Google, tema, lembretes, etiquetas, backup e armazenamento.
import { h, clear, toast, confirmSheet, fmtBytes, timeAgo, isIOS, isStandalone, plural } from '../util.js';
import { icon } from '../icons.js';
import { state, on, setSetting } from '../store.js';
import { topBar } from '../components.js';
import * as G from '../google.js';
import { login, logout } from '../auth.js';
import { runSync } from '../sync.js';
import { exportBackup, importBackup } from '../backup.js';
import { askNotificationPermission, notificationPermission, notificationsSupported } from '../reminders.js';
import { blobs, settings as settingsDB } from '../db.js';
import { applyTheme, APP_VERSION, promptInstall } from '../platform.js';

export function renderSettings(root) {
  const wrap = h('div', { class: 'view view-settings' });
  root.appendChild(wrap);

  const group = (title, ic, ...children) => h('section', { class: 'card set-card' }, h('h2', { class: 'card-h' }, icon(ic), title), ...children);
  const row = (label, sub, control) => h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('b', null, label), sub ? h('small', null, sub) : null), control);
  const toggle = (checked, onChange, label) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label, onchange: (e) => onChange(e.target.checked) }),
    h('span', { class: 'switch-ui', 'aria-hidden': 'true' }));
  const seg = (options, value, onPick, label) => h('div', { class: 'segmented small', role: 'radiogroup', 'aria-label': label },
    options.map(([v, text, ic]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === v), class: 'seg' + (value === v ? ' on' : ''), onclick: () => onPick(v) }, ic ? icon(ic) : null, h('span', null, text))));

  async function draw() {
    clear(wrap);
    wrap.appendChild(topBar({ title: 'Configurações', big: true }));

    // ----- Conta Google -----
    const acc = state.settings.account;
    const drive = await settingsDB.get('drive', null);
    let accountBody;
    if (!G.isConfigured()) {
      accountBody = h('div', null,
        h('p', { class: 'set-note' }, 'O login com o Google ainda não foi configurado neste app. Enquanto isso, tudo fica salvo só neste aparelho.'),
        h('a', { class: 'btn btn-soft btn-block', href: '#/configurar-google' }, icon('info'), 'Como configurar'));
    } else if (state.auth === 'signed-in' || (acc && state.auth === 'expired')) {
      accountBody = h('div', null,
        h('div', { class: 'account' },
          acc && acc.photo ? h('img', { class: 'avatar', src: acc.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'avatar avatar-ph' }, icon('user')),
          h('div', null, h('b', null, (acc && (acc.name || acc.email)) || 'Conta Google'), h('small', null, acc && acc.email ? acc.email : ''),
            h('small', { class: state.auth === 'signed-in' ? 'ok-text' : 'warn-text' }, state.auth === 'signed-in' ? 'Conectado' : 'Conexão expirada – entre de novo'))),
        state.auth !== 'signed-in' ? h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => login() }, icon('login'), 'Entrar de novo') : null,
        row('Fila de envio', state.queueCount ? `${plural(state.queueCount, 'item aguardando', 'itens aguardando')}` : 'Tudo enviado ✓',
          h('button', { class: 'btn btn-soft sm', type: 'button', disabled: state.syncing || !state.queueCount, onclick: () => runSync() }, icon('refresh', state.syncing ? 'spin' : ''), state.syncing ? 'Enviando…' : 'Enviar agora')),
        drive && drive.folderId ? h('a', { class: 'btn btn-soft btn-block', href: G.folderUrl(drive.folderId), target: '_blank', rel: 'noopener' }, icon('folder'), 'Abrir pasta “Selah – Pregações” no Drive') : null,
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: async () => {
          const ok = await confirmSheet('Sair da conta Google?', 'Suas pregações continuam neste aparelho e no seu Google Docs. Novas alterações só serão enviadas quando você entrar de novo.', { ok: 'Sair' });
          if (ok) logout();
        } }, icon('logout'), 'Sair'));
    } else {
      accountBody = h('div', null,
        h('p', { class: 'set-note' }, 'Entre com o Google para salvar cada pregação como um documento do Google Docs na pasta “Selah – Pregações” do seu Drive. O Selah só acessa os arquivos que ele mesmo cria.'),
        h('button', { class: 'btn btn-google btn-block', type: 'button', onclick: () => login() }, h('span', { class: 'g-logo', 'aria-hidden': 'true' }, 'G'), 'Conectar ao Google Docs'));
    }
    wrap.appendChild(group('Conta Google', 'cloud', accountBody));

    // ----- Aparência -----
    wrap.appendChild(group('Aparência', 'sun',
      row('Tema', null, seg([['auto', 'Auto', null], ['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']], state.settings.theme, async (v) => { await setSetting('theme', v); applyTheme(); draw(); }, 'Tema')),
      row('Ao criar uma pregação', 'Modo que abre primeiro', seg([['culto', 'Culto', 'bolt'], ['revisao', 'Revisão', 'sofa']], state.settings.defaultMode, async (v) => { await setSetting('defaultMode', v); draw(); }, 'Modo padrão'))
    ));

    // ----- Lembretes -----
    const perm = notificationPermission();
    const days = h('select', { class: 'input select sm', 'aria-label': 'Dias depois', onchange: (e) => setSetting('reminderDays', Number(e.target.value)) },
      [1, 2, 3, 4, 5, 7].map((d) => h('option', { value: String(d) }, `${d} ${d === 1 ? 'dia' : 'dias'}`)));
    days.value = String(state.settings.reminderDays || 3);
    wrap.appendChild(group('Lembretes', 'bell',
      row('Lembrete de aplicação', '“Você colocou em prática o que ouviu?”', toggle(state.settings.reminderEnabled !== false, async (v) => { await setSetting('reminderEnabled', v); draw(); }, 'Lembrete de aplicação')),
      state.settings.reminderEnabled !== false ? row('Perguntar depois de', null, days) : null,
      row('Notificações', perm === 'granted' ? 'Ativadas ✓' : perm === 'denied' ? 'Bloqueadas nas configurações do navegador' : perm === 'unsupported' ? (isIOS() && !isStandalone() ? 'No iPhone, instale o app na Tela de Início para receber notificações' : 'Este navegador não oferece notificações') : 'O lembrete também aparece como cartão no início',
        perm === 'default' && notificationsSupported() ? h('button', { class: 'btn btn-soft sm', type: 'button', onclick: async () => { const p = await askNotificationPermission(); toast(p === 'granted' ? 'Notificações ativadas ✓' : 'Notificações não permitidas. Os lembretes aparecem no início do app.'); draw(); } }, 'Ativar') : null),
      row('Relembre semanal', 'Cartão com uma pregação antiga e sua frase marcante', toggle(state.settings.weeklyReview !== false, (v) => setSetting('weeklyReview', v), 'Relembre semanal'))
    ));

    // ----- Etiquetas criadas -----
    const custom = state.settings.customTags || [];
    if (custom.length) {
      wrap.appendChild(group('Etiquetas criadas por você', 'tag',
        h('div', { class: 'chips' }, custom.map((t) => h('span', { class: 'chip chip-tag chip-aqua removable' }, '#' + t,
          h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remover etiqueta ${t}`, onclick: async () => { await setSetting('customTags', custom.filter((x) => x !== t)); draw(); } }, icon('x', 'ic-sm'))))),
        h('p', { class: 'field-hint' }, 'Remover daqui não tira a etiqueta das pregações que já a usam.')));
    }

    // ----- Backup -----
    const includeFiles = h('input', { type: 'checkbox', id: 'bk-files' });
    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const r = await importBackup(f);
        toast(`Backup importado: ${r.added} novas, ${r.updated} atualizadas${r.skipped ? `, ${r.skipped} já estavam em dia` : ''}.`, { duration: 5000 });
      } catch (err) { toast(err.message, { duration: 5000 }); }
    } });
    wrap.appendChild(group('Backup', 'download',
      h('p', { class: 'set-note' }, 'Suas pregações já ficam no Google Docs. O backup .json é uma segurança extra: guarde-o no Drive, no e-mail ou no computador.'),
      h('label', { class: 'check-line', for: 'bk-files' }, includeFiles, h('span', null, 'Incluir fotos e áudios no arquivo (fica maior)')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-soft', type: 'button', onclick: async () => {
          if (!state.sermons.length) { toast('Ainda não há pregações para exportar.'); return; }
          const r = await exportBackup({ includeFiles: includeFiles.checked });
          toast(`Backup exportado (${plural(r.count, 'pregação', 'pregações')}).`);
        } }, icon('download'), 'Exportar'),
        h('button', { class: 'btn btn-soft', type: 'button', onclick: () => fileIn.click() }, icon('upload'), 'Importar')),
      fileIn));

    // ----- Armazenamento -----
    const usage = h('small', null, 'Calculando…');
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => { usage.textContent = `${fmtBytes(e.usage)} usados neste aparelho`; }).catch(() => { usage.textContent = ''; });
    } else usage.textContent = '';
    const uploaded = state.sermons.flatMap((s) => (s.attachments || []).filter((a) => a.driveId));
    wrap.appendChild(group('Armazenamento', 'phone',
      h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('b', null, 'Neste aparelho'), usage)),
      uploaded.length ? row('Liberar espaço', 'Apaga do aparelho as fotos e áudios que já estão no seu Drive',
        h('button', { class: 'btn btn-soft sm', type: 'button', onclick: async () => {
          const ok = await confirmSheet('Liberar espaço?', 'Os anexos já enviados ao Google Drive serão apagados deste aparelho. Eles continuam no Drive e no documento.', { ok: 'Liberar' });
          if (!ok) return;
          let n = 0;
          for (const a of uploaded) { const b = await blobs.get(a.id); if (b) { await blobs.del(a.id); n++; } }
          toast(n ? `${plural(n, 'anexo apagado', 'anexos apagados')} do aparelho.` : 'Nada para liberar.');
          draw();
        } }, 'Liberar')) : null));

    // ----- Instalar -----
    if (!isStandalone()) {
      wrap.appendChild(group('Instalar no celular', 'phone',
        state.installPrompt
          ? h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => promptInstall() }, icon('download'), 'Instalar o Selah')
          : isIOS()
            ? h('ol', { class: 'steps' }, h('li', null, 'Abra este site no Safari.'), h('li', null, 'Toque em Compartilhar (quadrado com seta).'), h('li', null, 'Escolha “Adicionar à Tela de Início”.'))
            : h('ol', { class: 'steps' }, h('li', null, 'Abra este site no Chrome.'), h('li', null, 'Toque no menu ⋮ (três pontinhos).'), h('li', null, 'Escolha “Adicionar à tela inicial” ou “Instalar app”.'))));
    }

    // ----- Sobre -----
    wrap.appendChild(group('Sobre', 'info',
      h('p', { class: 'set-note' }, h('b', null, 'Selah'), ' (“pausa para refletir”) – registre e lembre as pregações que você ouve. Versão ', APP_VERSION, '.'),
      h('p', { class: 'set-note' }, 'Suas anotações ficam neste aparelho e na sua conta Google. Nada é enviado para outro servidor.'),
      state.settings.lastSyncAt ? h('p', { class: 'field-hint' }, `Última sincronização ${timeAgo(state.settings.lastSyncAt)}`) : null,
      h('a', { class: 'btn btn-ghost btn-block', href: 'https://github.com/Danielfps/selah-pregacoes#readme', target: '_blank', rel: 'noopener' }, icon('external'), 'Ajuda e código-fonte')));
  }
  draw();
  const offs = [on('auth', draw), on('queue', draw), on('sync', draw), on('install', draw)];
  return () => offs.forEach((f) => f());
}
