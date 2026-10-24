// =====================================================================
//  acoes.js — Janelas de ação usadas em várias telas
//  (entrada/saída, novo item, detalhes do item, contagem, estorno,
//   PDFs, nome do acesso geral) e a linha de movimentação do histórico.
// =====================================================================

import * as api from './api.js';
import { estado, itemPorId, aplicarNovoEstoque, recarregarDepoisDeGravar, nomeOperador, nomeExibicao, carregarItens, avisar } from './estado.js';
import { abrirJanela, aviso, esc, fmt, lerNumero, horaCurta, dataCurta, dataHora, hojeIso, isoDia, inicioDoDia, somarDias, diaBr, statusItem } from './ui.js';
import { pdfMovimentacoes } from './pdf.js';

// ---------------------------------------------------------------------
// Sugestões de "Entregue a" e "Observação" (a partir do histórico)
// ---------------------------------------------------------------------
let sugestoes = { para: [], obs: [] };
export async function carregarSugestoes() {
  try {
    const { data } = await api.paginaHistorico({ de: 0, ate: 399 });
    const top = campo => Object.entries(data.reduce((a, m) => {
      const v = (m[campo] || '').trim();
      if (v) a[v] = (a[v] || 0) + 1;
      return a;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([v]) => v);
    sugestoes = { para: top('entregue_a'), obs: top('observacao') };
  } catch (_) { /* sugestões são só conforto */ }
}
const opcoes = lista => lista.map(v => `<option value="${esc(v)}">`).join('');

// =====================================================================
// ENTRADA / SAÍDA
// =====================================================================
export function abrirMovimentacao(itemId, tipoInicial = 'Entrada') {
  const item = itemPorId(itemId);
  if (!item) return;
  let tipo = tipoInicial;
  const chave = api.novaChave(); // a mesma chave vale para todas as tentativas desta janela

  abrirJanela({
    titulo: item.nome,
    subtitulo: `${item.categoria} · ${item.unidade}`,
    botao: 'Confirmar',
    corpo: `
      <div class="seg" role="group" aria-label="Tipo de movimentação">
        <button type="button" data-tipo="Entrada">+ Entrada</button>
        <button type="button" data-tipo="Saída">− Saída</button>
      </div>
      <div class="stock-now"><span>Estoque atual</span><span>${fmt(item.estoque_atual)} ${esc(item.unidade)}</span></div>
      <div class="field">
        <label for="mQtd">Quantidade</label>
        <div class="stepper">
          <button type="button" data-passo="-1" aria-label="Diminuir">−</button>
          <input id="mQtd" type="text" inputmode="decimal" value="1" autocomplete="off" autofocus>
          <button type="button" data-passo="1" aria-label="Aumentar">+</button>
        </div>
        <p class="after" id="mDepois"></p>
      </div>
      <div class="field" id="mCampoPara">
        <label for="mPara">Entregue a</label>
        <input id="mPara" list="mListaPara" placeholder="Nome de quem retirou" autocomplete="off" maxlength="80">
        <datalist id="mListaPara">${opcoes(sugestoes.para)}</datalist>
      </div>
      <div class="field">
        <label for="mObs">Observação (opcional)</label>
        <input id="mObs" list="mListaObs" placeholder="Ex.: uso na copa" autocomplete="off" maxlength="200">
        <datalist id="mListaObs">${opcoes(sugestoes.obs)}</datalist>
      </div>`,
    aoAbrir(dlg) {
      const qtd = dlg.querySelector('#mQtd');
      const pintar = () => {
        const ent = tipo === 'Entrada';
        dlg.querySelectorAll('.seg button').forEach(b => {
          b.className = b.dataset.tipo === tipo ? (ent ? 'on-in' : 'on-out') : '';
        });
        dlg.querySelector('#mCampoPara').hidden = ent;
        const ok = dlg.querySelector('#jOk');
        ok.className = 'btn ' + (ent ? 'btn-in' : 'btn-out');
        ok.textContent = ent ? 'Confirmar entrada' : 'Confirmar saída';
        const q = lerNumero(qtd.value);
        const depois = ent ? item.estoque_atual + (q || 0) : item.estoque_atual - (q || 0);
        dlg.querySelector('#mDepois').innerHTML = !(q > 0)
          ? '<span class="v-out">Informe uma quantidade maior que zero.</span>'
          : depois < 0
            ? `<span class="v-out">Maior que o estoque disponível (${fmt(item.estoque_atual)}).</span>`
            : `Estoque depois: <b>${fmt(depois)} ${esc(item.unidade)}</b>`;
      };
      dlg.querySelectorAll('.seg button').forEach(b => b.onclick = () => { tipo = b.dataset.tipo; pintar(); });
      dlg.querySelectorAll('[data-passo]').forEach(b => b.onclick = () => {
        const atual = lerNumero(qtd.value) || 0;
        qtd.value = String(Math.max(1, atual + Number(b.dataset.passo))).replace('.', ',');
        pintar();
      });
      qtd.oninput = pintar;
      qtd.onfocus = () => qtd.select();
      pintar();
    },
    async aoSalvar(dlg) {
      const quantidade = lerNumero(dlg.querySelector('#mQtd').value);
      if (!(quantidade > 0)) throw new Error('Informe uma quantidade maior que zero.');
      if (tipo === 'Saída' && quantidade > item.estoque_atual) throw new Error(`Quantidade maior que o estoque disponível (${fmt(item.estoque_atual)}).`);
      const r = await api.registrarMovimentacao({
        itemId: item.id, tipo, quantidade, feitoPor: nomeOperador(),
        entregueA: tipo === 'Saída' ? dlg.querySelector('#mPara').value.trim() : '',
        observacao: dlg.querySelector('#mObs').value.trim(), chave
      });
      aplicarNovoEstoque(item.id, r.novo_estoque);
      aviso(r.repetido ? 'Este lançamento já estava registrado.' : `${tipo === 'Entrada' ? 'Entrada' : 'Saída'} registrada: ${item.nome} — agora ${fmt(r.novo_estoque)} ${item.unidade}.`, 'ok');
      recarregarDepoisDeGravar();
    }
  });
}

// =====================================================================
// NOVO ITEM
// =====================================================================
export function abrirNovoItem() {
  const chave = api.novaChave();
  const unidades = [...new Set(estado.itens.map(i => i.unidade))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  abrirJanela({
    titulo: 'Novo item',
    subtitulo: 'O estoque inicial entra como a primeira movimentação do item.',
    botao: 'Cadastrar item',
    corpo: `
      <div class="field"><label for="nNome">Nome do item</label><input id="nNome" maxlength="80" autocomplete="off" autofocus placeholder="Ex.: Detergente 500ml"></div>
      <div class="field-row">
        <div class="field"><label for="nCat">Categoria</label><select id="nCat">${estado.categorias.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="nUn">Unidade</label><input id="nUn" list="nListaUn" maxlength="30" autocomplete="off" placeholder="Unidade, Kg, Fardo…"><datalist id="nListaUn">${opcoes(unidades)}</datalist></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="nIni">Estoque inicial</label><input id="nIni" inputmode="decimal" value="0" autocomplete="off"></div>
        <div class="field"><label for="nMin">Estoque mínimo</label><input id="nMin" inputmode="decimal" value="2" autocomplete="off"></div>
      </div>
      <p class="hint">Mínimo: abaixo dele (ou com 2 ou menos) o item aparece como <b>baixo</b> e entra na lista de reposição.</p>`,
    async aoSalvar(dlg) {
      const nome = dlg.querySelector('#nNome').value.trim();
      const unidade = dlg.querySelector('#nUn').value.trim();
      const ini = lerNumero(dlg.querySelector('#nIni').value || '0');
      const min = lerNumero(dlg.querySelector('#nMin').value || '0');
      if (!nome) throw new Error('Informe o nome do item.');
      if (!unidade) throw new Error('Informe a unidade (ex.: Unidade, Kg, Fardo).');
      if (!(ini >= 0) || !(min >= 0)) throw new Error('Estoque inicial e mínimo precisam ser números (zero ou mais).');
      const r = await api.cadastrarItem({ nome, categoria: dlg.querySelector('#nCat').value, unidade, estoqueInicial: ini, estoqueMinimo: min, feitoPor: nomeOperador(), chave });
      await carregarItens().catch(() => {});
      aviso(r.repetido ? 'Este item já tinha sido cadastrado.' : `Item cadastrado: ${nome}.`, 'ok');
      recarregarDepoisDeGravar();
    }
  });
}

// =====================================================================
// DETALHES / EDIÇÃO DO ITEM
// =====================================================================
export function abrirDetalhesItem(itemId) {
  const item = itemPorId(itemId);
  if (!item) return;
  const st = statusItem(item);
  abrirJanela({
    titulo: item.nome,
    subtitulo: item.ativo
      ? `Estoque atual: ${fmt(item.estoque_atual)} ${item.unidade} · ${st === 'zero' ? 'zerado' : st === 'low' ? 'baixo' : 'normal'}`
      : 'Item arquivado',
    botao: 'Salvar alterações',
    corpo: `
      <div class="field"><label for="dNome">Nome</label><input id="dNome" maxlength="80" value="${esc(item.nome)}" autocomplete="off"></div>
      <div class="field-row">
        <div class="field"><label for="dCat">Categoria</label><select id="dCat">${estado.categorias.map(c => `<option ${c === item.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="dUn">Unidade</label><input id="dUn" maxlength="30" value="${esc(item.unidade)}" autocomplete="off"></div>
      </div>
      <div class="field"><label for="dMin">Estoque mínimo</label><input id="dMin" inputmode="decimal" value="${fmt(item.estoque_minimo)}" autocomplete="off"></div>
      <p class="hint">O <b>estoque atual</b> não se edita aqui: ele só muda por entrada, saída ou contagem — assim todo número tem um registro por trás.</p>
      <div class="detail-actions">
        ${item.ativo ? `
          <button type="button" class="btn-sm btn-sm-in" data-acao="entrada">+ Entrada</button>
          <button type="button" class="btn-sm btn-sm-out" data-acao="saida" ${item.estoque_atual <= 0 ? 'disabled' : ''}>− Saída</button>
          <button type="button" class="btn-sm btn-sm-blue" data-acao="contagem">Registrar contagem</button>
          <button type="button" class="btn-sm btn-sm-muted" data-acao="arquivar">Arquivar item</button>`
        : `<button type="button" class="btn-sm btn-sm-blue" data-acao="reativar">Reativar item</button>`}
      </div>
      <div>
        <h3 class="mini-title">Últimas movimentações</h3>
        <div id="dMovs" class="hist-list"><p class="empty">Carregando…</p></div>
      </div>`,
    aoAbrir(dlg) {
      dlg.querySelector('.detail-actions').onclick = async e => {
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        const a = b.dataset.acao;
        if (a === 'entrada') abrirMovimentacao(item.id, 'Entrada');
        if (a === 'saida') abrirMovimentacao(item.id, 'Saída');
        if (a === 'contagem') abrirContagem(item.id);
        if (a === 'arquivar') abrirArquivar(item.id);
        if (a === 'reativar') {
          b.disabled = true;
          try {
            await api.definirItemAtivo(item.id, true);
            await carregarItens();
            aviso('Item reativado.', 'ok');
            abrirDetalhesItem(item.id);
          } catch (err) { aviso(err.message, 'erro'); b.disabled = false; }
        }
      };
      api.movimentacoesDoItem(item.id).then(lista => {
        const alvo = dlg.querySelector('#dMovs');
        if (!alvo) return;
        alvo.innerHTML = lista.length ? lista.map(m => linhaMovimentacao(m, { compacta: true })).join('') : '<p class="empty">Nenhuma movimentação registrada.</p>';
      }).catch(err => {
        const alvo = dlg.querySelector('#dMovs');
        if (alvo) alvo.innerHTML = `<p class="empty v-out">${esc(err.message)}</p>`;
      });
    },
    async aoSalvar(dlg) {
      const nome = dlg.querySelector('#dNome').value.trim();
      const unidade = dlg.querySelector('#dUn').value.trim();
      const min = lerNumero(dlg.querySelector('#dMin').value);
      if (!nome || !unidade) throw new Error('Nome e unidade são obrigatórios.');
      if (!(min >= 0)) throw new Error('O mínimo precisa ser um número (zero ou mais).');
      await api.editarItem(item.id, { nome, categoria: dlg.querySelector('#dCat').value, unidade, estoqueMinimo: min });
      await carregarItens();
      aviso('Cadastro atualizado.', 'ok');
      avisar('movimentacoes');
    }
  });
}

function abrirArquivar(itemId) {
  const item = itemPorId(itemId);
  if (item.estoque_atual > 0) {
    abrirJanela({
      titulo: 'Arquivar item',
      corpo: `<p class="texto">Só é possível arquivar um item com estoque <b>zerado</b>. <b>${esc(item.nome)}</b> ainda tem <b>${fmt(item.estoque_atual)} ${esc(item.unidade)}</b>.</p>
              <p class="hint">Se o material não existe mais na prateleira, registre uma contagem com 0 e depois arquive.</p>`,
      botao: 'Entendi'
    });
    return;
  }
  abrirJanela({
    titulo: 'Arquivar item',
    corpo: `<p class="texto"><b>${esc(item.nome)}</b> sai da lista de estoque, mas todo o histórico dele continua guardado. Dá para reativar depois (filtro “Arquivados”).</p>`,
    botao: 'Arquivar', classeBotao: 'btn-out',
    async aoSalvar() {
      await api.definirItemAtivo(item.id, false);
      await carregarItens();
      aviso('Item arquivado.', 'ok');
    }
  });
}

// =====================================================================
// CONTAGEM FÍSICA (ajuste)
// =====================================================================
export function abrirContagem(itemId) {
  const item = itemPorId(itemId);
  if (!item) return;
  const chave = api.novaChave();
  abrirJanela({
    titulo: `Contagem — ${item.nome}`,
    subtitulo: 'Conte o que existe na prateleira e digite o número. Ele passa a ser o estoque oficial do item.',
    botao: 'Salvar contagem',
    corpo: `
      <div class="stock-now"><span>No sistema hoje</span><span>${fmt(item.estoque_atual)} ${esc(item.unidade)}</span></div>
      <div class="field"><label for="cQtd">Quantidade contada</label><input id="cQtd" class="input-big" inputmode="decimal" autocomplete="off" autofocus></div>
      <p class="after" id="cDif"></p>
      <div class="field"><label for="cObs">Observação (opcional)</label><input id="cObs" maxlength="200" placeholder="Ex.: inventário mensal" autocomplete="off"></div>`,
    aoAbrir(dlg) {
      const q = dlg.querySelector('#cQtd');
      q.oninput = () => {
        const v = lerNumero(q.value);
        const d = v - item.estoque_atual;
        dlg.querySelector('#cDif').innerHTML = !(v >= 0) ? '' : d === 0
          ? 'Confere com o sistema. A contagem fica registrada como conferência.'
          : `Diferença: <b class="${d > 0 ? 'v-in' : 'v-out'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${esc(item.unidade)}</b> (${d > 0 ? 'sobrou' : 'faltou'} em relação ao sistema)`;
      };
    },
    async aoSalvar(dlg) {
      const contagem = lerNumero(dlg.querySelector('#cQtd').value);
      if (!(contagem >= 0)) throw new Error('Digite a quantidade contada (zero ou mais).');
      const r = await api.ajustarEstoque({ itemId: item.id, contagem, feitoPor: nomeOperador(), observacao: dlg.querySelector('#cObs').value.trim(), chave });
      aplicarNovoEstoque(item.id, r.novo_estoque);
      aviso(`Contagem registrada: ${item.nome} — ${fmt(contagem)} ${item.unidade}.`, 'ok');
      recarregarDepoisDeGravar();
    }
  });
}

// =====================================================================
// ESTORNO
// =====================================================================
export function abrirEstorno(mov, aoConcluir) {
  const ent = mov.tipo === 'Entrada';
  abrirJanela({
    titulo: 'Estornar lançamento',
    subtitulo: 'O lançamento continua no histórico, riscado, com o motivo. O estoque volta ao que era.',
    botao: 'Estornar', classeBotao: 'btn-out',
    corpo: `
      <div class="hist-row ${ent ? 'hist-in' : 'hist-out'}" style="margin:0">
        <span class="hist-time">${horaCurta(mov.data_hora)}</span>
        <div><div class="hist-title">${esc(mov.item_nome)}</div><div class="hist-sub"><span>${dataCurta(mov.data_hora)}</span><span>por ${esc(mov.feito_por)}</span></div></div>
        <div class="hist-side"><span class="hist-qty">${ent ? '+' : '−'}${fmt(mov.quantidade)}</span></div>
      </div>
      <p class="after">Efeito: o estoque ${ent ? 'diminui' : 'aumenta'} <b>${fmt(mov.quantidade)}</b>.</p>
      <div class="field">
        <label for="eMotivo">Motivo</label>
        <input id="eMotivo" maxlength="200" autocomplete="off" placeholder="Por que este lançamento está sendo desfeito?" autofocus>
        <div class="chips" style="padding:4px 0 0">
          ${['Lançado em duplicidade', 'Quantidade errada', 'Item errado', 'Lançado por engano'].map(t => `<button type="button" class="chip" data-motivo="${t}">${t}</button>`).join('')}
        </div>
      </div>`,
    aoAbrir(dlg) {
      dlg.querySelectorAll('[data-motivo]').forEach(b => b.onclick = () => { dlg.querySelector('#eMotivo').value = b.dataset.motivo; });
    },
    async aoSalvar(dlg) {
      const motivo = dlg.querySelector('#eMotivo').value.trim();
      if (!motivo) throw new Error('Informe o motivo do estorno.');
      const r = await api.estornarMovimentacao({ movId: mov.id, feitoPor: nomeOperador(), motivo });
      aplicarNovoEstoque(mov.item_id, r.novo_estoque);
      aviso(r.repetido ? 'Este lançamento já estava estornado.' : 'Lançamento estornado.', 'ok');
      recarregarDepoisDeGravar();
      if (aoConcluir) aoConcluir();
    }
  });
}

// =====================================================================
// PDFs DE MOVIMENTAÇÃO
// =====================================================================
async function gerarPdfMovs(inicio, fim) {
  if (!inicio || !fim) throw new Error('Escolha as datas.');
  if (fim < inicio) throw new Error('A data final é anterior à inicial.');
  const movs = await api.movimentacoesEntre(inicioDoDia(inicio).toISOString(), somarDias(inicioDoDia(fim), 1).toISOString());
  pdfMovimentacoes({ inicio, fim, movs, itens: estado.itens, geradoPor: nomeExibicao() });
  return movs.filter(m => !m.estornado_em && m.tipo !== 'Ajuste').length;
}

export function abrirPdfDia(diaInicial) {
  abrirJanela({
    titulo: 'PDF do dia',
    subtitulo: 'Tudo o que entrou e saiu em um único dia.',
    botao: 'Gerar PDF',
    corpo: `<div class="field"><label for="pDia">Dia</label><input id="pDia" type="date" value="${diaInicial || hojeIso()}" max="${hojeIso()}"></div>`,
    async aoSalvar(dlg) {
      const d = dlg.querySelector('#pDia').value;
      const n = await gerarPdfMovs(d, d);
      aviso(`PDF gerado: ${n} lançamento(s) em ${diaBr(d)}.`, 'ok');
    }
  });
}

export function periodoPreDefinido(qual) {
  const hoje = new Date();
  if (qual === '7dias') return [isoDia(somarDias(hoje, -6)), isoDia(hoje)];
  if (qual === 'semana') { const seg = somarDias(hoje, -((hoje.getDay() + 6) % 7)); return [isoDia(seg), isoDia(hoje)]; }
  if (qual === 'mes') return [isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), isoDia(hoje)];
  if (qual === 'mesPassado') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return [isoDia(ini), isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
  }
  return [isoDia(hoje), isoDia(hoje)];
}
export const ATALHOS_PERIODO = [['7dias', 'Últimos 7 dias'], ['semana', 'Esta semana'], ['mes', 'Mês atual'], ['mesPassado', 'Mês passado']];

export function camposPeriodo(prefixo) {
  const [a, b] = periodoPreDefinido('7dias');
  return `
    <div class="chips" style="padding:0" data-atalhos="${prefixo}">
      ${ATALHOS_PERIODO.map(([k, t], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-periodo="${k}">${t}</button>`).join('')}
    </div>
    <div class="field-row">
      <div class="field"><label for="${prefixo}De">De</label><input id="${prefixo}De" type="date" value="${a}" max="${hojeIso()}"></div>
      <div class="field"><label for="${prefixo}Ate">Até</label><input id="${prefixo}Ate" type="date" value="${b}" max="${hojeIso()}"></div>
    </div>`;
}
export function ligarPeriodo(raiz, prefixo) {
  const de = raiz.querySelector(`#${prefixo}De`), ate = raiz.querySelector(`#${prefixo}Ate`);
  const chips = raiz.querySelectorAll(`[data-atalhos="${prefixo}"] .chip`);
  chips.forEach(c => c.onclick = () => {
    [de.value, ate.value] = periodoPreDefinido(c.dataset.periodo);
    chips.forEach(x => x.classList.toggle('on', x === c));
  });
  [de, ate].forEach(inp => inp.addEventListener('input', () => chips.forEach(x => x.classList.remove('on'))));
  return () => [de.value, ate.value];
}

