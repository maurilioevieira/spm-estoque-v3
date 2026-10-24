// =====================================================================
//  Tela: RELATÓRIOS (PDFs)
// =====================================================================
import { estado, nomeExibicao } from '../estado.js';
import { hojeIso, diaBr, aviso, ICO } from '../ui.js';
import { gerarPdfMovs, camposPeriodo, ligarPeriodo } from '../acoes.js';
import { pdfFoto, FOTOS } from '../pdf.js';

export function montar(view) {
  view.innerHTML = `
  <div class="page-head">
    <div><p class="eyebrow">Arquivos em PDF prontos para imprimir ou enviar</p><h1>Relatórios</h1></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Movimentações do dia</h2>
      <p class="rep-desc">Tudo o que entrou e saiu em um único dia. Útil quando o volume do dia é grande.</p>
      <div class="stack">
        <div class="field"><label for="rDia">Dia</label><input id="rDia" type="date" value="${hojeIso()}" max="${hojeIso()}"></div>
        <button class="btn btn-primary" type="button" id="bDia">${ICO.pdf} Gerar PDF do dia</button>
      </div>
    </div>
    <div class="card">
      <h2>Movimentações por período</h2>
      <p class="rep-desc">Resumo por item + lista completa. Ideal para o relatório semanal.</p>
      <div class="stack">
        ${camposPeriodo('rp')}
        <button class="btn btn-primary" type="button" id="bPer">${ICO.pdf} Gerar PDF do período</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Fotografias do estoque</h2><p>Situação de agora, sem período</p></div>
    ${Object.entries(FOTOS).map(([k, f]) => `
      <div class="snap-row"><div><div class="att-name">${f.titulo}</div><div class="att-sub">${f.descricao}</div></div>
      <button class="btn-sm btn-sm-blue" type="button" data-foto="${k}">Gerar PDF</button></div>`).join('')}
  </div>`;

  const lerPeriodo = ligarPeriodo(view, 'rp');

  // trava o botão enquanto o PDF é montado (evita PDFs repetidos)
  const executar = async (botao, tarefa) => {
    const texto = botao.innerHTML;
    botao.disabled = true; botao.textContent = 'Gerando…';
    try { await tarefa(); } catch (e) { aviso(e.message, 'erro'); } finally { botao.disabled = false; botao.innerHTML = texto; }
  };

  view.querySelector('#bDia').onclick = e => executar(e.currentTarget, async () => {
    const d = view.querySelector('#rDia').value;
    const n = await gerarPdfMovs(d, d);
    aviso(`PDF gerado: ${n} lançamento(s) em ${diaBr(d)}.`, 'ok');
  });
  view.querySelector('#bPer').onclick = e => executar(e.currentTarget, async () => {
    const [a, b] = lerPeriodo();
    const n = await gerarPdfMovs(a, b);
    aviso(`PDF gerado: ${n} lançamento(s) de ${diaBr(a)} a ${diaBr(b)}.`, 'ok');
  });
  view.querySelectorAll('[data-foto]').forEach(b => b.onclick = () => executar(b, async () => {
    pdfFoto(b.dataset.foto, estado.itens, nomeExibicao());
    aviso('PDF gerado.', 'ok');
  }));
}
