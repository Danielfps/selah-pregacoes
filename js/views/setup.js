// Tela exibida quando o GOOGLE_CLIENT_ID (config.js) ainda está vazio.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { setSetting } from '../store.js';
import { refreshAuthState } from '../sync.js';
import { login } from '../auth.js';
import { toast } from '../util.js';
import { topBar } from '../components.js';
import * as G from '../google.js';

function pasteCard() {
  const input = h('input', { class: 'input', type: 'text', placeholder: '1234567890-abc.apps.googleusercontent.com', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'ID do cliente OAuth', value: G.hasConfigFileId() ? '' : G.clientId() });
  const connect = () => login();
  return h('section', { class: 'card set-card' },
    h('h2', { class: 'card-h' }, icon('doc'), 'Conectar ao Google Docs'),
    G.hasConfigFileId() ? null : h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Cole aqui o ID do cliente'),
      h('p', { class: 'field-hint' }, 'Sem precisar mexer no GitHub. Fica salvo só neste aparelho.'),
      input,
      h('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: async () => {
        const v = input.value.trim();
        if (!G.isValidClientId(v)) { toast('Esse não parece um ID válido (termina com .apps.googleusercontent.com).'); return; }
        G.setClientId(v);
        refreshAuthState();
        G.prepare().catch(() => {});
        toast('ID salvo ✓ Agora toque em “Conectar ao Google Docs”.');
        location.hash = '#/configurar-google?ok=' + Date.now();
      } }, icon('check'), 'Salvar ID')),
    G.isConfigured() ? h('button', { class: 'btn btn-google btn-block', type: 'button', onclick: connect }, h('span', { class: 'g-logo', 'aria-hidden': 'true' }, 'G'), 'Conectar ao Google Docs') : null);
}

export function renderSetup(root) {
  const origin = location.origin;
  const appUrl = location.origin + location.pathname;
  const configured = G.isConfigured();
  root.appendChild(h('div', { class: 'view view-setup' },
    topBar({ title: 'Configurar o Google', back: () => { location.hash = '#/'; } }),
    h('section', { class: 'card setup-hero' },
      h('div', { class: 'setup-badge', 'aria-hidden': 'true' }, icon(configured ? 'check' : 'key')),
      h('h1', null, configured ? 'Google configurado ✓' : 'Falta configurar o Google'),
      h('p', null, configured
        ? 'Tudo pronto. Toque em “Conectar ao Google Docs” abaixo: a partir daí, cada pregação salva vira um documento no seu Drive automaticamente.'
        : 'Para salvar as pregações no seu Google Docs, o app precisa de um “ID do cliente OAuth”. É grátis e leva uns 10 minutos. Enquanto isso, você já pode usar o Selah: tudo fica salvo neste aparelho e vai para o Docs depois.')),
    pasteCard(),
    h('section', { class: 'card set-card' },
      h('h2', { class: 'card-h' }, icon('info'), 'Passo a passo'),
      h('ol', { class: 'steps' },
        h('li', null, 'Acesse ', h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'console.cloud.google.com'), ' e crie um projeto (ex.: “Selah”).'),
        h('li', null, 'Em “APIs e serviços › Biblioteca”, ative a ', h('b', null, 'Google Drive API'), ' e a ', h('b', null, 'Google Docs API'), '.'),
        h('li', null, 'Em “Tela de consentimento OAuth” (Google Auth Platform), escolha “Externo”, preencha nome e e-mail e adicione seu e-mail como ', h('b', null, 'usuário de teste'), '.'),
        h('li', null, 'Em “Credenciais › Criar credenciais › ID do cliente OAuth”, escolha ', h('b', null, 'Aplicativo da Web'), '.'),
        h('li', null, 'Em “Origens JavaScript autorizadas”, adicione: ', h('code', null, origin)),
        h('li', null, 'Em “URIs de redirecionamento autorizados”, adicione: ', h('code', null, appUrl)),
        h('li', null, 'Copie o ID (termina com .apps.googleusercontent.com), cole no campo acima e toque em “Salvar ID”. (Ou, se preferir, coloque no arquivo ', h('code', null, 'config.js'), ' do repositório.)'),
        h('li', null, 'Toque em “Conectar ao Google Docs”. Pronto: cada pregação salva vira um documento no seu Drive.')),
      h('p', { class: 'field-hint' }, 'O passo a passo detalhado está no README do repositório.')),
    h('div', { class: 'setup-actions' },
      h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: async () => { await setSetting('setupSeen', true); location.hash = '#/'; } },
        configured ? 'Voltar' : 'Usar só neste aparelho por enquanto', icon('arrowRight')),
      h('a', { class: 'btn btn-ghost btn-block', href: 'https://github.com/Danielfps/selah-pregacoes#como-configurar-o-google', target: '_blank', rel: 'noopener' }, icon('external'), 'Abrir o README'))
  ));
  return () => {};
}
