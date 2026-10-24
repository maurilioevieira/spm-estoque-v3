-- =====================================================================
--  SPM · Controle de Estoque v3 — ETAPA 1: ESTRUTURA DO BANCO (Supabase)
-- ---------------------------------------------------------------------
--  Versão 3 (final): três contas de acesso; projeto criado com
--  "Automatically expose new tables" desmarcado e "Enable automatic
--  RLS" marcado.
--
--  Onde rodar: Supabase > projeto "SPM Logística" > SQL Editor > New query
--  Cole o arquivo INTEIRO e clique em "Run". Rode uma única vez.
--
--  PRÉ-REQUISITO: as três contas já criadas em Authentication > Users:
--    logistica@estoque-spm.app  -> Almino (uso diário)
--    geral@estoque-spm.app      -> Acesso geral (Jefferson e Phelipe)
--    mauriliodov2023@gmail.com  -> Maurílio (administrador)
--  O bloco 9 libera as três e define o nome de cada uma.
--
--  PRINCÍPIOS DESTA ESTRUTURA (o "porquê"):
--
--  1. O ESTOQUE SÓ MUDA POR FUNÇÃO. O app não consegue gravar
--     "estoque_atual" direto nem inserir movimentações soltas. Toda
--     entrada, saída, ajuste ou estorno passa por uma função que, numa
--     única transação: trava o item, confere o saldo, atualiza o estoque
--     e grava a movimentação. Ou acontece tudo, ou nada. Foi a falta
--     disso que gerou as 24 divergências na planilha.
--
--  2. CLIQUE DUPLO NÃO DUPLICA. Cada registro sai do celular com uma
--     "chave_cliente" (UUID). Se o mesmo pedido chegar duas vezes
--     (clique repetido ou nova tentativa por rede ruim), o banco
--     reconhece a chave e devolve o resultado do primeiro, sem gravar
--     de novo.
--
--  3. NADA SE APAGA. Item sai de uso sendo "arquivado" (ativo = false),
--     e movimentação errada é "estornada" (fica no histórico, marcada,
--     e o estoque é desfeito). Assim nunca mais existe movimentação
--     apontando para item que sumiu.
--
--  4. SEGURANÇA EM DUAS CAMADAS. Além de exigir login, cada leitura
--     confere se o usuário está na tabela "autorizados". Se um dia o
--     cadastro público do Supabase for reaberto por engano, uma conta
--     criada por estranhos continua sem ver nada.
--
--  5. O BANCO DECIDE O "FEITO POR". Em conta pessoal, o nome vem do
--     cadastro da conta (não dá para lançar em nome de outro). Na conta
--     compartilhada, usa o nome digitado no aparelho e acrescenta
--     "· acesso geral", para o relatório sempre mostrar a origem.
-- =====================================================================


-- =====================================================================
-- 1. TABELAS
-- =====================================================================

-- 1.1 Categorias (antes era uma lista fixa no Apps Script).
--     Em tabela, dá para criar/renomear categorias no futuro sem mexer
--     em código. "on update cascade" nos itens acompanha a renomeação.
create table public.categorias (
  nome  text primary key,
  ordem int  not null default 0
);

-- 1.2 Quem pode acessar os dados (ver princípio 4) e com que nome.
--     perfil: hoje os três têm as mesmas permissões; o campo já existe
--             para, no futuro, restringir alguma ação a um perfil.
--     compartilhado: conta usada por mais de uma pessoa (acesso geral).
--             Nela, o "Feito por" usa o nome digitado no aparelho e
--             recebe a marca "· acesso geral". Nas contas pessoais, o
--             nome vem daqui e o que o aparelho mandar é ignorado.
create table public.autorizados (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  perfil        text not null check (perfil in ('admin', 'operador', 'geral')),
  compartilhado boolean not null default false,
  ordem         int not null default 0,
  criado_em     timestamptz not null default now()
);

