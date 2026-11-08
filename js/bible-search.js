// Busca de livros da Bíblia tolerante a erros: sem acento, abreviações, erros de digitação
// e referência completa ("jo 3 16", "1co13:4-7", "salmo 23").
import { BIBLE } from './schema.js';

/** Remove acentos, deixa minúsculo e padroniza "primeira/I/1ª" → "1". */
export function normBook(s) {
  let t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  t = t.replace(/[º°ª.]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(primeir[oa]|i)\s+/, '1 ').replace(/^(segund[oa]|ii)\s+/, '2 ').replace(/^(terceir[oa]|iii)\s+/, '3 ');
  t = t.replace(/^([123])\s*[ao]?\s+/, '$1 ').replace(/^([123])([a-z])/, '$1 $2');
  return t;
}
const compact = (s) => normBook(s).replace(/\s+/g, '');

// Abreviações e nomes alternativos (já sem acento).
const ALIASES = {
  'Gênesis': ['gn', 'gen'], 'Êxodo': ['ex', 'exo'], 'Levítico': ['lv', 'lev', 'leviticos'], 'Números': ['nm', 'num'],
  'Deuteronômio': ['dt', 'deut'], 'Josué': ['js', 'jos'], 'Juízes': ['jz', 'jui'], 'Rute': ['rt'],
  '1 Samuel': ['1sm', '1 sam'], '2 Samuel': ['2sm', '2 sam'], '1 Reis': ['1rs', '1re'], '2 Reis': ['2rs', '2re'],
  '1 Crônicas': ['1cr', '1 cro'], '2 Crônicas': ['2cr', '2 cro'], 'Esdras': ['ed', 'esd'], 'Neemias': ['ne', 'nee'],
  'Ester': ['et', 'est'], 'Jó': ['jo', 'job'], 'Salmos': ['sl', 'sal', 'salmo'], 'Provérbios': ['pv', 'pr', 'prov', 'proverbio'],
  'Eclesiastes': ['ec', 'ecl'], 'Cânticos': ['ct', 'cantares', 'cantico dos canticos', 'canticos dos canticos'],
  'Isaías': ['is', 'isa'], 'Jeremias': ['jr', 'jer'], 'Lamentações': ['lm', 'lam'], 'Ezequiel': ['ez', 'eze'],
  'Daniel': ['dn', 'dan'], 'Oseias': ['os', 'oseas'], 'Joel': ['jl'], 'Amós': ['am'], 'Obadias': ['ob', 'abdias'],
  'Jonas': ['jn'], 'Miqueias': ['mq', 'miq'], 'Naum': ['na'], 'Habacuque': ['hc', 'hab'], 'Sofonias': ['sf', 'sof'],
  'Ageu': ['ag'], 'Zacarias': ['zc', 'zac'], 'Malaquias': ['ml', 'mal'],
  'Mateus': ['mt', 'mat'], 'Marcos': ['mc', 'mar'], 'Lucas': ['lc', 'luc'], 'João': ['joao', 'jo evangelho'],
  'Atos': ['at', 'atos dos apostolos'], 'Romanos': ['rm', 'rom'], '1 Coríntios': ['1co', '1 cor'], '2 Coríntios': ['2co', '2 cor'],
  'Gálatas': ['gl', 'gal'], 'Efésios': ['ef', 'efe'], 'Filipenses': ['fp', 'fil'], 'Colossenses': ['cl', 'col'],
  '1 Tessalonicenses': ['1ts', '1 tes'], '2 Tessalonicenses': ['2ts', '2 tes'], '1 Timóteo': ['1tm', '1 tim'], '2 Timóteo': ['2tm', '2 tim'],
  'Tito': ['tt', 'tit'], 'Filemom': ['fm', 'filemon'], 'Hebreus': ['hb', 'heb'], 'Tiago': ['tg', 'tia'],
  '1 Pedro': ['1pe', '1 ped'], '2 Pedro': ['2pe', '2 ped'], '1 João': ['1jo', '1 joao'], '2 João': ['2jo', '2 joao'], '3 João': ['3jo', '3 joao'],
  'Judas': ['jd', 'jud'], 'Apocalipse': ['ap', 'apo', 'apoc', 'revelacao'],
};

const INDEX = BIBLE.map((b) => ({
  book: b,
  name: normBook(b.name),
  compactName: compact(b.name),
  aliases: (ALIASES[b.name] || []).map((a) => compact(a)),
}));

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function score(entry, q) {
  if (!q) return 0;
  const cq = q.replace(/\s+/g, '');
  if (entry.compactName === cq) return 1000;
  if (entry.aliases.includes(cq)) return 950;
  if (entry.compactName.startsWith(cq)) return 800 - (entry.compactName.length - cq.length);
  if (entry.aliases.some((a) => a.startsWith(cq) && cq.length >= 2)) return 700;
  if (entry.name.split(' ').some((w) => w.length > 1 && w.startsWith(q))) return 600;
  if (cq.length >= 3 && entry.compactName.includes(cq)) return 500;
  // Erros de digitação: compara com o começo do nome do mesmo tamanho (e com o nome inteiro).
  if (cq.length >= 3) {
    const tol = cq.length >= 7 ? 2 : 1;
    const dPrefix = lev(cq, entry.compactName.slice(0, cq.length));
    const dFull = lev(cq, entry.compactName);
    const d = Math.min(dPrefix, dFull);
    if (d <= tol) return 400 - d * 50;
    const dAlias = Math.min(...entry.aliases.map((a) => lev(cq, a)), 99);
    if (cq.length >= 4 && dAlias <= 1) return 300;
  }
  return 0;
}

/**
 * Interpreta o texto digitado. Retorna { query, chapter, verses } – query é a parte do livro.
 * Ex.: "jo 3:16-18" → { query: 'jo', chapter: 3, verses: '16-18' }
 */
export function parseRef(text) {
  const t = normBook(text);
  const m = t.match(/^((?:[123]\s?)?[a-z][a-z\s]*?)\s*(\d+)?(?:\s*[:.,\s]\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*[-–]\s*\d+)?)*))?\s*$/);
  if (!m) return { query: t, chapter: null, verses: '' };
  return { query: m[1].trim(), chapter: m[2] ? Number(m[2]) : null, verses: m[3] ? m[3].replace(/\s+/g, '').replace(/–/g, '-').replace(/;/g, ',') : '' };
}

/** Lista de livros ordenada pela relevância para o texto digitado. */
export function searchBooks(text, limit = 8) {
  const { query, chapter, verses } = parseRef(text);
  if (!query) return [];
  return INDEX
    .map((e) => ({ book: e.book, s: score(e, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || BIBLE.indexOf(a.book) - BIBLE.indexOf(b.book))
    .slice(0, limit)
    .map((x) => ({ book: x.book, chapter: chapter && chapter <= x.book.chapters ? chapter : null, verses: chapter && chapter <= x.book.chapters ? verses : '' }));
}
