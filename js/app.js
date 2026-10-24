// =====================================================================
//  app.js — Ponto de partida: login, menu, telas e atualização
// =====================================================================
import { CONTAS, VERSAO, RECARREGAR_APOS } from './config.js';
import * as api from './api.js';
import { estado, quando, carregarTudo, carregarItens, carregarHoje, carregarPendencias, totalPendencias, nomeExibicao } from './estado.js';
import { aviso, esc, fecharJanela } from './ui.js';
import { carregarSugestoes, pedirNomeGeral, lerNomeGeral } from './acoes.js';
import * as telaEstoque from './paginas/estoque.js';
import * as telaHistorico from './paginas/historico.js';
import * as telaRelatorios from './paginas/relatorios.js';
import * as telaAtencao from './paginas/atencao.js';

const TELAS = { estoque: telaEstoque, historico: telaHistorico, relatorios: telaRelatorios, atencao: telaAtencao };
const $ = id => document.getElementById(id);
let telaAtual = null;

// =====================================================================
// LOGIN
// =====================================================================
const CHAVE_CONTA = 'spm-estoque-conta';
let contaEscolhida = (() => { try { return localStorage.getItem(CHAVE_CONTA); } catch (_) { return null; } })() || CONTAS[0].id;

function mostrarLogin(mensagem = '') {
  fecharJanela();
  $('boot').hidden = true;
  $('app').hidden = true;
  $('login').hidden = false;
  $('loginMsg').textContent = mensagem;
  $('who').innerHTML = CONTAS.map(c => `
    <button type="button" data-conta="${c.id}" class="${c.id === contaEscolhida ? 'on' : ''}" aria-pressed="${c.id === contaEscolhida}">
      <span>${c.sigla}</span>${esc(c.rotulo)}
    </button>`).join('');
  $('pin').value = '';
  if (matchMedia('(pointer: fine)').matches) $('pin').focus();
}

$('who').onclick = e => {
  const b = e.target.closest('[data-conta]');
  if (!b) return;
  contaEscolhida = b.dataset.conta;
  $('who').querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  $('pin').focus();
};

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const pin = $('pin').value;
  const conta = CONTAS.find(c => c.id === contaEscolhida);
  if (!pin) { $('loginMsg').textContent = 'Digite o PIN.'; return; }
  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  $('loginMsg').textContent = '';
  try {
    await api.entrar(conta.email, pin);
    try { localStorage.setItem(CHAVE_CONTA, conta.id); } catch (_) {}
    await iniciar();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
};

// =====================================================================
// INÍCIO DO APP (depois do login ou com sessão já salva)
// =====================================================================
async function iniciar() {
  const sessao = await api.sessaoAtual();
  if (!sessao) return mostrarLogin();

  $('boot').hidden = false;
  $('bootMsg').textContent = 'Carregando o estoque…';
  const lento = setTimeout(() => { $('bootMsg').textContent = 'O servidor está demorando a responder. Aguarde mais um pouco…'; }, 4000);

  try {
    const perfil = await api.carregarPerfil(sessao.user.id);
    if (!perfil) {
      await api.sair();
      return mostrarLogin('Esta conta não tem acesso ao estoque. Fale com o administrador.');
    }
    estado.perfil = perfil;
    estado.conta = CONTAS.find(c => c.email === sessao.user.email) || null;
    estado.nomeGeral = perfil.compartilhado ? lerNomeGeral() : '';
    await carregarTudo();
  } catch (err) {
    if (err.sessao) { await api.sair(); return mostrarLogin(err.message); }
    $('bootMsg').innerHTML = `${esc(err.message)}<br><button class="btn btn-primary" type="button" id="bootTentar" style="margin-top:14px">Tentar de novo</button>`;
    $('bootTentar').onclick = () => iniciar();
    return;
  } finally {
    clearTimeout(lento);
  }

  $('login').hidden = true;
  $('boot').hidden = true;
  $('app').hidden = false;
  desenharUsuario();
  irPara();
  carregarSugestoes();
  if (estado.perfil.compartilhado && !estado.nomeGeral) pedirNomeGeral(true);
}

