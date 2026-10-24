// =====================================================================
//  Tela: ESTOQUE (painel principal)
// =====================================================================
import { estado, itensAtivos, itensArquivados, nomeExibicao } from '../estado.js';
import { esc, fmt, semAcento, dataLonga, ICO } from '../ui.js';
import { abrirMovimentacao, abrirNovoItem, abrirDetalhesItem, abrirPdfDia, abrirPdfPeriodo } from '../acoes.js';

// Filtros ficam guardados enquanto o app estiver aberto (ao voltar para a
// tela, a busca continua como estava)
const filtro = { busca: '', cat: 'Todas', sit: 'todas' };

export function montar(view) {
  view.innerHTML = `
  <div class="page-head">
    <div>
      <p class="eyebrow" id="saudacao"></p>
      <h1>Estoque</h1>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" type="button" id="bPdfDia">${ICO.pdf} PDF do dia</button>
      <button class="btn btn-secondary" type="button" id="bPdfPer">${ICO.pdf} PDF do período</button>
      <button class="btn btn-primary" type="button" id="bNovo">${ICO.mais} Novo item</button>
    </div>
  </div>

  <div class="tiles" id="tiles"></div>

  <div class="card">
    <div class="toolbar">
      <div class="search">${ICO.busca}<input id="busca" type="search" placeholder="Buscar item…" autocomplete="off" value="${esc(filtro.busca)}"></div>
      <select id="sit" aria-label="Situação">
        <option value="todas">Situação: todas</option>
        <option value="low">Estoque baixo</option>
        <option value="zero">Zerados</option>
        <option value="ok">Normais</option>
        <option value="arquivados">Arquivados</option>
      </select>
    </div>
    <div class="chips" id="chipsCat"></div>
    <div class="grid-head">
      <span></span><span>Item</span><span>Categoria</span><span>Unidade</span><span class="num">Mín.</span><span class="num">Estoque</span><span class="num">Movimentar</span>
    </div>
    <div id="gridItens"></div>
    <div class="grid-foot">
      <span id="contagemItens"></span>
      <span class="legend"><span><i class="st"></i>normal</span><span><i class="st st-low"></i>baixo</span><span><i class="st st-zero"></i>zerado</span></span>
    </div>
  </div>`;

  view.querySelector('#bPdfDia').onclick = () => abrirPdfDia();
  view.querySelector('#bPdfPer').onclick = () => abrirPdfPeriodo();
  view.querySelector('#bNovo').onclick = () => abrirNovoItem();

  const busca = view.querySelector('#busca'), sit = view.querySelector('#sit');
  sit.value = filtro.sit;
  busca.oninput = () => { filtro.busca = busca.value; desenharLista(view); };
  sit.onchange = () => { filtro.sit = sit.value; desenharLista(view); };
  view.querySelector('#chipsCat').onclick = e => {
    const c = e.target.closest('.chip');
    if (c) { filtro.cat = c.dataset.cat; desenharLista(view); }
  };
  view.querySelector('#tiles').onclick = e => {
    const t = e.target.closest('[data-sit]');
    if (!t) return;
    filtro.sit = t.dataset.sit; filtro.cat = 'Todas'; sit.value = filtro.sit;
    desenharLista(view);
    view.querySelector('#gridItens').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Um único "ouvinte" para todos os botões da lista (mais leve que um por linha)
  view.querySelector('#gridItens').onclick = e => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.acao === 'entrada') abrirMovimentacao(id, 'Entrada');
    if (b.dataset.acao === 'saida') abrirMovimentacao(id, 'Saída');
    if (b.dataset.acao === 'detalhes') abrirDetalhesItem(id);
  };

  atualizar(view);
}

/** Redesenha com os dados atuais (chamado quando itens/hoje mudam). */
export function atualizar(view) {
  view.querySelector('#saudacao').textContent = `Olá, ${nomeExibicao()} · ${dataLonga(new Date()).toLowerCase()}`;
  desenharResumo(view);
  desenharLista(view);
}

