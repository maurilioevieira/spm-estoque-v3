// =====================================================================
//  ui.js — Peças de interface reaproveitadas por todas as telas
//  (formatação, avisos, janelas, ícones)
// =====================================================================

// ---------------------------------------------------------------------
// Texto e números
// ---------------------------------------------------------------------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = n => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** Converte "1,5" ou "1.5" em número. Vazio/inválido -> NaN. */
export function lerNumero(v) {
  const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

// ---------------------------------------------------------------------
// Datas (sempre no fuso do aparelho — Fortaleza)
// ---------------------------------------------------------------------
const pad = n => String(n).padStart(2, '0');
/** 'AAAA-MM-DD' de um Date, no fuso local. */
export const isoDia = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Date à meia-noite local a partir de 'AAAA-MM-DD'. */
export const inicioDoDia = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
export const somarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const hojeIso = () => isoDia(new Date());

export const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR');
export const horaCurta = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dataHora = iso => `${dataCurta(iso)} ${horaCurta(iso)}`;
export const diaBr = s => s.split('-').reverse().join('/');
export function dataLonga(d) {
  const t = new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------
// Status do item: zerado / baixo / ok
// (mesma regra da versão anterior: baixo = até o mínimo, e nunca menos de 2)
// ---------------------------------------------------------------------
export function statusItem(i) {
  const atual = Number(i.estoque_atual), min = Number(i.estoque_minimo) || 0;
  if (atual <= 0) return 'zero';
  if (atual <= Math.max(min, 2)) return 'low';
  return 'ok';
}

// ---------------------------------------------------------------------
// Aviso rápido (toast)
// ---------------------------------------------------------------------
export function aviso(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (tipo === 'erro' ? ' toast-erro' : tipo === 'ok' ? ' toast-ok' : '');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => t.classList.remove('show'), tipo === 'erro' ? 5000 : 2800);
}

// ---------------------------------------------------------------------
// Janela (modal) genérica
// ---------------------------------------------------------------------
//  abrirJanela({
//    titulo, subtitulo, corpo (HTML), botao, classeBotao,
//    aoAbrir(el),                 -> liga eventos dos campos
//    aoSalvar(el) => Promise      -> lança erro para mostrar na janela;
//                                    devolve false para manter aberta
//    semRodape                    -> janela só de leitura
//  })
//  Enquanto salva, o botão fica travado ("Salvando…"): é a primeira
//  barreira contra clique duplo. A segunda é a chave única no banco.
// ---------------------------------------------------------------------
export function abrirJanela(op) {
  const dlg = document.getElementById('janela');
  const form = dlg.querySelector('form');
  dlg.querySelector('#jTitulo').textContent = op.titulo || '';
  const sub = dlg.querySelector('#jSub');
  sub.textContent = op.subtitulo || '';
  sub.hidden = !op.subtitulo;
  dlg.querySelector('#jCorpo').innerHTML = op.corpo || '';
  const erro = dlg.querySelector('#jErro');
  erro.textContent = '';
  const ok = dlg.querySelector('#jOk');
  const cancelar = dlg.querySelector('#jCancelar');
  dlg.querySelector('.modal-foot').hidden = !!op.semRodape;
  dlg.querySelector('#jFecharTopo').hidden = !op.semRodape;
  ok.textContent = op.botao || 'Salvar';
  ok.className = 'btn ' + (op.classeBotao || 'btn-primary');
  ok.disabled = false;
  cancelar.disabled = false;

  const fechar = () => { if (dlg.open) dlg.close(); };
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (!op.aoSalvar) return fechar();
    erro.textContent = '';
    const textoOriginal = ok.textContent;
    ok.disabled = true; cancelar.disabled = true;
    ok.textContent = 'Salvando…';
    try {
      const r = await op.aoSalvar(dlg);
      if (r !== false) fechar();
    } catch (e) {
      erro.textContent = e.message || 'Erro inesperado.';
    } finally {
      ok.disabled = false; cancelar.disabled = false;
      ok.textContent = textoOriginal;
    }
  };
  cancelar.onclick = fechar;
  dlg.querySelector('#jFecharTopo').onclick = fechar;
  dlg.onclose = () => {
    if (op.aoFechar) op.aoFechar();
    // limpa o conteúdo para não sobrar campo "fantasma" de uma janela anterior
    if (!dlg.open) dlg.querySelector('#jCorpo').innerHTML = '';
  };
  // Enquanto salva, a tecla Esc não fecha a janela (evita "fechou mas gravou?")
  dlg.oncancel = e => { if (ok.disabled) e.preventDefault(); };
  // Uma janela pode abrir outra por cima (ex.: detalhes -> entrada): reaproveita
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('.modal-body').scrollTop = 0;
  if (op.aoAbrir) op.aoAbrir(dlg);
  const primeiro = dlg.querySelector('#jCorpo [autofocus]'); // no celular não abre o teclado sozinho
  if (primeiro && matchMedia('(pointer: fine)').matches) primeiro.focus();
  return dlg;
}

export function fecharJanela() {
  const dlg = document.getElementById('janela');
  if (dlg.open) dlg.close();
}

// ---------------------------------------------------------------------
// Ícones (SVG em linha, sem depender de biblioteca externa)
// ---------------------------------------------------------------------
const svg = (d, w = 2) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICO = {
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pdf: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 15h6M9 18h4"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  atualizar: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>')
};
