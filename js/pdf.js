// =====================================================================
//  pdf.js — Relatórios em PDF (gerados no próprio aparelho)
// ---------------------------------------------------------------------
//  O PDF é montado no navegador com jsPDF + AutoTable (arquivos em
//  js/vendor, sem depender de site externo). Nada passa por servidor:
//  o relatório sai na hora, mesmo com muitos lançamentos.
//
//  Observação técnica: as fontes padrão do PDF não têm alguns símbolos
//  (como o sinal de menos tipográfico "−" e setas). Por isso, aqui se
//  usa "-" comum e textos como "de 10 para 8".
// =====================================================================

import { ORGAO, APP_NOME } from './config.js';
import { fmt, dataCurta, horaCurta, diaBr, statusItem } from './ui.js';

const COR = {
  navy: [13, 31, 56], azul: [31, 82, 150], cinza: [88, 101, 121], linha: [220, 227, 236],
  entra: [29, 106, 58], sai: [162, 52, 42], ajuste: [31, 82, 150], baixo: [133, 85, 10],
  fundoEntra: [240, 249, 243], fundoSai: [253, 242, 241], fundoAjuste: [235, 242, 251], fundoBaixo: [253, 245, 230]
};
const MARGEM = 14;

function novoDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

/** Cabeçalho da 1ª página. Devolve a altura (y) onde o conteúdo começa. */
function cabecalho(doc, titulo, subtitulo, geradoPor) {
  const larg = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...COR.azul);
  doc.text(ORGAO.toUpperCase(), MARGEM, 16);
  doc.setFontSize(16).setTextColor(...COR.navy);
  doc.text(titulo, MARGEM, 24);
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(40, 48, 60);
  doc.text(subtitulo, MARGEM, 30);
  const agora = new Date();
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...COR.cinza);
  doc.text(`Gerado em ${dataCurta(agora)} ${horaCurta(agora)}`, larg - MARGEM, 16, { align: 'right' });
  doc.text(`por ${geradoPor}`, larg - MARGEM, 20.5, { align: 'right' });
  doc.setDrawColor(...COR.navy).setLineWidth(0.8);
  doc.line(MARGEM, 34, larg - MARGEM, 34);
  return 40;
}

/** Quadros de resumo lado a lado. */
function quadros(doc, y, lista) {
  const larg = doc.internal.pageSize.getWidth() - MARGEM * 2;
  const gap = 3, w = (larg - gap * (lista.length - 1)) / lista.length, h = 15;
  lista.forEach((q, i) => {
    const x = MARGEM + i * (w + gap);
    doc.setDrawColor(...COR.linha).setLineWidth(0.3).roundedRect(x, y, w, h, 1.5, 1.5);
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...COR.cinza);
    doc.text(q.rotulo.toUpperCase(), x + 3, y + 5);
    doc.setFontSize(12).setTextColor(...(q.cor || COR.navy));
    doc.text(q.valor, x + 3, y + 12);
  });
  return y + h + 6;
}

function tituloSecao(doc, y, texto) {
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...COR.navy);
  doc.text(texto.toUpperCase(), MARGEM, y);
  return y + 2.5;
}

function rodapes(doc) {
  const total = doc.getNumberOfPages();
  const larg = doc.internal.pageSize.getWidth(), alt = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COR.linha).setLineWidth(0.3).line(MARGEM, alt - 12, larg - MARGEM, alt - 12);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...COR.cinza);
    doc.text(APP_NOME, MARGEM, alt - 7.5);
    doc.text(`Página ${p} de ${total}`, larg - MARGEM, alt - 7.5, { align: 'right' });
  }
}

/** Alinha à direita as colunas numéricas, inclusive o título da coluna. */
function direita(colunas) {
  return d => { if (colunas.includes(d.column.index)) d.cell.styles.halign = 'right'; };
}
const juntar = (...fns) => d => fns.forEach(f => f(d));

const estiloTabela = {
  theme: 'grid',
  margin: { left: MARGEM, right: MARGEM, bottom: 16 },
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: COR.linha, lineWidth: 0.2, textColor: [28, 38, 51], overflow: 'linebreak' },
  headStyles: { fillColor: COR.navy, textColor: 255, fontStyle: 'bold', fontSize: 7.8 }
};