function desenharResumo(view) {
  const ativos = itensAtivos();
  const nLow = ativos.filter(i => i.st === 'low').length;
  const nZero = ativos.filter(i => i.st === 'zero').length;
  const hoje = estado.movsHoje;
  const ent = hoje.filter(m => m.tipo === 'Entrada').length, sai = hoje.length - ent;
  view.querySelector('#tiles').innerHTML = `
    <div class="tile tile-dark"><span class="tile-label">Itens em estoque</span><span class="tile-value v-sky">${ativos.length}</span><span class="tile-note">${estado.categorias.length} categorias</span></div>
    <button class="tile" type="button" data-sit="low"><span class="tile-label">Estoque baixo</span><span class="tile-value v-low">${nLow}</span><span class="tile-note">no mínimo ou abaixo · ver lista</span></button>
    <button class="tile" type="button" data-sit="zero"><span class="tile-label">Zerados</span><span class="tile-value v-zero">${nZero}</span><span class="tile-note">sem saldo · ver lista</span></button>
    <a class="tile" href="#/historico"><span class="tile-label">Movimentações hoje</span><span class="tile-value">${hoje.length}</span><span class="tile-note"><span class="v-in">${ent} entrada${ent === 1 ? '' : 's'}</span> · <span class="v-out">${sai} saída${sai === 1 ? '' : 's'}</span></span></a>`;
}

function desenharLista(view) {
  const arquivados = filtro.sit === 'arquivados';
  const base = arquivados ? itensArquivados() : itensAtivos();
  const t = semAcento(filtro.busca.trim());
  const lista = base.filter(i =>
    (filtro.cat === 'Todas' || i.categoria === filtro.cat) &&
    (arquivados || filtro.sit === 'todas' || i.st === filtro.sit) &&
    (!t || semAcento(i.nome).includes(t)));

  view.querySelector('#gridItens').innerHTML = lista.length ? lista.map(i => `
    <div class="grid-row ${arquivados ? 'is-arquivado' : ''}">
      <i class="st ${i.st === 'ok' ? '' : 'st-' + i.st}" title="${i.st === 'zero' ? 'Zerado' : i.st === 'low' ? 'Estoque baixo' : 'Normal'}"></i>
      <div><button type="button" class="it-name" data-acao="detalhes" data-id="${esc(i.id)}">${esc(i.nome)}</button><div class="it-sub">${esc(i.categoria)} · ${esc(i.unidade)} · mín. ${fmt(i.estoque_minimo)}</div></div>
      <span class="it-cat">${esc(i.categoria)}</span>
      <span class="it-un">${esc(i.unidade)}</span>
      <span class="it-min num">${fmt(i.estoque_minimo)}</span>
      <span class="qty ${i.st === 'ok' ? '' : 'qty-' + i.st}">${fmt(i.estoque_atual)}</span>
      <div class="it-actions">
        ${arquivados
          ? `<button class="btn-sm btn-sm-blue" type="button" data-acao="detalhes" data-id="${esc(i.id)}">Ver / reativar</button>`
          : `<button class="btn-sm btn-sm-in" type="button" data-acao="entrada" data-id="${esc(i.id)}">+ Entrada</button>
             <button class="btn-sm btn-sm-out" type="button" data-acao="saida" data-id="${esc(i.id)}" ${i.estoque_atual <= 0 ? 'disabled' : ''}>− Saída</button>`}
      </div>
    </div>`).join('')
    : `<p class="empty" style="padding:24px 12px">${estado.itens.length ? 'Nenhum item encontrado.' : 'Carregando itens…'}</p>`;

  view.querySelector('#contagemItens').textContent = arquivados
    ? `${lista.length} item(ns) arquivado(s)`
    : `${lista.length} de ${base.length} itens`;

  view.querySelector('#chipsCat').innerHTML = ['Todas', ...estado.categorias].map(c => {
    const n = c === 'Todas' ? base.length : base.filter(i => i.categoria === c).length;
    return `<button type="button" class="chip ${filtro.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}<small>${n}</small></button>`;
  }).join('');
}