export function abrirPdfPeriodo() {
  let ler;
  abrirJanela({
    titulo: 'PDF do período',
    subtitulo: 'Resumo por item e lista completa das movimentações.',
    botao: 'Gerar PDF',
    corpo: camposPeriodo('pp'),
    aoAbrir(dlg) { ler = ligarPeriodo(dlg, 'pp'); },
    async aoSalvar() {
      const [a, b] = ler();
      const n = await gerarPdfMovs(a, b);
      aviso(`PDF gerado: ${n} lançamento(s) de ${diaBr(a)} a ${diaBr(b)}.`, 'ok');
    }
  });
}
export { gerarPdfMovs };

// =====================================================================
// NOME NO ACESSO GERAL
// =====================================================================
const CHAVE_NOME = 'spm-estoque-nome-geral';
export function lerNomeGeral() { try { return localStorage.getItem(CHAVE_NOME) || ''; } catch (_) { return ''; } }

export function pedirNomeGeral(obrigatorio) {
  return new Promise(resolve => {
    abrirJanela({
      titulo: 'Quem está usando?',
      subtitulo: 'Este é o acesso geral, compartilhado. Seu nome aparece nos lançamentos que você fizer, junto com a marca “acesso geral”.',
      botao: 'Confirmar',
      corpo: `<div class="field"><label for="gNome">Seu nome</label><input id="gNome" maxlength="40" autocomplete="off" autofocus value="${esc(estado.nomeGeral)}" placeholder="Ex.: Jefferson"></div>`,
      aoAbrir(dlg) { if (obrigatorio) dlg.querySelector('#jCancelar').hidden = true; },
      async aoSalvar(dlg) {
        const nome = dlg.querySelector('#gNome').value.trim().replace(/\s+/g, ' ');
        if (nome.length < 2) throw new Error('Digite seu nome.');
        estado.nomeGeral = nome;
        try { localStorage.setItem(CHAVE_NOME, nome); } catch (_) {}
        avisar('perfil');
        resolve(nome);
      },
      aoFechar() {
        document.getElementById('jCancelar').hidden = false;
        if (obrigatorio && !estado.nomeGeral) setTimeout(() => pedirNomeGeral(true).then(resolve), 0);
        else resolve(estado.nomeGeral);
      }
    });
  });
}

