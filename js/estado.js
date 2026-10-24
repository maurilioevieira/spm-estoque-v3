// =====================================================================
//  estado.js — Dados carregados na memória do app
// ---------------------------------------------------------------------
//  Por que manter tudo na memória: o estoque tem dezenas de itens, não
//  milhares. Carregar a lista inteira UMA vez e filtrar no próprio
//  aparelho deixa a busca instantânea, e não gera uma chamada ao
//  servidor a cada letra digitada (um dos motivos da lentidão antiga).
//
//  Depois de cada gravação, o item afetado é atualizado na hora com a
//  resposta do banco, e a lista é recarregada em segundo plano.
// =====================================================================

import * as api from './api.js';
import { statusItem, somarDias } from './ui.js';

export const estado = {
  conta: null,        // entrada de CONTAS (config.js) usada no login
  perfil: null,       // { nome, perfil, compartilhado } vindo do banco
  nomeGeral: '',      // nome digitado no aparelho (só conta compartilhada)
  categorias: [],
  itens: [],          // todos, inclusive arquivados
  movsHoje: [],
  divergencias: null, // null = ainda não carregado
  duplicadas: null,
  carregadoEm: 0
};

// ---------------------------------------------------------------------
// Avisos entre partes do app ("os itens mudaram", "pendências mudaram")
// ---------------------------------------------------------------------
const ouvintes = {};
export function quando(evento, fn) { (ouvintes[evento] ||= new Set()).add(fn); }
export function avisar(evento) { (ouvintes[evento] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

// ---------------------------------------------------------------------
// Nome que vai para "Feito por". O banco decide de verdade (etapa 1,
// princípio 5); aqui só mandamos o nome digitado na conta compartilhada.
// ---------------------------------------------------------------------
export function nomeOperador() {
  return estado.perfil?.compartilhado ? estado.nomeGeral : (estado.perfil?.nome || '');
}

export function nomeExibicao() {
  if (!estado.perfil) return '';
  return estado.perfil.compartilhado ? `${estado.nomeGeral || '—'} · acesso geral` : estado.perfil.nome;
}

// ---------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------
const ORDEM = { zero: 0, low: 1, ok: 2 };

function preparar(i) {
  return { ...i, estoque_atual: Number(i.estoque_atual), estoque_minimo: Number(i.estoque_minimo), st: statusItem(i) };
}

export function itensAtivos() {
  return estado.itens.filter(i => i.ativo)
    .sort((a, b) => ORDEM[a.st] - ORDEM[b.st] || a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function itensArquivados() {
  return estado.itens.filter(i => !i.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export const itemPorId = id => estado.itens.find(i => i.id === id);

export async function carregarItens() {
  const lista = await api.listarItens();
  estado.itens = lista.map(preparar);
  estado.carregadoEm = Date.now();
  avisar('itens');
}

/** Atualiza um item na memória com o saldo devolvido pelo banco. */
export function aplicarNovoEstoque(itemId, novo) {
  const it = itemPorId(itemId);
  if (!it || novo === null || novo === undefined) return;
  it.estoque_atual = Number(novo);
  it.st = statusItem(it);
  avisar('itens');
}

// ---------------------------------------------------------------------
// Movimentações de hoje (card "Movimentações hoje")
// ---------------------------------------------------------------------
export async function carregarHoje() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const lista = await api.movimentacoesEntre(hoje.toISOString(), somarDias(hoje, 1).toISOString());
  estado.movsHoje = lista.filter(m => !m.estornado_em && m.tipo !== 'Ajuste');
  avisar('hoje');
}

// ---------------------------------------------------------------------
// Pendências da aba Atenção
// ---------------------------------------------------------------------
export async function carregarPendencias() {
  const [div, dup] = await Promise.all([api.listarDivergencias(), api.listarDuplicadas()]);
  estado.divergencias = div;
  estado.duplicadas = dup;
  avisar('pendencias');
}

export function totalPendencias() {
  return (estado.divergencias?.length || 0) + (estado.duplicadas?.length || 0);
}

// ---------------------------------------------------------------------
// Carga completa (ao entrar) e recarga depois de gravar
// ---------------------------------------------------------------------
export async function carregarTudo() {
  const [cats] = await Promise.all([api.listarCategorias(), carregarItens()]);
  estado.categorias = cats.map(c => c.nome);
  // o resto não impede a tela de aparecer
  carregarHoje().catch(() => {});
  carregarPendencias().catch(() => {});
}

/** Depois de qualquer gravação: atualiza tudo em segundo plano. */
export function recarregarDepoisDeGravar() {
  carregarItens().catch(() => {});
  carregarHoje().catch(() => {});
  carregarPendencias().catch(() => {});
  avisar('movimentacoes');
}
