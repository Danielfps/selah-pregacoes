// Login com o Google (Google Identity Services, fluxo de token) e chamadas às APIs do Drive e do Docs.
// Escopo único: drive.file → o app só enxerga os arquivos que ele mesmo criou.
import { GOOGLE_CLIENT_ID } from '../config.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'selah.token';
const OAUTH_STATE_KEY = 'selah.oauthState';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1/documents';

export class AuthError extends Error { constructor(m) { super(m || 'Sua conexão com o Google expirou.'); this.name = 'AuthError'; } }
export class NetError extends Error { constructor(m) { super(m || 'Sem conexão com a internet.'); this.name = 'NetError'; } }

export function clientId() { return typeof GOOGLE_CLIENT_ID === 'string' ? GOOGLE_CLIENT_ID.trim() : ''; }
export function isConfigured() { return clientId().length > 0; }

// ---------- Token ----------
let token = null; // { access_token, expires_at }
try { token = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (_) { token = null; }

function setToken(access_token, expires_in) {
  token = { access_token, expires_at: Date.now() + (Number(expires_in) || 3600) * 1000 };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch (_) { /* modo privado */ }
}
export function clearToken() {
  token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (_) { /* ignore */ }
}
/** Token válido (com folga de 1 min) ou null. */
export function getToken() {
  if (token && token.access_token && Date.now() < token.expires_at - 60_000) return token.access_token;
  return null;
}
export function tokenExpiresAt() { return token ? token.expires_at : 0; }

// ---------- Google Identity Services ----------
let gisPromise = null;
let tokenClient = null;
let pending = null;

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; s.remove(); reject(new NetError('Não foi possível carregar o login do Google. Verifique a internet.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

const GIS_ERRORS = {
  popup_failed_to_open: 'O navegador bloqueou a janela de login. Permita pop-ups ou use "Entrar pelo navegador".',
  popup_closed: 'A janela de login foi fechada antes de terminar.',
  unknown: 'Não foi possível entrar com o Google.',
};

/** Carrega o GIS e prepara o cliente de token (chame cedo, para o clique abrir o pop-up na hora). */
export async function prepare() {
  if (!isConfigured()) return false;
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: (resp) => {
        const p = pending; pending = null;
        if (!p) return;
        if (resp.error) { p.reject(new Error(resp.error_description || resp.error)); return; }
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
          p.reject(new Error('Para salvar no Google Docs, marque a permissão de acesso aos arquivos do Drive criados pelo Selah.'));
          return;
        }
        setToken(resp.access_token, resp.expires_in);
        p.resolve(resp.access_token);
      },
      error_callback: (err) => {
        const p = pending; pending = null;
        if (!p) return;
        const e = new Error(GIS_ERRORS[err && err.type] || GIS_ERRORS.unknown);
        e.type = err && err.type;
        p.reject(e);
      },
    });
  }
  return true;
}

/** Abre o login do Google (pop-up). Deve ser chamado direto de um toque do usuário. */
export function signIn({ hint, prompt = '' } = {}) {
  if (!isConfigured()) return Promise.reject(new Error('O Google ainda não foi configurado (config.js).'));
  const go = () => new Promise((resolve, reject) => {
    pending = { resolve, reject };
    const opts = { prompt };
    if (hint) opts.login_hint = hint;
    tokenClient.requestAccessToken(opts);
  });
  if (tokenClient) return go();
  return prepare().then(go);
}

/** Alternativa sem pop-up (útil no iPhone com o app instalado): redireciona para o Google e volta. */
export function signInRedirect(returnHash) {
  const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ state: st, returnHash: returnHash || '#/' })); } catch (_) { /* ignore */ }
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: st,
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}
export function redirectUri() { return location.origin + location.pathname; }

/** Se a página voltou do login por redirecionamento, guarda o token. Retorna { ok, returnHash, error } ou null. */
export function handleRedirectResult() {
  const hash = location.hash || '';
  if (!/access_token=|error=/.test(hash) || !/state=/.test(hash)) return null;
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(OAUTH_STATE_KEY) || 'null'); } catch (_) { saved = null; }
  try { localStorage.removeItem(OAUTH_STATE_KEY); } catch (_) { /* ignore */ }
  const returnHash = (saved && saved.returnHash) || '#/';
  history.replaceState(null, '', location.pathname + location.search + returnHash);
  if (!saved || saved.state !== params.get('state')) return { ok: false, returnHash, error: 'Resposta de login inválida. Tente de novo.' };
  if (params.get('error')) return { ok: false, returnHash, error: 'Login cancelado.' };
  const granted = (params.get('scope') || '').split(' ');
  if (!granted.includes(SCOPE)) return { ok: false, returnHash, error: 'Permissão do Google Drive não concedida.' };
  setToken(params.get('access_token'), params.get('expires_in'));
  return { ok: true, returnHash };
}

