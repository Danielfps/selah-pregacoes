# Selah ⏸ – pausa para refletir

**Selah** é um app web progressivo (PWA) para **registrar e lembrar as pregações** que você ouve.
Ele é pensado primeiro para o celular, pode ser instalado na tela inicial e funciona sem internet.
Cada pregação vira um **documento do Google Docs** na sua conta Google, bem formatado.

👉 **App online:** https://danielfps.github.io/selah-pregacoes/

> **Privacidade:** este repositório contém **só o código**. As anotações nunca vêm para o GitHub:
> ficam no seu aparelho (cache) e na **sua** conta Google, como documentos do Google Docs.
> O app usa apenas o escopo `drive.file`, ou seja, só enxerga os arquivos que ele mesmo criou.

---

## O que o Selah faz

- **Modo culto** (rápido): só o essencial para anotar durante a mensagem.
- **Modo revisão** (em casa): todas as perguntas de reflexão, em etapas com barra de progresso.
- **Salvamento automático** a cada alteração (rascunho no aparelho).
- **Google Docs:** cria a pasta **“Selah – Pregações”** no seu Drive e um documento por pregação,
  com o nome `AAAA-MM-DD – Título – Pregador`. Ao editar, o **mesmo documento** é atualizado.
- **Fotos e áudios** (gravação pelo próprio app) vão para a subpasta **“Anexos”**, com link no documento.
- **Offline:** tudo fica guardado no aparelho e é enviado ao Google Docs quando a internet volta.
  Cada cartão mostra: “Salvo no Docs ✓”, “Aguardando internet” ou “Erro – tocar para tentar de novo”.
- Etiquetas, favoritos, busca (pregador, livro, etiqueta, palavra-chave) e filtros.
- Compartilhar um resumo bonito pelo WhatsApp (ou copiar o texto).
- **Lembrete de aplicação:** alguns dias depois, “Você colocou em prática o que ouviu?”
  (notificação quando o navegador permite e cartão na tela inicial).
- **Relembre:** toda semana, uma pregação antiga sorteada com a frase marcante.
- **Estatísticas:** total, livros mais pregados, pregadores mais ouvidos, etiquetas, sequência de semanas e % de aplicações feitas.
- Tema claro/escuro e backup `.json` (exportar/importar).

---

## Como configurar o Google

O app precisa de um **ID do cliente OAuth** (grátis). Leva uns 10 minutos e é feito uma única vez.
Enquanto não estiver configurado, o Selah funciona normalmente, mas salva só no aparelho.

1. **Crie um projeto** em <https://console.cloud.google.com/projectcreate> (ex.: nome “Selah”).
2. **Ative as APIs.** No menu, vá em **APIs e serviços › Biblioteca** e ative:
   - **Google Drive API**
   - **Google Docs API**
3. **Configure a tela de consentimento.** Vá em **APIs e serviços › Tela de consentimento OAuth**
   (em algumas contas aparece como **Google Auth Platform**):
   - Tipo de usuário: **Externo**.
   - Preencha o nome do app (“Selah”) e seu e-mail.
   - Em **Público-alvo / Usuários de teste**, adicione o **seu e-mail do Google** (e de quem mais for usar).
4. **Crie o ID do cliente.** Vá em **APIs e serviços › Credenciais › Criar credenciais › ID do cliente OAuth**
   (ou **Google Auth Platform › Clientes › Criar cliente**):
   - Tipo de aplicativo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://danielfps.github.io`
   - **URIs de redirecionamento autorizados:** `https://danielfps.github.io/selah-pregacoes/`
     (é usado no login alternativo “Entrar pelo navegador”, útil no iPhone).
   - Clique em **Criar** e copie o **ID do cliente** (termina com `.apps.googleusercontent.com`).
5. **Cole o ID no `config.js`.** Aqui no GitHub, abra o arquivo [`config.js`](config.js), toque no lápis (✏️ *Edit*) e deixe assim:
   ```js
   export const GOOGLE_CLIENT_ID = "1234567890-abc123.apps.googleusercontent.com";
   ```
   Depois clique em **Commit changes**. Em 1–2 minutos o site é atualizado.
6. Abra o app › **Ajustes** › **Entrar com o Google** e autorize.
   Na primeira sincronização o Selah cria a pasta “Selah – Pregações” no seu Drive.

> O ID do cliente **não é segredo** (ele aparece no navegador de qualquer forma), por isso pode ficar no repositório público.
> Não existe “chave secreta” neste app: o login é feito direto entre o seu navegador e o Google.

**Dúvidas comuns**

