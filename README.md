# SPM · Controle de Estoque (v3)

Sistema de controle de estoque da Logística da Secretaria de Segurança Pública Municipal (Iguatu-CE).

- **Frontend:** HTML, CSS e JavaScript puros, publicados no GitHub Pages. O app pode ser instalado no celular (PWA).
- **Backend:** Supabase (PostgreSQL), no projeto "SPM Logística", região São Paulo.
- **Versão anterior (v2):** Google Apps Script + Google Sheets. Foi substituída por causa da lentidão (cold start), das gravações duplicadas e das divergências de estoque.

## Estrutura

```
index.html              tela única (login + app)
manifest.json, sw.js    app instalável / funciona com internet ruim
css/style.css           visual (azul-marinho, azul, verde/vermelho claros, âmbar)
icons/                  ícones do app
js/config.js            URL do Supabase, chave pública, contas, nome do órgão
js/api.js               comunicação com o banco (tempo limite, novas tentativas, erros em português)
js/estado.js            dados em memória (itens, pendências, movimentações do dia)
js/acoes.js             janelas: entrada/saída, novo item, detalhes, contagem, estorno, PDFs
js/pdf.js               relatórios em PDF (jsPDF + AutoTable)
js/paginas/*.js         telas: Estoque, Histórico, Relatórios, Atenção
js/vendor/              bibliotecas copiadas localmente (supabase-js 2.45.4, jsPDF 2.5.2, AutoTable 3.8.4)
```

## Regras que valem no banco (não dependem do app)

1. O estoque só muda pelas funções `registrar_movimentacao`, `cadastrar_item`, `ajustar_estoque` e `estornar_movimentacao`. Cada uma faz tudo numa única transação, com o item travado.
2. Toda gravação leva uma `chave_cliente` (UUID). Se o mesmo pedido chegar repetido (clique duplo, rede ruim), ele não é gravado de novo.
3. Nada é apagado. Item sem uso é **arquivado** (e só se estiver com estoque zerado). Lançamento errado é **estornado**: continua no histórico, marcado.
4. Só leem os dados as contas listadas na tabela `autorizados`. O cadastro público do Supabase fica **desligado**.
5. O "Feito por" é definido pelo banco a partir da conta logada. Na conta compartilhada, ele recebe a marca "· acesso geral".

## Contas

| Tela de login  | E-mail (interno)            | Uso                                 |
|----------------|-----------------------------|-------------------------------------|
| Almino         | logistica@estoque-spm.app   | operação diária                     |
| Acesso geral   | geral@estoque-spm.app       | Jefferson e Phelipe (pede o nome)   |
| Administrador  | (ver js/config.js)          | Maurílio                            |

Para trocar o PIN de uma conta: Supabase → Authentication → Users → a conta → *Reset password / Update user*.

## Publicar uma atualização

1. Altere os arquivos e envie para o repositório (branch `main`).
2. Se mudar a lista de arquivos, aumente `VERSION` em `sw.js`.
3. O GitHub Pages publica em cerca de 1 minuto.

## Scripts do banco (histórico)

- `etapa1_estrutura.sql`: tabelas, funções, views, regras de acesso e as três contas.
- `etapa2_migracao.sql`: importação da planilha v2 (56 itens, 9 arquivados, 350 movimentações).