-- 1.3 Itens.
--     O ID continua no formato "ITEM-<milissegundos>" para os IDs da
--     planilha entrarem exatamente como estão; os novos ganham um sufixo
--     aleatório curto para nunca colidirem.
--     numeric(12,3): aceita fração (ex.: 1,5 Kg), mas os números
--     inteiros continuam aparecendo inteiros no app.
create table public.itens (
  id             text primary key
                 default ('ITEM-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                          || '-' || substr(md5(random()::text), 1, 4)),
  nome           text not null check (length(trim(nome)) > 0),
  categoria      text not null references public.categorias(nome) on update cascade,
  unidade        text not null check (length(trim(unidade)) > 0),
  estoque_atual  numeric(12,3) not null default 0 check (estoque_atual  >= 0),
  estoque_minimo numeric(12,3) not null default 0 check (estoque_minimo >= 0),
  ativo          boolean not null default true,
  chave_cliente  uuid unique,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Não deixa existir dois itens ATIVOS com o mesmo nome (ignorando
-- maiúsculas e espaços repetidos). É o que teria impedido o "Livro de
-- ata" cadastrado 5 vezes. Itens arquivados ficam fora da regra.
create unique index itens_nome_unico_ativo
  on public.itens (lower(regexp_replace(trim(nome), '\s+', ' ', 'g')))
  where ativo;

-- 1.4 Movimentações.
--     saldo_anterior / saldo_posterior: cada registro novo guarda o
--     estoque antes e depois. Vira uma trilha de auditoria — dá para
--     provar, linha a linha, como o estoque chegou ao número atual.
--     (As 350 movimentações migradas ficam com esses campos vazios,
--     porque a planilha não tinha essa informação.)
--
--     Tipos:
--       Entrada  — soma ao estoque
--       Saída    — subtrai do estoque
--       Ajuste   — contagem física: o estoque passa a ser o número
--                  contado. "quantidade" guarda a diferença absoluta;
--                  o sentido (sobrou/faltou) vem dos saldos.
create table public.movimentacoes (
  id              text primary key
                  default ('MOV-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint
                           || '-' || substr(md5(random()::text), 1, 4)),
  data_hora       timestamptz not null default now(),
  item_id         text not null references public.itens(id) on update cascade,
  item_nome       text not null,
  tipo            text not null check (tipo in ('Entrada', 'Saída', 'Ajuste')),
  quantidade      numeric(12,3) not null check (quantidade >= 0),
  saldo_anterior  numeric(12,3),
  saldo_posterior numeric(12,3),
  feito_por       text not null default 'Não identificado',
  entregue_a      text,
  observacao      text,
  origem          text not null default 'app' check (origem in ('app', 'migracao')),
  chave_cliente   uuid unique,
  estornado_em    timestamptz,
  estornado_por   text,
  motivo_estorno  text,
  -- Entrada e Saída precisam de quantidade > 0; só o Ajuste aceita 0
  -- (contagem que confirmou o estoque exatamente como estava).
  constraint mov_quantidade_valida check (tipo = 'Ajuste' or quantidade > 0)
);

-- Índices: os relatórios filtram por data; a tela do item filtra por
-- item + data. Sem índice, o banco leria a tabela inteira a cada busca.
create index movimentacoes_data_idx      on public.movimentacoes (data_hora desc);
create index movimentacoes_item_data_idx on public.movimentacoes (item_id, data_hora desc);

-- 1.5 Pendências da aba "Atenção" que alguém já analisou e decidiu
--     manter (ex.: "não é duplicada, foram duas retiradas mesmo").
--     Uma vez marcada, a pendência some da aba.
create table public.atencao_revisados (
  tipo          text not null check (tipo in ('duplicada')),
  referencia    text not null,
  decisao       text not null,
  revisado_por  text not null,
  revisado_em   timestamptz not null default now(),
  primary key (tipo, referencia)
);


-- =====================================================================
-- 2. CATEGORIAS INICIAIS (as mesmas do Apps Script, na mesma ordem)
-- =====================================================================
insert into public.categorias (nome, ordem) values
  ('Limpeza', 1),
  ('Hidratação', 2),
  ('Escritório', 3),
  ('Copa/Cozinha', 4),
  ('Outros', 5);


-- =====================================================================
-- 3. GATILHO: padroniza nome/unidade e carimba a data de alteração
-- ---------------------------------------------------------------------
-- A planilha tem nomes como "Açúcar  Cristal 1kg" (dois espaços), que
-- atrapalham a busca e a ordenação. Aqui, todo nome salvo tem os
-- espaços repetidos reduzidos a um — independentemente de como foi
-- digitado.
-- =====================================================================
create or replace function public.tg_itens_padronizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.nome          := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  new.unidade       := regexp_replace(trim(new.unidade), '\s+', ' ', 'g');
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger itens_padronizar
  before insert or update on public.itens
  for each row execute function public.tg_itens_padronizar();


-- =====================================================================
-- 4. VERIFICAÇÃO DE ACESSO
-- =====================================================================
-- "security definer" permite consultar "autorizados" mesmo de dentro
-- das regras de segurança das outras tabelas, sem abrir a tabela toda.
create or replace function public.eh_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.autorizados where user_id = auth.uid());
$$;

-- Nome que vai para "Feito por" / "Estornado por" / "Revisado por".
-- Quem decide é o BANCO, a partir da conta logada (ver tabela 1.2):
--   conta pessoal      -> nome cadastrado (ex.: "Almino"), sempre
--   conta compartilhada -> nome digitado no aparelho + " · acesso geral"
create or replace function public.nome_operador(p_informado text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when a.compartilhado
                then coalesce(nullif(trim(p_informado), ''), 'Não identificado') || ' · acesso geral'
              else a.nome
            end
       from public.autorizados a
      where a.user_id = auth.uid()),
    'Não identificado');