// =====================================================================
// 1) MOVIMENTAÇÕES (do dia ou de um período)
// =====================================================================
export function pdfMovimentacoes({ inicio, fim, movs, itens, geradoPor }) {
  const doc = novoDoc();
  const umDia = inicio === fim;
  const titulo = umDia ? 'Movimentações de estoque do dia' : 'Relatório de movimentações de estoque';
  const sub = umDia ? `Dia: ${diaBr(inicio)}` : `Período: ${diaBr(inicio)} a ${diaBr(fim)}`;
  let y = cabecalho(doc, titulo, sub, geradoPor);

  const validas = movs.filter(m => !m.estornado_em);
  const entradas = validas.filter(m => m.tipo === 'Entrada');
  const saidas = validas.filter(m => m.tipo === 'Saída');
  const ajustes = validas.filter(m => m.tipo === 'Ajuste');
  const estornadas = movs.filter(m => m.estornado_em);
  const soma = l => l.reduce((s, m) => s + Number(m.quantidade), 0);

  const porItem = new Map();
  [...entradas, ...saidas].forEach(m => {
    const k = m.item_id;
    const p = porItem.get(k) || { nome: m.item_nome, e: 0, s: 0 };
    if (m.tipo === 'Entrada') p.e += Number(m.quantidade); else p.s += Number(m.quantidade);
    porItem.set(k, p);
  });
  const itemPorId = new Map(itens.map(i => [i.id, i]));

  y = quadros(doc, y, [
    { rotulo: 'Lançamentos', valor: String(entradas.length + saidas.length) },
    { rotulo: 'Entradas', valor: `${entradas.length} · ${fmt(soma(entradas))} un.`, cor: COR.entra },
    { rotulo: 'Saídas', valor: `${saidas.length} · ${fmt(soma(saidas))} un.`, cor: COR.sai },
    { rotulo: 'Itens movimentados', valor: String(porItem.size) }
  ]);

  if (!entradas.length && !saidas.length && !ajustes.length) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COR.cinza);
    doc.text(umDia ? 'Nenhuma movimentação registrada neste dia.' : 'Nenhuma movimentação registrada neste período.', MARGEM, y + 4);
  }

  // --- 1. Resumo por item
  if (porItem.size) {
    y = tituloSecao(doc, y, '1. Resumo por item');
    const linhas = [...porItem.entries()]
      .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))
      .map(([id, p]) => {
        const it = itemPorId.get(id);
        return [p.nome, it?.unidade || '', p.e ? fmt(p.e) : '-', p.s ? fmt(p.s) : '-', it ? fmt(it.estoque_atual) : '-'];
      });
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Item', 'Unidade', 'Entrou', 'Saiu', 'Estoque atual']],
      body: linhas,
      columnStyles: { 2: { halign: 'right', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 26 }, 1: { cellWidth: 26 } },
      didParseCell: juntar(direita([2, 3, 4]), d => {
        if (d.section !== 'body') return;
        if (d.column.index === 2 && d.cell.raw !== '-') { d.cell.styles.textColor = COR.entra; d.cell.styles.fontStyle = 'bold'; }
        if (d.column.index === 3 && d.cell.raw !== '-') { d.cell.styles.textColor = COR.sai; d.cell.styles.fontStyle = 'bold'; }
      })
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // --- 2. Lançamentos detalhados
  const detalhe = [...entradas, ...saidas].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  if (detalhe.length) {
    y = tituloSecao(doc, y, '2. Lançamentos detalhados');
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [[umDia ? 'Hora' : 'Data/hora', 'Item', 'Tipo', 'Qtd', 'Entregue a', 'Observação', 'Feito por']],
      body: detalhe.map(m => [
        umDia ? horaCurta(m.data_hora) : `${dataCurta(m.data_hora).slice(0, 5)} ${horaCurta(m.data_hora)}`,
        m.item_nome, m.tipo, fmt(m.quantidade), m.entregue_a || '', m.observacao || '', m.feito_por || ''
      ]),
      columnStyles: { 0: { cellWidth: umDia ? 12 : 21 }, 2: { cellWidth: 15 }, 3: { halign: 'right', cellWidth: 11 }, 4: { cellWidth: 25 }, 6: { cellWidth: 26 } },
      didParseCell: juntar(direita([3]), d => {
        if (d.section !== 'body') return;
        const m = detalhe[d.row.index];
        d.cell.styles.fillColor = m.tipo === 'Entrada' ? COR.fundoEntra : COR.fundoSai;
        if (d.column.index === 2 || d.column.index === 3) {
          d.cell.styles.textColor = m.tipo === 'Entrada' ? COR.entra : COR.sai;
          d.cell.styles.fontStyle = 'bold';
        }
      })
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // --- 3. Contagens físicas (ajustes), se houver
  if (ajustes.length) {
    y = tituloSecao(doc, y, '3. Contagens físicas (ajustes de estoque)');
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Data/hora', 'Item', 'Antes', 'Contado', 'Diferença', 'Observação', 'Feito por']],
      body: ajustes.map(m => {
        const dif = Number(m.saldo_posterior) - Number(m.saldo_anterior);
        return [dataCurta(m.data_hora).slice(0, 5) + ' ' + horaCurta(m.data_hora), m.item_nome, fmt(m.saldo_anterior), fmt(m.saldo_posterior), (dif > 0 ? '+' : '') + fmt(dif), m.observacao || '', m.feito_por || ''];
      }),
      columnStyles: { 0: { cellWidth: 21 }, 2: { halign: 'right', cellWidth: 13 }, 3: { halign: 'right', cellWidth: 15 }, 4: { halign: 'right', cellWidth: 17 }, 6: { cellWidth: 26 } },
      didParseCell: juntar(direita([2, 3, 4]), d => { if (d.section === 'body') d.cell.styles.fillColor = COR.fundoAjuste; })
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // --- 4. Estornados (transparência: aparecem, mas fora dos totais)
  if (estornadas.length) {
    y = tituloSecao(doc, y, `${ajustes.length ? 4 : 3}. Lançamentos estornados (fora dos totais)`);
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Data/hora', 'Item', 'Tipo', 'Qtd', 'Estornado por', 'Motivo']],
      body: estornadas.map(m => [dataCurta(m.data_hora).slice(0, 5) + ' ' + horaCurta(m.data_hora), m.item_nome, m.tipo, fmt(m.quantidade), m.estornado_por || '', m.motivo_estorno || '']),
      styles: { ...estiloTabela.styles, textColor: COR.cinza },
      columnStyles: { 0: { cellWidth: 21 }, 2: { cellWidth: 15 }, 3: { halign: 'right', cellWidth: 11 }, 4: { cellWidth: 28 } },
      didParseCell: direita([3])
    });
  }

  rodapes(doc);
  const nome = umDia ? `movimentacoes-${inicio}.pdf` : `movimentacoes-${inicio}-a-${fim}.pdf`;
  doc.save(nome);
}