export async function signOut() {
  const t = token && token.access_token;
  clearToken();
  if (t && window.google && window.google.accounts && window.google.accounts.oauth2) {
    try { window.google.accounts.oauth2.revoke(t, () => {}); } catch (_) { /* ignore */ }
  }
}

// ---------- Requisições ----------
async function gfetch(url, opts = {}) {
  const t = getToken();
  if (!t) throw new AuthError();
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  } catch (_) {
    throw new NetError();
  }
  if (res.status === 401) { clearToken(); throw new AuthError(); }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && (j.error.message || j.error)) || ''; } catch (_) { /* ignore */ }
    const err = new Error(friendly(res.status, msg));
    err.status = res.status;
    err.raw = msg;
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

function friendly(status, msg) {
  if (status === 403 && /rate|quota/i.test(msg)) return 'O Google pediu uma pausa (limite de uso). Tente de novo em instantes.';
  if (status === 403 && /has not been used|disabled/i.test(msg)) return 'A API do Google Drive ou do Docs não está ativada no projeto do Google Cloud.';
  if (status === 403) return 'O Google recusou o acesso (403). ' + (msg || '');
  if (status === 404) return 'Arquivo não encontrado no Google Drive.';
  if (status === 429) return 'Muitas requisições ao Google. Tente de novo em instantes.';
  if (status >= 500) return 'O Google está instável agora. Tente de novo em instantes.';
  return msg || `Erro ${status} do Google.`;
}

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------- Drive ----------
export function about() {
  return gfetch(`${DRIVE}/about?fields=user(displayName,emailAddress,photoLink)`);
}

export function getFile(id, fields = 'id,name,trashed,webViewLink') {
  return gfetch(`${DRIVE}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`);
}

export async function findOrCreateFolder(name, parentId) {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${q(name)}' and trashed=false`;
  if (parentId) query += ` and '${q(parentId)}' in parents`;
  const params = new URLSearchParams({ q: query, fields: 'files(id,name)', spaces: 'drive', pageSize: '10' });
  const list = await gfetch(`${DRIVE}/files?${params}`);
  if (list.files && list.files.length) return list.files[0].id;
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const f = await gfetch(`${DRIVE}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return f.id;
}

export function createDoc(name, folderId) {
  return gfetch(`${DRIVE}/files?fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document', parents: [folderId] }),
  });
}

export function renameFile(id, name) {
  return gfetch(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
}

export async function trashFile(id) {
  try {
    await gfetch(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    });
  } catch (e) {
    if (e.status !== 404) throw e;
  }
}

/** Envio "resumable" (funciona para fotos e para áudios longos). */
export async function uploadFile(blob, name, mime, folderId) {
  const t = getToken();
  if (!t) throw new AuthError();
  const type = mime || blob.type || 'application/octet-stream';
  let start;
  try {
    start = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + t,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': type,
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify({ name, parents: [folderId], mimeType: type }),
    });
  } catch (_) { throw new NetError(); }
  if (start.status === 401) { clearToken(); throw new AuthError(); }
  if (!start.ok) { const err = new Error(friendly(start.status, '')); err.status = start.status; throw err; }
  const location = start.headers.get('Location') || start.headers.get('location');
  if (!location) return uploadMultipart(blob, name, type, folderId);
  let res;
  try {
    res = await fetch(location, { method: 'PUT', headers: { 'Content-Type': type }, body: blob });
  } catch (_) { throw new NetError(); }
  if (!res.ok) { const err = new Error(friendly(res.status, '')); err.status = res.status; throw err; }
  return res.json();
}

async function uploadMultipart(blob, name, type, folderId) {
  const boundary = 'selah' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: type });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`, blob, `\r\n--${boundary}--`,
  ]);
  return gfetch(`${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
}

export function folderUrl(id) { return `https://drive.google.com/drive/folders/${id}`; }
export function docUrl(id) { return `https://docs.google.com/document/d/${id}/edit`; }

// ---------- Docs ----------
export function getDoc(id) {
  return gfetch(`${DOCS}/${encodeURIComponent(id)}?fields=${encodeURIComponent('body(content(endIndex))')}`);
}

export function batchUpdate(id, requests) {
  return gfetch(`${DOCS}/${encodeURIComponent(id)}:batchUpdate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }),
  });
}