// =====================================================================
// LINHA DE MOVIMENTAÇÃO (histórico, detalhes do item)
// =====================================================================
export function linhaMovimentacao(m, { compacta = false, comAcoes = false } = {}) {
  const ajuste = m.tipo === 'Ajuste', ent = m.tipo === 'Entrada';
  const classe = m.estornado_em ? 'hist-estornado' : ajuste ? 'hist-adj' : ent ? 'hist-in' : 'hist-out';
  const partes = [];
  if (compacta) partes.push(dataCurta(m.data_hora));
  if (ajuste && m.saldo_anterior !== null) partes.push(`Contagem: de <b>${fmt(m.saldo_anterior)}</b> para <b>${fmt(m.saldo_posterior)}</b>`);
  if (!ent && !ajuste && m.entregue_a) partes.push(`Entregue a <b>${esc(m.entregue_a)}</b>`);
  if (m.observacao) partes.push(esc(m.observacao));
  partes.push(`por ${esc(m.feito_por)}`);
  // "Estornar" fica discreto, junto dos detalhes (não aumenta a altura do card)
  if (comAcoes && !m.estornado_em && !ajuste) {
    partes.push(`<button type="button" class="btn-link btn-link-sm" data-estornar="${esc(m.id)}">Estornar</button>`);
  }

  let qtd, tag;
  if (ajuste) {
    const d = Number(m.saldo_posterior) - Number(m.saldo_anterior);
    qtd = d === 0 ? '=' : (d > 0 ? '+' : '−') + fmt(Math.abs(d));
    tag = 'Contagem';
  } else {
    qtd = (ent ? '+' : '−') + fmt(m.quantidade);
    tag = m.tipo;
  }
  if (m.estornado_em) tag = 'Estornado';

  return `
    <div class="hist-row ${classe}">
      <span class="hist-time">${horaCurta(m.data_hora)}</span>
      <div>
        <div class="hist-title">${compacta ? '' : esc(m.item_nome)}${compacta ? `${ent ? 'Entrada' : ajuste ? 'Contagem' : 'Saída'}` : ''}</div>
        <div class="hist-sub">${partes.map(p => `<span>${p}</span>`).join('')}</div>
        ${m.estornado_em ? `<div class="hist-sub hist-estorno-info"><span>Estornado por <b>${esc(m.estornado_por)}</b> em ${dataHora(m.estornado_em)}: ${esc(m.motivo_estorno)}</span></div>` : ''}
      </div>
      <div class="hist-side">
        <span class="hist-qty">${qtd}</span>
        <span class="tag">${tag}</span>
      </div>
    </div>`;
}