// =====================================================================
// 2) FOTOGRAFIAS DO ESTOQUE (situação de agora)
// =====================================================================
export const FOTOS = {
  completo: { titulo: 'Estoque completo', descricao: 'Todos os itens ativos, com estoque e mínimo', filtro: () => true, arquivo: 'estoque-completo' },
  emEstoque: { titulo: 'Itens em estoque', descricao: 'Somente itens com saldo maior que zero', filtro: i => i.estoque_atual > 0, arquivo: 'estoque-com-saldo' },
  abaixo: { titulo: 'Itens abaixo do mínimo', descricao: 'Itens baixos e zerados: lista de reposição', filtro: i => statusItem(i) !== 'ok', arquivo: 'estoque-abaixo-do-minimo' },
  zerados: { titulo: 'Itens zerados', descricao: 'Somente itens sem saldo', filtro: i => i.estoque_atual <= 0, arquivo: 'estoque-zerados' }
};

export function pdfFoto(tipo, itens, geradoPor) {
  const cfg = FOTOS[tipo];
  const lista = itens.filter(i => i.ativo).filter(cfg.filtro)
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  const doc = novoDoc();
  const agora = new Date();
  let y = cabecalho(doc, cfg.titulo, `Situação em ${dataCurta(agora)} às ${horaCurta(agora)}`, geradoPor);
  const nZero = lista.filter(i => statusItem(i) === 'zero').length;
  const nBaixo = lista.filter(i => statusItem(i) === 'low').length;
  y = quadros(doc, y, [
    { rotulo: 'Itens listados', valor: String(lista.length) },
    { rotulo: 'Estoque baixo', valor: String(nBaixo), cor: COR.baixo },
    { rotulo: 'Zerados', valor: String(nZero), cor: COR.sai }
  ]);
  if (!lista.length) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COR.cinza);
    doc.text('Nenhum item nesta situação.', MARGEM, y + 4);
  } else {
    doc.autoTable({
      ...estiloTabela, startY: y,
      head: [['Item', 'Categoria', 'Unidade', 'Mínimo', 'Estoque', 'Situação']],
      body: lista.map(i => {
        const st = statusItem(i);
        return [i.nome, i.categoria, i.unidade, fmt(i.estoque_minimo), fmt(i.estoque_atual), st === 'zero' ? 'Zerado' : st === 'low' ? 'Baixo' : 'Normal'];
      }),
      columnStyles: { 1: { cellWidth: 30 }, 2: { cellWidth: 24 }, 3: { halign: 'right', cellWidth: 16 }, 4: { halign: 'right', cellWidth: 17 }, 5: { cellWidth: 18 } },
      didParseCell: juntar(direita([3, 4]), d => {
        if (d.section !== 'body') return;
        const st = statusItem(lista[d.row.index]);
        if (st === 'zero') { d.cell.styles.fillColor = COR.fundoSai; if (d.column.index >= 4) { d.cell.styles.textColor = COR.sai; d.cell.styles.fontStyle = 'bold'; } }
        if (st === 'low') { d.cell.styles.fillColor = COR.fundoBaixo; if (d.column.index >= 4) { d.cell.styles.textColor = COR.baixo; d.cell.styles.fontStyle = 'bold'; } }
      })
    });
  }
  rodapes(doc);
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  doc.save(`${cfg.arquivo}-${dia}.pdf`);
}
