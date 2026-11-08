// Estrutura das perguntas, livros da Bíblia, tipos de culto e etiquetas.

/** Os 66 livros da Bíblia com o número de capítulos. */
export const BIBLE = [
  // Antigo Testamento
  ['Gênesis', 50], ['Êxodo', 40], ['Levítico', 27], ['Números', 36], ['Deuteronômio', 34],
  ['Josué', 24], ['Juízes', 21], ['Rute', 4], ['1 Samuel', 31], ['2 Samuel', 24],
  ['1 Reis', 22], ['2 Reis', 25], ['1 Crônicas', 29], ['2 Crônicas', 36], ['Esdras', 10],
  ['Neemias', 13], ['Ester', 10], ['Jó', 42], ['Salmos', 150], ['Provérbios', 31],
  ['Eclesiastes', 12], ['Cânticos', 8], ['Isaías', 66], ['Jeremias', 52], ['Lamentações', 5],
  ['Ezequiel', 48], ['Daniel', 12], ['Oseias', 14], ['Joel', 3], ['Amós', 9],
  ['Obadias', 1], ['Jonas', 4], ['Miqueias', 7], ['Naum', 3], ['Habacuque', 3],
  ['Sofonias', 3], ['Ageu', 2], ['Zacarias', 14], ['Malaquias', 4],
  // Novo Testamento
  ['Mateus', 28], ['Marcos', 16], ['Lucas', 24], ['João', 21], ['Atos', 28],
  ['Romanos', 16], ['1 Coríntios', 16], ['2 Coríntios', 13], ['Gálatas', 6], ['Efésios', 6],
  ['Filipenses', 4], ['Colossenses', 4], ['1 Tessalonicenses', 5], ['2 Tessalonicenses', 3], ['1 Timóteo', 6],
  ['2 Timóteo', 4], ['Tito', 3], ['Filemom', 1], ['Hebreus', 13], ['Tiago', 5],
  ['1 Pedro', 5], ['2 Pedro', 3], ['1 João', 5], ['2 João', 1], ['3 João', 1],
  ['Judas', 1], ['Apocalipse', 22],
].map(([name, chapters], i) => ({ name, chapters, testament: i < 39 ? 'AT' : 'NT' }));

export function bookByName(name) { return BIBLE.find((b) => b.name === name); }

/** "João 3:16-18" a partir de { book, chapter, verses }. */
export function refLabel(ref) {
  if (!ref || !ref.book) return '';
  let s = ref.book;
  if (ref.chapter) s += ' ' + ref.chapter;
  if (ref.chapter && ref.verses) s += ':' + String(ref.verses).trim();
  return s;
}

export const SERMON_TYPES = [
  { id: 'domingo', label: 'Culto de domingo' },
  { id: 'celula', label: 'Célula' },
  { id: 'congresso', label: 'Congresso' },
  { id: 'online', label: 'Online' },
  { id: 'outro', label: 'Outro' },
];
export function typeLabel(id) { return (SERMON_TYPES.find((t) => t.id === id) || {}).label || ''; }

export const DEFAULT_TAGS = [
  'fé', 'família', 'finanças', 'perdão', 'ansiedade', 'oração', 'graça', 'esperança',
  'propósito', 'santidade', 'amor', 'relacionamentos', 'trabalho', 'cura', 'adoração',
  'Espírito Santo', 'missões', 'identidade', 'gratidão', 'obediência',
];

/**
 * Seções e perguntas. Tipos:
 *  - text (padrão): resposta livre
 *  - points: lista de pontos principais
 *  - practice: itens "colocar em prática" com caixa "Feito"
 *  - link: resposta livre + vínculo com outras pregações
 * culto: true → aparece (e é essencial) no Modo culto.
 */
