// =====================================================================
//  api.js — Toda a conversa com o Supabase passa por aqui
// ---------------------------------------------------------------------
//  Por que um arquivo só para isso:
//
//  1. TEMPO E NOVAS TENTATIVAS. Cada chamada tem limite de tempo. Se a
//     rede falhar ou o servidor demorar demais, o app tenta de novo
//     sozinho (até 3 vezes). Isso é seguro mesmo para gravações, porque
//     toda gravação leva uma "chave" única: se o primeiro pedido tiver
//     chegado, o banco reconhece a repetição e não grava duas vezes.
//
//  2. ESTADO DA CONEXÃO. O menu mostra "Conectado", "Servidor lento" ou
//     "Sem conexão". Em vez de ficar carregando para sempre (o problema
//     da versão antiga), o app avisa o que está acontecendo.
//
//  3. MENSAGENS EM PORTUGUÊS. Erros técnicos viram frases claras.
// =====================================================================

import { SUPABASE_URL, SUPABASE_KEY, TEMPO_LENTO, TEMPO_LIMITE, TENTATIVAS } from './config.js';

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'spm-estoque-sessao' }
});

// ---------------------------------------------------------------------
// Estado da conexão (o menu se inscreve para ser avisado)
// ---------------------------------------------------------------------
const ouvintes = new Set();
let estadoConexao = navigator.onLine ? 'ok' : 'offline';
let emAndamento = 0;

export function aoMudarConexao(fn) { ouvintes.add(fn); fn(estadoConexao); }
function definirConexao(novo) {
  if (novo === estadoConexao) return;
  estadoConexao = novo;
  ouvintes.forEach(fn => fn(novo));
}
window.addEventListener('online', () => definirConexao('ok'));
window.addEventListener('offline', () => definirConexao('offline'));

// ---------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------
export class ErroApp extends Error {
  constructor(mensagem, { transitorio = false, sessao = false, codigo = '' } = {}) {
    super(mensagem);
    this.transitorio = transitorio;
    this.sessao = sessao;
    this.codigo = codigo;
  }
}

function traduzir(erro, status) {
  const msg = (erro && (erro.message || erro.error_description || String(erro))) || '';
  const codigo = (erro && erro.code) || '';

  // Falhas de rede / servidor fora / tempo esgotado -> vale tentar de novo
  if (status === 0 || status >= 500 || /Failed to fetch|NetworkError|Load failed|aborted|AbortError|fetch/i.test(msg) && !codigo) {
    return new ErroApp('Sem resposta do servidor.', { transitorio: true, codigo });
  }
  // Sessão vencida ou inválida
  if (status === 401 || codigo === 'PGRST301' || /JWT|jwt expired|refresh token/i.test(msg)) {
    return new ErroApp('Sua sessão expirou. Entre novamente.', { sessao: true, codigo });
  }
  // Nome repetido (índice único do banco)
  if (codigo === '23505') {
    return new ErroApp('Já existe um item ativo com esse nome.', { codigo });
  }
  if (codigo === '42501') {
    return new ErroApp('Sem permissão para esta ação.', { codigo });
  }
  // Mensagens das funções do banco já vêm em português (raise exception)
  return new ErroApp(msg || 'Erro inesperado.', { codigo });
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * Executa uma operação no Supabase com limite de tempo e novas tentativas.
 * `montar(signal)` deve devolver a consulta já com .abortSignal(signal).
 */
export async function chamar(montar, { tentativas = TENTATIVAS } = {}) {
  let ultimoErro;
  for (let t = 1; t <= tentativas; t++) {
    const ctrl = new AbortController();
    emAndamento++;
    const avisoLento = setTimeout(() => definirConexao('lento'), TEMPO_LENTO);
    const limite = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
    try {
      const { data, error, status, count } = await montar(ctrl.signal);
      if (error) throw traduzir(error, status);
      definirConexao('ok');
      return count !== undefined && count !== null ? { data, count } : data;
    } catch (e) {
      ultimoErro = e instanceof ErroApp ? e : traduzir(e, 0);
      if (!ultimoErro.transitorio || t === tentativas) break;
      definirConexao(navigator.onLine ? 'lento' : 'offline');
      await esperar(800 * t);
    } finally {
      clearTimeout(avisoLento);
      clearTimeout(limite);
      emAndamento--;
    }
  }
  if (ultimoErro.transitorio) {
    definirConexao(navigator.onLine ? 'erro' : 'offline');
    throw new ErroApp(navigator.onLine
      ? 'O servidor não respondeu. Verifique a internet e tente de novo em instantes.'
      : 'Sem internet no aparelho. Conecte-se e tente de novo.', { transitorio: true });
  }
  throw ultimoErro;
}

/** UUID para identificar cada gravação (proteção contra clique duplo). */
export function novaChave() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================
export async function entrar(email, pin) {
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: pin });
    if (error) {
      if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
        throw new ErroApp('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.');
      }
      if (/Invalid login credentials/i.test(error.message)) throw new ErroApp('PIN incorreto.');
      if (!error.status || error.status >= 500) throw new ErroApp('O servidor não respondeu. Verifique a internet e tente de novo.');
      throw new ErroApp(error.message);
    }
    return data.session;
  } catch (e) {
    if (e instanceof ErroApp) throw e;
    throw new ErroApp('Não foi possível conectar. Verifique a internet e tente de novo.');
  }
}

export async function sair() {
  try { await db.auth.signOut(); } catch (_) { /* sem internet: a sessão local é apagada mesmo assim */ }
  try { localStorage.removeItem('spm-estoque-sessao'); } catch (_) {}
}