$$;


-- =====================================================================
-- 5. FUNÇÕES DE ESCRITA (as únicas portas para mudar o estoque)
-- =====================================================================

-- 5.1 Entrada / Saída -------------------------------------------------
create or replace function public.registrar_movimentacao(
  p_item_id    text,
  p_tipo       text,
  p_quantidade numeric,
  p_feito_por  text,
  p_entregue_a text default null,
  p_observacao text default null,
  p_chave      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens%rowtype;
  v_mov  public.movimentacoes%rowtype;
  v_novo numeric;
begin
  if not eh_autorizado() then
    raise exception 'Acesso não autorizado.';
  end if;
  if p_tipo not in ('Entrada', 'Saída') then
    raise exception 'Tipo de movimentação inválido.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade válida.';
  end if;

  -- Trava a linha do item até o fim da transação. Se duas pessoas
  -- derem baixa no mesmo item ao mesmo tempo, a segunda espera a
  -- primeira terminar e já enxerga o saldo atualizado.
  select * into v_item from itens where id = p_item_id for update;
  if not found or not v_item.ativo then
    raise exception 'Item não encontrado.';
  end if;

  -- Pedido repetido? (conferido DEPOIS da trava, para que duas cópias
  -- simultâneas do mesmo pedido também sejam reconhecidas)
  if p_chave is not null then
    select * into v_mov from movimentacoes where chave_cliente = p_chave;
    if found then
      return jsonb_build_object('id', v_mov.id, 'novo_estoque', v_mov.saldo_posterior, 'repetido', true);
    end if;
  end if;

  if p_tipo = 'Saída' then
    if p_quantidade > v_item.estoque_atual then
      raise exception 'Quantidade maior que o estoque disponível (%).', trim_scale(v_item.estoque_atual);
    end if;
    v_novo := v_item.estoque_atual - p_quantidade;
  else
    v_novo := v_item.estoque_atual + p_quantidade;
  end if;

  update itens set estoque_atual = v_novo where id = p_item_id;

  insert into movimentacoes
    (item_id, item_nome, tipo, quantidade, saldo_anterior, saldo_posterior,
     feito_por, entregue_a, observacao, chave_cliente)
  values
    (p_item_id, v_item.nome, p_tipo, p_quantidade, v_item.estoque_atual, v_novo,
     nome_operador(p_feito_por),
     case when p_tipo = 'Saída' then nullif(trim(p_entregue_a), '') end,
     nullif(trim(p_observacao), ''),
     p_chave)
  returning * into v_mov;

  return jsonb_build_object('id', v_mov.id, 'novo_estoque', v_novo, 'repetido', false);
end;
$$;


-- 5.2 Cadastro de item (+ entrada inicial, na mesma transação) ---------
create or replace function public.cadastrar_item(
  p_nome            text,
  p_categoria       text,
  p_unidade         text,
  p_estoque_inicial numeric,
  p_estoque_minimo  numeric,
  p_feito_por       text,
  p_chave           uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text;
  v_inicial numeric := coalesce(p_estoque_inicial, 0);
  v_minimo  numeric := coalesce(p_estoque_minimo, 0);
begin
  if not eh_autorizado() then
    raise exception 'Acesso não autorizado.';
  end if;

  if p_chave is not null then
    select id into v_id from itens where chave_cliente = p_chave;
    if found then
      return jsonb_build_object('id', v_id, 'repetido', true);
    end if;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_unidade), '') = '' then
    raise exception 'Preencha nome, categoria e unidade.';
  end if;
  if not exists (select 1 from categorias where nome = p_categoria) then
    raise exception 'Categoria inválida.';
  end if;
  if v_inicial < 0 or v_minimo < 0 then
    raise exception 'Estoque inicial e mínimo não podem ser negativos.';
  end if;

  begin
    insert into itens (nome, categoria, unidade, estoque_atual, estoque_minimo, chave_cliente)
    values (p_nome, p_categoria, p_unidade, v_inicial, v_minimo, p_chave)
    returning id into v_id;
  exception when unique_violation then
    -- Ou é o mesmo pedido chegando duas vezes ao mesmo tempo (mesma
    -- chave), ou já existe item ativo com esse nome.
    if p_chave is not null then
      select id into v_id from itens where chave_cliente = p_chave;
      if found then
        return jsonb_build_object('id', v_id, 'repetido', true);
      end if;
    end if;
    raise exception 'Já existe um item ativo com esse nome.';
  end;

  if v_inicial > 0 then
    insert into movimentacoes
      (item_id, item_nome, tipo, quantidade, saldo_anterior, saldo_posterior, feito_por, observacao)
    select v_id, nome, 'Entrada', v_inicial, 0, v_inicial,
           nome_operador(p_feito_por),
           'Cadastro inicial do item'
    from itens where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'repetido', false);