export const SECTIONS = [
  {
    id: 'entendendo', title: 'Entendendo a mensagem', short: 'Mensagem', emoji: '💡',
    questions: [
      { id: 'tema', q: 'Qual foi o tema central da pregação?' },
      { id: 'resumo', q: 'Se tivesse que resumir em uma frase, qual seria?', culto: true, placeholder: 'Em uma frase…' },
      { id: 'problema', q: 'Qual problema ou necessidade a mensagem tratou?' },
      { id: 'publico', q: 'Para quem a mensagem parecia direcionada?' },
    ],
  },
  {
    id: 'palavra', title: 'A Palavra', short: 'Palavra', emoji: '📖',
    questions: [
      { id: 'contexto', q: 'Qual o contexto do texto (quem escreveu, para quem, o que acontecia)?' },
      { id: 'personagem', q: 'Qual personagem bíblico apareceu?' },
      { id: 'original', q: 'Alguma palavra no original (hebraico/grego) foi explicada?' },
    ],
  },
  {
    id: 'pontos', title: 'Os pontos da pregação', short: 'Pontos', emoji: '📌',
    questions: [
      { id: 'points', q: 'Pontos principais', type: 'points', culto: true },
      { id: 'pontoMarcante', q: 'Qual ponto mais falou com você? Por quê?' },
      { id: 'ilustracao', q: 'Alguma comparação ou ilustração? Qual?' },
      { id: 'historia', q: 'Alguma história ou testemunho contado?' },
      { id: 'frase', q: 'Frase mais marcante', culto: true, highlight: true, placeholder: '“…”' },
    ],
  },
  {
    id: 'ensinamentos', title: 'Ensinamentos', short: 'Ensinamentos', emoji: '🌱',
    questions: [
      { id: 'sobreDeus', q: 'O que a mensagem ensina sobre Deus?' },
      { id: 'comoViver', q: 'O que ensina sobre como devo viver?' },
      { id: 'alerta', q: 'Houve algum alerta ou exortação?' },
      { id: 'promessa', q: 'Alguma promessa de Deus mencionada?' },
      { id: 'novidade', q: 'Algo que você nunca tinha percebido nesse texto?' },
    ],
  },
  {
    id: 'reflexao', title: 'Reflexão final', short: 'Reflexão', emoji: '🪞',
    questions: [
      { id: 'duvida', q: 'Concordou com tudo ou ficou alguma dúvida?' },
      { id: 'conexao', q: 'Essa mensagem se conecta com alguma pregação anterior?', type: 'link' },
      { id: 'amigo', q: 'Se fosse contar para um amigo, o que diria primeiro?' },
    ],
  },
  {
    id: 'aplicacao', title: 'Aplicação pessoal', short: 'Aplicação', emoji: '🔥',
    questions: [
      { id: 'deusFalou', q: 'O que Deus falou comigo?' },
      { id: 'practice', q: 'O que vou colocar em prática nesta semana?', type: 'practice' },
      { id: 'oracao', q: 'Pedido de oração ligado à mensagem' },
      { id: 'pesquisar', q: 'Dúvidas para pesquisar ou perguntar ao pastor' },
    ],
  },
];

/** Todas as perguntas de texto livre (ids das respostas). */
export const TEXT_QUESTION_IDS = SECTIONS.flatMap((s) => s.questions.filter((q) => !q.type || q.type === 'link').map((q) => q.id));

/** Cria uma pregação vazia. */
export function emptySermon(id, mode, dateTime) {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    dateTime,
    place: '',
    type: 'domingo',
    preacher: '',
    title: '',
    baseText: { book: '', chapter: '', verses: '' },
    supportVerses: [],
    answers: {},
    points: [],
    practice: [],
    linkedIds: [],
    tags: [],
    favorite: false,
    attachments: [],
    mode: mode || 'culto',
    draft: true,
    docId: null,
    docUrl: null,
    syncStatus: 'pending',
    syncError: null,
    syncedAt: null,
    reminder: null,
  };
}

/** A pregação ainda está "em branco" (pode ser descartada)? */
export function isBlank(s) {
  if (!s) return true;
  if (s.title || s.preacher || s.place) return false;
  if (s.baseText && s.baseText.book) return false;
  if ((s.supportVerses || []).length || (s.points || []).some((p) => p.trim()) || (s.practice || []).length) return false;
  if ((s.attachments || []).length || (s.tags || []).length || (s.linkedIds || []).length) return false;
  if (Object.values(s.answers || {}).some((v) => String(v || '').trim())) return false;
  return true;
}

/** Campos essenciais do Modo culto que estão faltando (rótulos). */
export function missingEssentials(s) {
  const miss = [];
  if (!s.place.trim()) miss.push('Igreja/local');
  if (!s.preacher.trim()) miss.push('Quem pregou');
  if (!s.title.trim()) miss.push('Título');
  if (!s.baseText.book) miss.push('Texto base');
  if (!String(s.answers.resumo || '').trim()) miss.push('Resumo em uma frase');
  if (!(s.points || []).some((p) => p.trim())) miss.push('Pontos principais');
  if (!String(s.answers.frase || '').trim()) miss.push('Frase marcante');
  return miss;
}

/** Texto plano com tudo da pregação, para a busca por palavra-chave. */
export function searchBlob(s) {
  return [
    s.title, s.preacher, s.place, refLabel(s.baseText),
    ...(s.supportVerses || []).map(refLabel),
    ...(s.tags || []),
    ...(s.points || []),
    ...(s.practice || []).map((p) => p.text),
    ...Object.values(s.answers || {}),
  ].join(' \n ');
}
