// =====================================================================
//  config.js — Configurações do SPM · Controle de Estoque
// ---------------------------------------------------------------------
//  Único arquivo que muda se um dia o projeto do Supabase, os e-mails
//  das contas ou o nome do órgão mudarem. O resto do código só lê
//  daqui.
//
//  A URL e a chave abaixo são PÚBLICAS por natureza (vão para o
//  navegador de qualquer visitante). Quem protege os dados é o login
//  + as regras do banco (etapa 1). NUNCA coloque aqui a chave
//  "secret"/"service_role".
// =====================================================================

export const SUPABASE_URL = 'https://wwagetonvxjkdvvtwavr.supabase.co';
export const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3YWdldG9udnhqa2R2dnR3YXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE2ODcsImV4cCI6MjEwODQ0NzY4N30.wE9zMv4pjuj6SY2RBP_VViE0IA-0dm-wYiuWOcb9Rzc';

// As três contas da tela de login. O e-mail fica escondido: a pessoa só
// toca no próprio nome e digita o PIN (que é a senha da conta).
// Para trocar o PIN de alguém: Supabase > Authentication > Users.
export const CONTAS = [
  { id: 'almino', rotulo: 'Almino',        sigla: 'AL', email: 'logistica@estoque-spm.app' },
  { id: 'geral',  rotulo: 'Acesso geral',  sigla: 'AG', email: 'geral@estoque-spm.app' },
  { id: 'admin',  rotulo: 'Administrador', sigla: 'AD', email: 'mauriliodov2023@gmail.com' }
];

// Cabeçalho dos PDFs
export const ORGAO = 'Secretaria de Segurança Pública Municipal · Logística';
export const APP_NOME = 'SPM · Controle de Estoque';
export const VERSAO = '3.0.0';

// Limiares de tempo (milissegundos)
export const TEMPO_LENTO = 3500;      // a partir daqui, avisa "servidor demorando"
export const TEMPO_LIMITE = 20000;    // desiste da tentativa e tenta de novo
export const TENTATIVAS = 3;          // total de tentativas por operação
export const RECARREGAR_APOS = 60000; // ao voltar para o app, recarrega se os dados tiverem mais de 1 min
