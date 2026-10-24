// =====================================================================
//  Tela: HISTÓRICO
// ---------------------------------------------------------------------
//  Busca e filtros rodam no servidor, 50 lançamentos por vez ("Carregar
//  mais"). Assim a tela abre rápido mesmo quando o histórico tiver
//  milhares de linhas daqui a alguns anos.
// =====================================================================
import * as api from '../api.js';
import { esc, dataLonga, ICO, isoDia, aviso } from '../ui.js';
import { abrirPdfDia, abrirPdfPeriodo, abrirEstorno, linhaMovimentacao } from '../acoes.js';

const POR_PAGINA = 50;
const filtro = { busca: '', tipo: '' };
let lista = [], total = 0, pedido = 0, temporizador;

export function montar(view) {
  view.innerHTML = `
  <div class="page-head">
    <div><p class="eyebrow">Todas as entradas, saídas e contagens, da mais recente para a mais antiga</p><h1>Histórico</h1></div>
    <div class="page-actions">
      <button class="btn btn-secondary" type="button" id="bPdfDia">${ICO.pdf} PDF do dia</button>
      <button class="btn btn-secondary" type="button" id="bPdfPer">${ICO.pdf} PDF do período</button>
    </div>
  </div>
  <div class="card">
    <div class="toolbar">
      <div class="search">${ICO.busca}<input id="hBusca" type="search" placeholder="Buscar por item, pessoa ou observação…" autocomplete="off" value="${esc(filtro.busca)}"></div>
      <select id="hTipo" aria-label="Tipo">
        <option value="">Todos os lançamentos</option>
        <option value="Entrada">Só entradas</option>
        <option value="Saída">Só saídas</option>
        <option value="Ajuste">Só contagens</option>
      </select>
    </div>
    <div id="histLista" style="margin-top:12px"><p class="empty">Carregando…</p></div>
  </div>`;

  view.querySelector('#bPdfDia').onclick = () => abrirPdfDia();
  view.querySelector('#bPdfPer').onclick = () => abrirPdfPeriodo();
  const b = view.querySelector('#hBusca'), t = view.querySelector('#hTipo');
  t.value = filtro.tipo;
  // espera a pessoa parar de digitar (0,35 s) antes de buscar no servidor
  b.oninput = () => { clearTimeout(temporizador); temporizador = setTimeout(() => { filtro.busca = b.value; carregar(view, true); }, 350); };
  t.onchange = () => { filtro.tipo = t.value; carregar(view, true); };

  view.querySelector('#histLista').onclick = e => {
    const est = e.target.closest('[data-estornar]');
    if (est) {
      const mov = lista.find(m => m.id === est.dataset.estornar);
      if (mov) abrirEstorno(mov);
      return;
    }
    if (e.target.closest('#maisHist')) carregar(view, false);
    if (e.target.closest('#tentarHist')) carregar(view, true);
  };

  carregar(view, true);
}

/** Recarrega do zero (chamado depois de qualquer gravação). */
export function atualizar(view) { carregar(view, true); }

async function carregar(view, doZero) {
  const alvo = view.querySelector('#histLista');
  if (!alvo) return;
  const meu = ++pedido; // se a pessoa digitar rápido, só a última busca vale
  const de = doZero ? 0 : lista.length;
  const botaoMais = alvo.querySelector('#maisHist');
  if (botaoMais) { botaoMais.disabled = true; botaoMais.textContent = 'Carregando…'; }
  if (doZero && !lista.length) alvo.innerHTML = '<p class="empty">Carregando…</p>';
  try {
    const r = await api.paginaHistorico({ de, ate: de + POR_PAGINA - 1, tipo: filtro.tipo, busca: filtro.busca });
    if (meu !== pedido) return;
    lista = doZero ? r.data : lista.concat(r.data);
    total = r.count ?? lista.length;
    desenhar(alvo);
  } catch (e) {
    if (meu !== pedido) return;
    if (doZero) alvo.innerHTML = `<p class="empty v-out">${esc(e.message)}</p><div class="more"><button class="btn btn-secondary" type="button" id="tentarHist">${ICO.atualizar} Tentar de novo</button></div>`;
    else aviso(e.message, 'erro');
  }
}

function desenhar(alvo) {
  if (!lista.length) {
    alvo.innerHTML = `<p class="empty">${filtro.busca || filtro.tipo ? 'Nenhum lançamento encontrado com esse filtro.' : 'Nenhuma movimentação registrada ainda.'}</p>`;
    return;
  }
  const dias = new Map();
  lista.forEach(m => {
    const d = isoDia(new Date(m.data_hora));
    if (!dias.has(d)) dias.set(d, []);
    dias.get(d).push(m);
  });
  let html = '';
  for (const [d, ms] of dias) {
    const validos = ms.filter(m => !m.estornado_em);
    const e = validos.filter(m => m.tipo === 'Entrada').length;
    const s = validos.filter(m => m.tipo === 'Saída').length;
    const c = validos.filter(m => m.tipo === 'Ajuste').length;
    html += `<div class="day-head"><span class="day-title">${dataLonga(d + 'T12:00')}</span>
      <span class="day-sum">${e ? `<span class="v-in">${e} entrada${e === 1 ? '' : 's'}</span>` : ''}${s ? `<span class="v-out">${s} saída${s === 1 ? '' : 's'}</span>` : ''}${c ? `<span class="v-adj">${c} contage${c === 1 ? 'm' : 'ns'}</span>` : ''}</span></div>
      <div class="hist-list">${ms.map(m => linhaMovimentacao(m, { comAcoes: true })).join('')}</div>`;
  }
  if (total > lista.length) {
    html += `<div class="more"><button class="btn btn-secondary" type="button" id="maisHist">Carregar mais (${total - lista.length} restantes)</button></div>`;
  } else {
    html += `<p class="empty" style="text-align:center;margin-top:16px">${total} lançamento${total === 1 ? '' : 's'} no total.</p>`;
  }
  alvo.innerHTML = html;
}