- *“Acesso bloqueado: o app não concluiu a verificação”* → confira se o seu e-mail está na lista de **usuários de teste**.
- *“redirect_uri_mismatch” / “origin_mismatch”* → confira os endereços do passo 4 (sem barra no fim da origem; com barra no fim do redirecionamento).
- *Pop-up bloqueado* → permita pop-ups para o site ou use “Entrar pelo navegador (sem pop-up)”.
- A conexão com o Google dura cerca de 1 hora. Quando expira e há algo para enviar, o app mostra um aviso
  **“Entrar de novo”** – nada do que você digitou é perdido.

---

## Como instalar no celular

### Android (Chrome)
1. Abra **https://danielfps.github.io/selah-pregacoes/** no **Chrome**.
2. Toque no menu **⋮** (três pontinhos, no canto superior direito).
3. Toque em **“Adicionar à tela inicial”** (ou **“Instalar app”**) e confirme.
4. O ícone do Selah aparece na tela inicial. Abra por ele: o app funciona até sem internet.

### iPhone (Safari)
1. Abra **https://danielfps.github.io/selah-pregacoes/** no **Safari**.
2. Toque no botão **Compartilhar** (quadrado com uma seta para cima).
3. Role e toque em **“Adicionar à Tela de Início”**, depois em **Adicionar**.
4. Abra o Selah pelo ícone. (Notificações no iPhone exigem iOS 16.4+ e o app instalado na Tela de Início.)

---

## Como fazer backup

Suas pregações já ficam no Google Docs, mas você pode ter uma cópia extra:

1. Abra **Ajustes › Backup › Exportar**. Um arquivo `selah-backup-AAAA-MM-DD.json` é baixado.
   - Marque **“Incluir fotos e áudios”** se quiser os anexos dentro do arquivo (fica maior).
2. Guarde o arquivo no Drive, no e-mail ou no computador.
3. Para restaurar (em outro celular, por exemplo): **Ajustes › Backup › Importar** e escolha o arquivo.
   O Selah mantém a versão mais recente de cada pregação e não duplica nada.

---

## Como o app funciona (técnico)

- HTML, CSS e JavaScript puros (módulos ES), **sem build**, com caminhos relativos – roda direto no GitHub Pages.
- `manifest.json` + `sw.js` (service worker) com cache offline do app.
- **IndexedDB** guarda as pregações, os anexos e a **fila de sincronização**.
- Login: **Google Identity Services** (fluxo de token no navegador, sem servidor), escopo `https://www.googleapis.com/auth/drive.file`.
- Documento montado com a **Google Docs API** (`documents.batchUpdate`): título, linha com pregador/data/local/texto base,
  seções em *Título 2*, perguntas em negrito com a resposta embaixo, frase marcante destacada em lima.
  Perguntas sem resposta não aparecem. O ID do documento fica salvo para atualizar sempre o mesmo arquivo.

```
index.html          página única do app
config.js           GOOGLE_CLIENT_ID (preencha aqui)
manifest.json       dados do PWA (nome, ícones, cores)
sw.js               service worker (offline, notificações)
css/app.css         estilos (paleta, claro/escuro)
js/app.js           inicialização e rotas
js/views/           telas: início, editor, detalhe, estatísticas, ajustes
js/google.js        login e APIs do Drive/Docs
js/docbuilder.js    monta o documento do Google Docs
js/sync.js          fila de sincronização
js/db.js            IndexedDB
fonts/, icons/      fontes (Space Grotesk e Inter, licença OFL) e ícones
```

### Rodar no computador

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```
Para testar o login localmente, adicione também `http://localhost:8080` nas origens autorizadas do ID do cliente.

Ao publicar uma nova versão do código, aumente `VERSION` em `sw.js` (e `APP_VERSION` em `js/platform.js`)
para que os celulares baixem a atualização (o app mostra “Nova versão disponível – Atualizar”).
Alterar só o `config.js` não precisa disso.

### GitHub Pages

O site é publicado pelo GitHub Pages a partir do branch **`gh-pages`**.
Você não precisa mexer nele: a cada commit no branch principal, o workflow
[`.github/workflows/publicar.yml`](.github/workflows/publicar.yml) copia o código para o `gh-pages`
e o site se atualiza em 1–2 minutos (acompanhe na aba **Actions**).

Se algum dia o site sair do ar: **Settings › Pages › Build and deployment › Source: Deploy from a branch**,
escolha o branch **`gh-pages`** e a pasta **/ (root)** e salve.

---

Fontes: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) e [Inter](https://fonts.google.com/specimen/Inter), sob a SIL Open Font License.