export async function sessaoAtual() {
  const { data } = await db.auth.getSession();
  return data.session;
}

/** Nome/perfil da conta logada (tabela "autorizados"). null = conta sem acesso. */
export function carregarPerfil(userId) {
  return chamar(s => db.from('autorizados').select('nome,perfil,compartilhado').eq('user_id', userId).maybeSingle().abortSignal(s));
}

// =====================================================================
// LEITURAS
// =====================================================================
const CAMPOS_ITEM = 'id,nome,categoria,unidade,estoque_atual,estoque_minimo,ativo';
const CAMPOS_MOV = 'id,data_hora,item_id,item_nome,tipo,quantidade,saldo_anterior,saldo_posterior,feito_por,entregue_a,observacao,origem,estornado_em,estornado_por,motivo_estorno';

export function listarCategorias() {
  return chamar(s => db.from('categorias').select('nome,ordem').order('ordem').abortSignal(s));
}

export function listarItens() {
  return chamar(s => db.from('itens').select(CAMPOS_ITEM).order('nome').abortSignal(s));
}

/** Movimentações entre duas datas (ISO), da mais antiga para a mais nova. */
export function movimentacoesEntre(inicioIso, fimIso) {
  return chamar(s => db.from('movimentacoes').select(CAMPOS_MOV)
    .gte('data_hora', inicioIso).lt('data_hora', fimIso)
    .order('data_hora', { ascending: true }).limit(5000).abortSignal(s));
}

/** Página do histórico, da mais nova para a mais antiga, com filtros. */
export function paginaHistorico({ de = 0, ate = 49, tipo = '', busca = '' } = {}) {
  return chamar(s => {
    let q = db.from('movimentacoes').select(CAMPOS_MOV, { count: 'exact' });
    if (tipo) q = q.eq('tipo', tipo);
    const termo = limparBusca(busca);
    if (termo) {
      q = q.or(['item_nome', 'feito_por', 'entregue_a', 'observacao'].map(c => `${c}.ilike.*${termo}*`).join(','));
    }
    return q.order('data_hora', { ascending: false }).range(de, ate).abortSignal(s);
  });
}

/** Últimas movimentações de um item (janela de detalhes). */
export function movimentacoesDoItem(itemId, limite = 15) {
  return chamar(s => db.from('movimentacoes').select(CAMPOS_MOV)
    .eq('item_id', itemId).order('data_hora', { ascending: false }).limit(limite).abortSignal(s));
}

export function listarDivergencias() {
  return chamar(s => db.from('v_divergencias').select('*').order('nome').abortSignal(s));
}

export function listarDuplicadas() {
  return chamar(s => db.from('v_possiveis_duplicadas').select('*').order('data_hora', { ascending: false }).abortSignal(s));
}

// Caracteres que têm significado especial no filtro "or" do Supabase
function limparBusca(t) { return String(t || '').replace(/[,()*%\\:"']/g, ' ').trim().replace(/\s+/g, ' '); }

// =====================================================================
// GRAVAÇÕES (todas pelas funções do banco — etapa 1, seção 5)
// =====================================================================
export function registrarMovimentacao({ itemId, tipo, quantidade, feitoPor, entregueA, observacao, chave }) {
  return chamar(s => db.rpc('registrar_movimentacao', {
    p_item_id: itemId, p_tipo: tipo, p_quantidade: quantidade, p_feito_por: feitoPor,
    p_entregue_a: entregueA || null, p_observacao: observacao || null, p_chave: chave
  }).abortSignal(s));
}

export function cadastrarItem({ nome, categoria, unidade, estoqueInicial, estoqueMinimo, feitoPor, chave }) {
  return chamar(s => db.rpc('cadastrar_item', {
    p_nome: nome, p_categoria: categoria, p_unidade: unidade,
    p_estoque_inicial: estoqueInicial, p_estoque_minimo: estoqueMinimo,
    p_feito_por: feitoPor, p_chave: chave
  }).abortSignal(s));
}

export function ajustarEstoque({ itemId, contagem, feitoPor, observacao, chave }) {
  return chamar(s => db.rpc('ajustar_estoque', {
    p_item_id: itemId, p_contagem: contagem, p_feito_por: feitoPor,
    p_observacao: observacao || null, p_chave: chave
  }).abortSignal(s));
}

export function estornarMovimentacao({ movId, feitoPor, motivo }) {
  return chamar(s => db.rpc('estornar_movimentacao', {
    p_mov_id: movId, p_feito_por: feitoPor, p_motivo: motivo
  }).abortSignal(s));
}

export function definirItemAtivo(itemId, ativo) {
  return chamar(s => db.rpc('definir_item_ativo', { p_item_id: itemId, p_ativo: ativo }).abortSignal(s));
}

/** Edição de cadastro: o banco só permite mudar estas quatro colunas. */
export function editarItem(itemId, { nome, categoria, unidade, estoqueMinimo }) {
  return chamar(s => db.from('itens')
    .update({ nome, categoria, unidade, estoque_minimo: estoqueMinimo })
    .eq('id', itemId).abortSignal(s));
}

/** "Manter" uma possível duplicada. Repetir o pedido não é erro. */
export async function marcarRevisada(movId, feitoPor) {
  try {
    await chamar(s => db.from('atencao_revisados')
      .insert({ tipo: 'duplicada', referencia: movId, decisao: 'manter', revisado_por: feitoPor })
      .abortSignal(s));
  } catch (e) {
    if (e.codigo === '23505') return; // já estava marcada (ex.: nova tentativa após rede ruim)
    throw e;
  }
}
