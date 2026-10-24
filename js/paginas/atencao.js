// =====================================================================
//  Tela: ATENÇÃO — o que precisa ser conferido ou corrigido
// ---------------------------------------------------------------------
//  As pendências vêm das views do banco (etapa 1, seção 6):
//   - divergências: estoque ≠ (última contagem + entradas − saídas)
//   - possíveis duplicadas: mesmo item/tipo/quantidade em até 15 s
//  e da lista local de itens (abaixo do mínimo).
//  Cada pendência some quando é resolvida.
// =====================================================================
import * as api from '../api.js';
import { estado, itensAtivos, carregarPendencias, nomeOperador } from '../estado.js';
import { esc, fmt, dataCurta, horaCurta, aviso, ICO } from '../ui.js';
import { abrirContagem, abrirMovimentacao, abrirEstorno } from '../acoes.js';

export function montar(view) {
  view.innerHTML = `
  <div class="page-head">
    <div><p class="eyebrow">O que precisa ser conferido ou corrigido</p><h1>Atenção</h1></div>
    <div class="page-actions"><button class="btn btn-secondary" type="button" id="bAtualizar">${ICO.atualizar} Atualizar</button></div>
  </div>
  <div id="atConteudo"><p class="empty">Carregando…</p></div>`;

  view.querySelector('#bAtualizar').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    try { await carregarPendencias(); } catch (err) { aviso(err.message, 'erro'); } finally { b.disabled = false; }
  };

  view.querySelector('#atConteudo').onclick = async e => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const { acao, id } = b.dataset;
    if (acao === 'contagem') abrirContagem(id);
    if (acao === 'entrada') abrirMovimentacao(id, 'Entrada');
    if (acao === 'estornar') {
      const d = (estado.duplicadas || []).find(x => x.mov_id === id);
      if (d) abrirEstorno({ id: d.mov_id, item_id: d.item_id, item_nome: d.item_nome, tipo: d.tipo, quantidade: d.quantidade, data_hora: d.data_hora, feito_por: d.feito_por });
    }
    if (acao === 'manter') {
      b.disabled = true;
      try {
        await api.marcarRevisada(id, nomeOperador());
        aviso('Marcado como conferido.', 'ok');
        await carregarPendencias();
      } catch (err) { aviso(err.message, 'erro'); b.disabled = false; }
    }
  };

  atualizar(view);
  if (estado.divergencias === null) carregarPendencias().catch(err => {
    const alvo = view.querySelector('#atConteudo');
    if (alvo) alvo.innerHTML = `<p class="empty v-out">${esc(err.message)}</p>`;
  });
}

export function atualizar(view) {
  const alvo = view.querySelector('#atConteudo');
  if (!alvo || estado.divergencias === null) return;
  const div = estado.divergencias, dup = estado.duplicadas || [];
  const baixos = itensAtivos().filter(i => i.st !== 'ok');
  const nZero = baixos.filter(i => i.st === 'zero').length;

  const vazio = txt => `<p class="empty ok-msg">✓ ${txt}</p>`;

  alvo.innerHTML = `
  ${div.length || dup.length ? `<div class="alert">Cada pendência some desta lista quando é resolvida. <b>Divergência</b>: conte o item na prateleira e registre a contagem. <b>Possível duplicada</b>: se foi lançado duas vezes por engano, estorne; se foram duas retiradas de verdade, marque “Manter”.</div>` : ''}
  <div class="tiles">
    <div class="tile"><span class="tile-label">Divergências de estoque</span><span class="tile-value ${div.length ? 'v-zero' : 'v-in'}">${div.length}</span><span class="tile-note">resolve com uma contagem</span></div>
    <div class="tile"><span class="tile-label">Possíveis duplicadas</span><span class="tile-value ${dup.length ? 'v-zero' : 'v-in'}">${dup.length}</span><span class="tile-note">estornar ou manter</span></div>
    <div class="tile"><span class="tile-label">Abaixo do mínimo</span><span class="tile-value ${baixos.length ? 'v-low' : 'v-in'}">${baixos.length}</span><span class="tile-note">${nZero} zerado${nZero === 1 ? '' : 's'} · ${baixos.length - nZero} baixo${baixos.length - nZero === 1 ? '' : 's'}</span></div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Divergências de estoque${div.length ? `<span class="pill-count">${div.length}</span>` : ''}</h2>
      <p>O estoque não bate com a soma das entradas e saídas registradas</p></div>
    ${div.length ? div.map(d => {
      const dif = Number(d.diferenca);
      return `<div class="att-row"><div><div class="att-name">${esc(d.nome)}</div>
        <div class="att-sub">No sistema: <b>${fmt(d.estoque_atual)}</b> ${esc(d.unidade)} · pelo histórico: ${fmt(d.estoque_pelo_historico)} · diferença <span class="diff ${dif > 0 ? 'diff-pos' : 'diff-neg'}">${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif))}</span>${d.ultima_contagem_em ? ` · última contagem ${dataCurta(d.ultima_contagem_em)}` : ''}</div></div>
        <div class="att-actions"><button class="btn-sm btn-sm-blue" type="button" data-acao="contagem" data-id="${esc(d.id)}">Registrar contagem</button></div></div>`;
    }).join('') : vazio('Nenhuma divergência. Estoque e histórico conferem.')}
  </div>

  <div class="card">
    <div class="card-head"><h2>Possíveis lançamentos duplicados${dup.length ? `<span class="pill-count">${dup.length}</span>` : ''}</h2>
      <p>Mesmo item, tipo e quantidade com poucos segundos de diferença</p></div>
    ${dup.length ? dup.map(d => `<div class="att-row"><div><div class="att-name"><span class="${d.tipo === 'Entrada' ? 'v-in' : 'v-out'}">${d.tipo === 'Entrada' ? '+' : '−'}${fmt(d.quantidade)}</span> ${esc(d.item_nome)}</div>
        <div class="att-sub">${d.tipo} em ${dataCurta(d.data_hora)} às ${horaCurta(d.data_hora)} · ${fmt(d.segundos_depois)} s depois de um lançamento idêntico · por ${esc(d.feito_por)}${d.entregue_a ? ` · entregue a ${esc(d.entregue_a)}` : ''}</div></div>
        <div class="att-actions"><button class="btn-sm btn-sm-out" type="button" data-acao="estornar" data-id="${esc(d.mov_id)}">Estornar</button><button class="btn-sm btn-sm-blue" type="button" data-acao="manter" data-id="${esc(d.mov_id)}">Manter</button></div></div>`).join('')
      : vazio('Nenhum lançamento suspeito de duplicidade.')}
  </div>

  <div class="card">
    <div class="card-head"><h2>Abaixo do mínimo${baixos.length ? `<span class="pill-count low">${baixos.length}</span>` : ''}</h2><p>Itens para repor</p></div>
    ${baixos.length ? baixos.map(i => `<div class="att-row"><div><div class="att-name">${esc(i.nome)}</div>
        <div class="att-sub">${i.st === 'zero' ? '<span class="v-zero">Zerado</span>' : '<span class="v-low">Baixo</span>'} · estoque ${fmt(i.estoque_atual)} ${esc(i.unidade)} · mínimo ${fmt(i.estoque_minimo)}</div></div>
        <div class="att-actions"><button class="btn-sm btn-sm-in" type="button" data-acao="entrada" data-id="${esc(i.id)}">+ Entrada</button></div></div>`).join('')
      : vazio('Todos os itens estão acima do mínimo.')}
  </div>`;
}