end;
$$;


-- 5.3 Ajuste por contagem física --------------------------------------
--     O estoque passa a ser exatamente o número contado. Também serve
--     de "ponto de conferência": a aba Atenção passa a calcular o
--     estoque esperado a partir da última contagem (ver view 6.1).
create or replace function public.ajustar_estoque(
  p_item_id    text,
  p_contagem   numeric,
  p_feito_por  text,
  p_observacao text default null,
  p_chave      uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens%rowtype;
  v_mov  public.movimentacoes%rowtype;
begin
  if not eh_autorizado() then
    raise exception 'Acesso não autorizado.';
  end if;
  if p_contagem is null or p_contagem < 0 then
    raise exception 'Informe a quantidade contada (zero ou mais).';
  end if;

  select * into v_item from itens where id = p_item_id for update;
  if not found or not v_item.ativo then
    raise exception 'Item não encontrado.';
  end if;

  if p_chave is not null then
    select * into v_mov from movimentacoes where chave_cliente = p_chave;
    if found then
      return jsonb_build_object('id', v_mov.id, 'novo_estoque', v_mov.saldo_posterior, 'repetido', true);
    end if;
  end if;

  update itens set estoque_atual = p_contagem where id = p_item_id;

  insert into movimentacoes
    (item_id, item_nome, tipo, quantidade, saldo_anterior, saldo_posterior,
     feito_por, observacao, chave_cliente)
  values
    (p_item_id, v_item.nome, 'Ajuste', abs(p_contagem - v_item.estoque_atual),
     v_item.estoque_atual, p_contagem,
     nome_operador(p_feito_por),
     coalesce(nullif(trim(p_observacao), ''), 'Contagem física'),
     p_chave)
  returning * into v_mov;

  return jsonb_build_object('id', v_mov.id, 'novo_estoque', p_contagem, 'repetido', false);
end;
$$;


-- 5.4 Estorno de movimentação -----------------------------------------
--     Desfaz o efeito no estoque e marca a movimentação como estornada
--     (ela continua visível no histórico, riscada, com motivo e autor).
--     Regras:
--       - Ajuste não se estorna: se a contagem estava errada, conta de novo.
--       - Não se estorna movimentação anterior à última contagem do item,
--         porque a contagem já "absorveu" aquele lançamento.
--       - Estornar uma Entrada não pode deixar o estoque negativo.
create or replace function public.estornar_movimentacao(
  p_mov_id    text,
  p_feito_por text,
  p_motivo    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov   public.movimentacoes%rowtype;
  v_item  public.itens%rowtype;
  v_novo  numeric;
  v_ultima_contagem timestamptz;
begin
  if not eh_autorizado() then
    raise exception 'Acesso não autorizado.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.';
  end if;

  select * into v_mov from movimentacoes where id = p_mov_id;
  if not found then
    raise exception 'Movimentação não encontrada.';
  end if;

  -- trava o item primeiro (mesma ordem das outras funções, evita impasse)
  select * into v_item from itens where id = v_mov.item_id for update;
  select * into v_mov  from movimentacoes where id = p_mov_id for update;

  if v_mov.estornado_em is not null then
    return jsonb_build_object('id', v_mov.id, 'novo_estoque', v_item.estoque_atual, 'repetido', true);
  end if;
  if v_mov.tipo = 'Ajuste' then
    raise exception 'Ajuste de contagem não pode ser estornado. Faça uma nova contagem.';
  end if;

  select max(data_hora) into v_ultima_contagem
  from movimentacoes
  where item_id = v_mov.item_id and tipo = 'Ajuste' and estornado_em is null;

  if v_ultima_contagem is not null and v_mov.data_hora <= v_ultima_contagem then
    raise exception 'Esta movimentação é anterior à última contagem do item. Corrija com uma nova contagem.';
  end if;

  if v_mov.tipo = 'Entrada' then
    if v_item.estoque_atual < v_mov.quantidade then
      raise exception 'O estoque atual (%) é menor que a entrada a estornar (%). Faça uma contagem do item.',
        trim_scale(v_item.estoque_atual), trim_scale(v_mov.quantidade);
    end if;
    v_novo := v_item.estoque_atual - v_mov.quantidade;
  else
    v_novo := v_item.estoque_atual + v_mov.quantidade;
  end if;

  update itens set estoque_atual = v_novo where id = v_item.id;

  update movimentacoes
     set estornado_em   = now(),
         estornado_por  = nome_operador(p_feito_por),
         motivo_estorno = trim(p_motivo)
   where id = p_mov_id;

  return jsonb_build_object('id', p_mov_id, 'novo_estoque', v_novo, 'repetido', false);
end;
$$;


-- 5.5 Arquivar / reativar item ----------------------------------------
--     Só arquiva com estoque zerado: um item arquivado com saldo
--     "esconderia" material que ainda existe na prateleira.
create or replace function public.definir_item_ativo(
  p_item_id text,
  p_ativo   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.itens%rowtype;
begin
  if not eh_autorizado() then
    raise exception 'Acesso não autorizado.';
  end if;

  select * into v_item from itens where id = p_item_id for update;
  if not found then
    raise exception 'Item não encontrado.';
  end if;
  if not p_ativo and v_item.estoque_atual > 0 then
    raise exception 'Só é possível arquivar item com estoque zerado (atual: %).', trim_scale(v_item.estoque_atual);
  end if;

  begin
    update itens set ativo = p_ativo where id = p_item_id;
  exception when unique_violation then
    raise exception 'Já existe outro item ativo com esse nome. Renomeie um deles antes de reativar.';
  end;

  return jsonb_build_object('id', p_item_id, 'ativo', p_ativo);
end;
$$;


-- 5.6 Ping (mantém o projeto "acordado") -------------------------------
--     O plano gratuito pausa o projeto após 7 dias sem uso. Na etapa 6,
--     um robô do GitHub chama esta função uma vez por semana. Ela não
--     lê nem devolve dado nenhum, por isso pode ser chamada sem login.
create or replace function public.ping()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;


-- 5.7 "Revisado por" também é definido pelo banco (mesma regra do
--     "Feito por"), mesmo sendo a única tabela em que o app grava direto.
create or replace function public.tg_revisao_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.revisado_por := nome_operador(new.revisado_por);
  new.revisado_em  := now();
  return new;
end;
$$;

create trigger atencao_revisados_autor
  before insert on public.atencao_revisados
  for each row execute function public.tg_revisao_autor();


-- =====================================================================
-- 6. VIEWS DA ABA "ATENÇÃO"
-- ---------------------------------------------------------------------
-- "security_invoker = true" é essencial: faz a view respeitar as regras
-- de acesso de quem consulta. Sem isso, a view rodaria com poderes de
-- administrador e qualquer pessoa leria tudo por ela.
-- =====================================================================

-- 6.1 Divergências entre o estoque e o histórico.
--     Estoque esperado = (última contagem física, ou 0 se nunca houve)
--                        + entradas − saídas registradas depois dela
--     (estornos não contam). Se o estoque atual for diferente disso, o
--     item aparece aqui. Depois que alguém faz a contagem pelo app, a
--     contagem vira o novo ponto de partida e a divergência some.
create view public.v_divergencias
with (security_invoker = true) as
with ultima_contagem as (
  select distinct on (item_id) item_id, data_hora, saldo_posterior
  from public.movimentacoes
  where tipo = 'Ajuste' and estornado_em is null
  order by item_id, data_hora desc
),
calculo as (
  select
    i.id,
    i.nome,
    i.categoria,
    i.unidade,
    i.estoque_atual,
    uc.data_hora as ultima_contagem_em,
    coalesce(uc.saldo_posterior, 0)
      + coalesce(sum(case m.tipo when 'Entrada' then m.quantidade
                                 when 'Saída'   then -m.quantidade
                                 else 0 end), 0) as estoque_pelo_historico
  from public.itens i
  left join ultima_contagem uc on uc.item_id = i.id
  left join public.movimentacoes m
         on m.item_id = i.id
        and m.tipo in ('Entrada', 'Saída')
        and m.estornado_em is null
        and (uc.data_hora is null or m.data_hora > uc.data_hora)
  where i.ativo
  group by i.id, uc.data_hora, uc.saldo_posterior
)
select *, estoque_atual - estoque_pelo_historico as diferenca
from calculo
where estoque_atual <> estoque_pelo_historico;

-- 6.2 Possíveis registros duplicados: mesmo item, mesmo tipo, mesma
--     quantidade, com até 15 segundos de diferença. Daqui para frente a
--     chave_cliente já impede isso; a view serve principalmente para os
--     casos herdados da planilha.
create view public.v_possiveis_duplicadas
with (security_invoker = true) as
select
  b.id         as mov_id,
  a.id         as mov_original_id,
  b.data_hora,
  a.data_hora  as data_hora_original,
  b.item_id,
  b.item_nome,
  b.tipo,
  b.quantidade,
  b.feito_por,
  b.entregue_a,
  round(extract(epoch from (b.data_hora - a.data_hora))::numeric, 1) as segundos_depois
from public.movimentacoes a
join public.movimentacoes b
  on  b.item_id    = a.item_id
  and b.tipo       = a.tipo
  and b.quantidade = a.quantidade
  and b.id        <> a.id
  and b.data_hora  > a.data_hora
  and b.data_hora <= a.data_hora + interval '15 seconds'
where a.tipo in ('Entrada', 'Saída')
  and a.estornado_em is null
  and b.estornado_em is null
  and not exists (
    select 1 from public.atencao_revisados r
    where r.tipo = 'duplicada' and r.referencia = b.id
  );


-- =====================================================================
-- 7. REGRAS DE ACESSO (RLS — Row Level Security)
-- =====================================================================
alter table public.categorias        enable row level security;
alter table public.autorizados       enable row level security;
alter table public.itens             enable row level security;
alter table public.movimentacoes     enable row level security;
alter table public.atencao_revisados enable row level security;

create policy "autorizados leem categorias" on public.categorias
  for select to authenticated using (public.eh_autorizado());

-- cada usuário só enxerga a própria linha (o app usa isso para
-- confirmar, logo após o login, que a conta está liberada)
create policy "usuario ve a propria autorizacao" on public.autorizados
  for select to authenticated using (user_id = auth.uid());

create policy "autorizados leem itens" on public.itens
  for select to authenticated using (public.eh_autorizado());

create policy "autorizados editam itens" on public.itens
  for update to authenticated
  using (public.eh_autorizado()) with check (public.eh_autorizado());

create policy "autorizados leem movimentacoes" on public.movimentacoes
  for select to authenticated using (public.eh_autorizado());

create policy "autorizados leem revisoes" on public.atencao_revisados
  for select to authenticated using (public.eh_autorizado());

create policy "autorizados registram revisoes" on public.atencao_revisados
  for insert to authenticated with check (public.eh_autorizado());

create policy "autorizados desfazem revisoes" on public.atencao_revisados
  for delete to authenticated using (public.eh_autorizado());


-- =====================================================================
-- 8. PERMISSÕES (o que cada papel pode fazer)
-- ---------------------------------------------------------------------
-- O Supabase dá, por padrão, permissões amplas para "anon" (visitante
-- sem login) e "authenticated" (logado). Aqui tudo é retirado e só o
-- necessário é devolvido. Destaque: em "itens", o app logado só pode
-- alterar nome, categoria, unidade e mínimo — NUNCA o estoque_atual,
-- que só muda pelas funções da seção 5.
-- =====================================================================
-- Projeto criado com "Automatically expose new tables" DESMARCADO:
-- nada é liberado automaticamente. Esta linha só permite que o app
-- "enxergue" o schema public; o que ele pode ler ou executar dentro
-- dele continua definido, item por item, logo abaixo.
grant usage on schema public to anon, authenticated;

revoke all on public.categorias, public.autorizados, public.itens,
              public.movimentacoes, public.atencao_revisados,
              public.v_divergencias, public.v_possiveis_duplicadas
  from anon, authenticated;

grant select on public.categorias, public.autorizados, public.itens,
                public.movimentacoes, public.atencao_revisados,
                public.v_divergencias, public.v_possiveis_duplicadas
  to authenticated;

grant update (nome, categoria, unidade, estoque_minimo) on public.itens to authenticated;
grant insert, delete on public.atencao_revisados to authenticated;

-- Funções: no Postgres, toda função nasce executável por qualquer um.
-- Retira de todos e devolve só para quem está logado.
revoke execute on function
  public.eh_autorizado(),
  public.nome_operador(text),
  public.tg_revisao_autor(),
  public.registrar_movimentacao(text, text, numeric, text, text, text, uuid),
  public.cadastrar_item(text, text, text, numeric, numeric, text, uuid),
  public.ajustar_estoque(text, numeric, text, text, uuid),
  public.estornar_movimentacao(text, text, text),
  public.definir_item_ativo(text, boolean),
  public.tg_itens_padronizar(),
  public.ping()
  from public, anon, authenticated;

grant execute on function
  public.eh_autorizado(),
  public.nome_operador(text),
  public.registrar_movimentacao(text, text, numeric, text, text, text, uuid),
  public.cadastrar_item(text, text, text, numeric, numeric, text, uuid),
  public.ajustar_estoque(text, numeric, text, text, uuid),
  public.estornar_movimentacao(text, text, text),
  public.definir_item_ativo(text, boolean)
  to authenticated;

-- o ping é a única coisa liberada sem login (não expõe dado nenhum)
grant execute on function public.ping() to anon, authenticated;


-- =====================================================================
-- 9. LIBERA AS TRÊS CONTAS DE LOGIN
-- ---------------------------------------------------------------------
-- As contas são criadas antes, em Authentication > Users (e-mail + PIN).
-- Aqui elas recebem nome, perfil e a liberação de acesso.
-- "on conflict ... do update" permite rodar este bloco de novo, sozinho,
-- se um dia for preciso corrigir um nome ou incluir uma conta.
-- =====================================================================
insert into public.autorizados (user_id, nome, perfil, compartilhado, ordem)
select u.id, c.nome, c.perfil, c.compartilhado, c.ordem
from auth.users u
join (values
  ('logistica@estoque-spm.app', 'Almino',       'operador', false, 1),
  ('geral@estoque-spm.app',     'Acesso geral', 'geral',    true,  2),
  ('mauriliodov2023@gmail.com', 'Maurílio',     'admin',    false, 3)
) as c(email, nome, perfil, compartilhado, ordem)
  on lower(u.email) = c.email
on conflict (user_id) do update
  set nome          = excluded.nome,
      perfil        = excluded.perfil,
      compartilhado = excluded.compartilhado,
      ordem         = excluded.ordem;


-- =====================================================================
-- 10. CONFERÊNCIA (o resultado aparece na aba "Results")
-- ---------------------------------------------------------------------
-- Esperado: 3 linhas — Almino, Acesso geral e Maurílio — cada uma com
-- seu e-mail, e em todas: categorias = 5, itens = 0, movimentacoes = 0.
-- Se vier menos de 3 linhas, algum e-mail não bate com o cadastrado em
-- Authentication > Users.
-- =====================================================================
select
  a.ordem,
  a.nome,
  a.perfil,
  a.compartilhado,
  u.email,
  (select count(*) from public.categorias)    as categorias,
  (select count(*) from public.itens)         as itens,
  (select count(*) from public.movimentacoes) as movimentacoes
from public.autorizados a
join auth.users u on u.id = a.user_id
order by a.ordem;
