// Tela exibida quando o GOOGLE_CLIENT_ID (config.js) ainda está vazio.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { setSetting } from '../store.js';
import { topBar } from '../components.js';
import * as G from '../google.js';

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
        ? 'O ID do cliente já está no config.js. Entre com o Google nas Configurações.'
        : 'Para salvar as pregações no seu Google Docs, o app precisa de um “ID do cliente OAuth”. É grátis e leva uns 10 minutos. Enquanto isso, você já pode usar o Selah: tudo fica salvo neste aparelho e vai para o Docs depois.')),
    h('section', { class: 'card set-card' },
      h('h2', { class: 'card-h' }, icon('info'), 'Passo a passo'),
      h('ol', { class: 'steps' },
        h('li', null, 'Acesse ', h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'console.cloud.google.com'), ' e crie um projeto (ex.: “Selah”).'),
        h('li', null, 'Em “APIs e serviços › Biblioteca”, ative a ', h('b', null, 'Google Drive API'), ' e a ', h('b', null, 'Google Docs API'), '.'),
        h('li', null, 'Em “Tela de consentimento OAuth” (Google Auth Platform), escolha “Externo”, preencha nome e e-mail e adicione seu e-mail como ', h('b', null, 'usuário de teste'), '.'),
        h('li', null, 'Em “Credenciais › Criar credenciais › ID do cliente OAuth”, escolha ', h('b', null, 'Aplicativo da Web'), '.'),
        h('li', null, 'Em “Origens JavaScript autorizadas”, adicione: ', h('code', null, origin)),
        h('li', null, 'Em “URIs de redirecionamento autorizados”, adicione: ', h('code', null, appUrl)),
        h('li', null, 'Copie o ID (termina com .apps.googleusercontent.com) e cole no arquivo ', h('code', null, 'config.js'), ' do repositório, em ', h('code', null, 'GOOGLE_CLIENT_ID'), '.'),
        h('li', null, 'Salve (commit). Em 1–2 minutos o site é atualizado. Depois, abra Configurações › Entrar com o Google.')),
      h('p', { class: 'field-hint' }, 'O passo a passo detalhado está no README do repositório.')),
    h('div', { class: 'setup-actions' },
      h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: async () => { await setSetting('setupSeen', true); location.hash = '#/'; } },
        configured ? 'Voltar' : 'Usar só neste aparelho por enquanto', icon('arrowRight')),
      h('a', { class: 'btn btn-ghost btn-block', href: 'https://github.com/Danielfps/selah-pregacoes#como-configurar-o-google', target: '_blank', rel: 'noopener' }, icon('external'), 'Abrir o README'))
  ));
  return () => {};
}