function desenharUsuario() {
  $('userName').textContent = nomeExibicao();
  $('userName').title = estado.perfil?.compartilhado ? 'Trocar o nome usado neste aparelho' : '';
  $('userName').classList.toggle('user-btn', !!estado.perfil?.compartilhado);
}
$('userName').onclick = () => { if (estado.perfil?.compartilhado) pedirNomeGeral(false); };

$('logoutBtn').onclick = async () => {
  await api.sair();
  estado.perfil = null;
  estado.itens = [];
  mostrarLogin();
};

// =====================================================================
// TELAS (rotas pelo endereço: #/estoque, #/historico …)
// =====================================================================
function irPara() {
  if ($('app').hidden) return;
  const nome = location.hash.replace('#/', '') || 'estoque';
  const chave = TELAS[nome] ? nome : 'estoque';
  telaAtual = chave;
  const view = $('view');
  TELAS[chave].montar(view);
  document.querySelectorAll('.nav-links a[data-route]').forEach(a => {
    const on = a.dataset.route === chave;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', irPara);

function atualizarTelaAtual() {
  if (!telaAtual || $('app').hidden) return;
  const t = TELAS[telaAtual];
  if (t.atualizar) t.atualizar($('view'));
}

// Quando os dados mudam, só a tela aberta é redesenhada
quando('itens', () => { if (telaAtual === 'estoque' || telaAtual === 'atencao') atualizarTelaAtual(); });
quando('hoje', () => { if (telaAtual === 'estoque') atualizarTelaAtual(); });
quando('pendencias', () => { desenharSelo(); if (telaAtual === 'atencao') atualizarTelaAtual(); });
quando('movimentacoes', () => { if (telaAtual === 'historico') atualizarTelaAtual(); });
quando('perfil', () => { desenharUsuario(); if (telaAtual === 'estoque') atualizarTelaAtual(); });

function desenharSelo() {
  const n = totalPendencias();
  $('navBadge').textContent = n;
  $('navBadge').hidden = !n;
}

// =====================================================================
// CONEXÃO (indicador no menu + faixa de aviso)
// =====================================================================
const TEXTO_CONEXAO = {
  ok: ['Conectado', ''],
  lento: ['Servidor lento', 'O servidor está demorando a responder. O app continua tentando sozinho — aguarde.'],
  erro: ['Sem resposta', 'O servidor não respondeu. Verifique a internet; o app tenta de novo na próxima ação.'],
  offline: ['Sem internet', 'O aparelho está sem internet. Os dados na tela podem estar desatualizados.']
};
api.aoMudarConexao(st => {
  const [rotulo, faixa] = TEXTO_CONEXAO[st] || TEXTO_CONEXAO.ok;
  $('conn').className = 'conn conn-' + st;
  $('connTxt').textContent = rotulo;
  $('faixaConexao').hidden = !faixa;
  $('faixaConexao').textContent = faixa;
});

// =====================================================================
// MANTER ATUALIZADO
// ---------------------------------------------------------------------
// Ao voltar para o app (trocou de aba, desbloqueou o celular), recarrega
// se os dados tiverem mais de 1 minuto. Assim, se o Almino e o Jefferson
// estiverem com o app aberto ao mesmo tempo, um vê o que o outro lançou.
// =====================================================================
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('app').hidden) return;
  if (Date.now() - estado.carregadoEm < RECARREGAR_APOS) return;
  carregarItens().catch(() => {});
  carregarHoje().catch(() => {});
  carregarPendencias().catch(() => {});
  if (telaAtual === 'historico') atualizarTelaAtual();
});

// Sessão encerrada em outro lugar / token inválido
api.db.auth.onAuthStateChange(ev => {
  if (ev === 'SIGNED_OUT' && !$('app').hidden) mostrarLogin('Sua sessão foi encerrada. Entre novamente.');
});

// =====================================================================
// PARTIDA
// =====================================================================
$('versao').textContent = 'v' + VERSAO;
iniciar().catch(err => mostrarLogin(err.message));
window.__appOk = true; // sinal para a tela de abertura de que o código carregou
