# Regras de negócio — pocket-plan

Este documento define as regras do domínio do pocket-plan. Cada regra tem um identificador (`RN-XX`) para ser referenciada no código, nos testes e nas discussões. Quando uma regra mudar, este documento deve ser atualizado junto com o código.

**Status:** proposta para revisão — 24/11/2026.

## Mudanças desta revisão

Resumo para quem revisa. As regras marcadas como *(planejada)* ainda não estão implementadas.

- **Situação por check (RN-22, implementada).** Pago/recebido passa a ser marcado pelo usuário, e não mais calculado pela data. Uma conta vencida e não marcada fica **atrasada** (RN-22a).
- **Classe da despesa (RN-14a).** Cada categoria de despesa passa a ser **Fixa**, **Variável** ou **Investimento**, escolhida pelo usuário e obrigatória. As categorias padrão vêm com uma classe sugerida, e entram "Reserva de emergência" e "Investimentos" (RN-15).
- **Investimentos simplificados (RN-28).** Aportes viram despesas da classe Investimento. A carteira com rendimento (RN-35 a RN-41) foi adiada.
- **Saldo acumulado (RN-28a, RN-44a, implementado).** O resultado de cada período passa para o seguinte, a partir de um saldo inicial.
- **Orçamento por classe e meta de investimento (RN-29a, RN-29b), com nível de atenção configurável (RN-32a).**
- **Categorias e nível de atenção nos ajustes; metas no painel (RN-47a).**
- **Novas seções:** Painel do período (RN-48, RN-49; implementado em parte), Contas do mês (RN-50), Cartões de crédito (RN-51 a RN-57) e Despesas compartilhadas (RN-58 a RN-65).
- **Formas de pagamento (RN-67 a RN-71) e cadastro de cartões (RN-51, RN-52, RN-57).**
- **Assistente com IA (RN-66, implementado).** Lançar receitas e despesas conversando, sempre com confirmação.
- **Ajustes ligados a essas seções:** RN-04, RN-09, RN-17, RN-18, RN-24, RN-25a, RN-25b, RN-26, RN-27, RN-31 e RN-47.

## Convenções gerais

- **RN-01 — Moeda e precisão.** Todos os valores são em reais (BRL), com precisão de centavos. Internamente, valores monetários são armazenados como números inteiros de centavos (R$ 150,50 = `15050`), para evitar erros de arredondamento.
- **RN-02 — Fuso horário e "hoje".** O sistema considera o fuso `America/Sao_Paulo`. "Hoje" é a data atual nesse fuso.
- **RN-03 — Datas sem horário.** Lançamentos, compras, faturas e acertos têm apenas data (dia, mês e ano), sem horário.
- **RN-04 — Isolamento de dados.** Cada usuário só consulta, cria, altera ou exclui os próprios dados. O servidor identifica o usuário pela sessão autenticada e nunca por um identificador enviado pelo cliente. A única exceção são os dados de grupos de despesas compartilhadas, visíveis aos membros do grupo (RN-60).

## Conta de usuário

- **RN-05 — Cadastro.** O usuário informa nome (2 a 80 caracteres), e-mail e senha. A senha é digitada duas vezes, e o cadastro só prossegue se as duas forem iguais. O mesmo vale para a nova senha na recuperação (RN-09d).
- **RN-06 — E-mail único.** O e-mail é normalizado (espaços removidos e letras minúsculas) e não pode estar em uso por outra conta.
- **RN-07 — Senha.** Mínimo de 8 caracteres, com pelo menos uma letra e um número. A senha nunca é armazenada nem registrada em logs; apenas seu hash.
- **RN-08 — Sessão.** O login cria uma sessão válida por 7 dias. Sair encerra a sessão. Sem sessão válida, o usuário é levado à tela de login.
  - **RN-08a — Erro de login genérico.** E-mail inexistente e senha incorreta geram a mesma mensagem ("E-mail ou senha inválidos"), para não revelar quais e-mails estão cadastrados.
  - **RN-08b — Entrada após o cadastro.** Ao concluir o cadastro, o usuário já entra logado, sem precisar fazer login.
  - **RN-08c — Limite de tentativas.** Após 10 tentativas de login com erro para o mesmo e-mail em 15 minutos, novas tentativas para esse e-mail são recusadas até que a janela passe. A regra vale também para e-mails não cadastrados, para não revelar quais existem.
- **RN-09 — Configuração inicial.** Ao criar a conta, o sistema cria as categorias padrão com suas classes (RN-15), define o início do mês financeiro no dia 1 (RN-10), o nome do período como automático (RN-12) e o saldo inicial como R$ 0,00 (RN-44a).

### Recuperação de senha

- **RN-09a — Solicitação.** Na tela de login, o usuário informa seu e-mail e solicita a recuperação. A resposta é sempre a mesma mensagem ("Se o e-mail estiver cadastrado, você receberá um link"), exista ou não a conta, para não revelar quais e-mails estão cadastrados.
- **RN-09b — Link de redefinição.** Se a conta existir, o sistema envia ao e-mail um link com um código aleatório. O código é armazenado apenas como hash, vale por **30 minutos** e pode ser usado **uma única vez**. Uma nova solicitação invalida os códigos anteriores.
- **RN-09c — Limite de solicitações.** São permitidas no máximo 3 solicitações por e-mail a cada 15 minutos.
- **RN-09d — Nova senha.** Pelo link, o usuário define uma nova senha, seguindo RN-07 e diferente da senha atual. Após a redefinição, todas as sessões abertas da conta são encerradas e o usuário precisa entrar novamente.
- **RN-09e — Envio.** Os e-mails (de recuperação, de confirmação e de convite) são enviados por um servidor SMTP configurado no ambiente. Sem SMTP configurado (ambiente de desenvolvimento), o link é exibido no console do servidor.

### Confirmação de e-mail

- **RN-09f — Link de confirmação.** Ao criar a conta, o sistema envia ao e-mail um link de confirmação. O código é armazenado apenas como hash, vale por **24 horas** e pode ser usado **uma única vez**. Abrir o link confirma o e-mail mesmo sem estar logado (por exemplo, no celular).
- **RN-09g — Acesso antes da confirmação.** Após o cadastro o usuário já entra logado (RN-08b), mas, enquanto o e-mail não for confirmado, vê apenas a tela "Confirme seu e-mail", com as opções de reenviar o link e de sair. As demais funcionalidades ficam bloqueadas. O mesmo vale ao entrar com uma conta ainda não confirmada.
- **RN-09h — Reenvio.** São permitidos no máximo 3 envios do link de confirmação por conta a cada 15 minutos, contando o envio do cadastro. Um novo envio invalida os links anteriores.
- **RN-09i — Confirmação pela recuperação.** Redefinir a senha pelo link recebido por e-mail (RN-09d) também confirma o e-mail, pois prova que o usuário tem acesso a ele.

## Mês financeiro

- **RN-10 — Dia de início configurável.** Cada usuário define o dia em que seu mês financeiro começa, entre **1 e 28** (padrão: 1). Dias 29 a 31 não são permitidos porque não existem em todos os meses.
- **RN-11 — Período.** Com início no dia *D*, o período financeiro vai do dia *D* de um mês até o dia *D − 1* do mês seguinte, inclusive. Exemplo com *D* = 5: de 05/11/2026 a 04/12/2026. Com *D* = 1, o período coincide com o mês do calendário.
- **RN-12 — Nome do período.** O usuário escolhe como o período é nomeado:
  - **Automático (padrão):** pelo mês que tem mais dias dentro do período. Em caso de empate, vale o mês em que o período começa. Exemplos: 05/11 a 04/12 → 26 dias em novembro e 4 em dezembro → "Novembro/2026"; 20/11 a 19/12 → 11 dias em novembro e 19 em dezembro → "Dezembro/2026"; 16/11 a 15/12 → 15 dias em cada → "Novembro/2026".
  - **Mês de início:** sempre o mês em que o período começa.
  - **Mês de término:** sempre o mês em que o período termina.

  Com início no dia 1, as três opções resultam no mesmo nome. Alterar essa opção muda apenas o nome exibido, não as datas nem os valores dos períodos.
- **RN-13 — Alteração do dia de início.** Ao alterar o dia de início, todos os períodos, inclusive os passados, passam a ser calculados com o novo dia. Nenhum lançamento é alterado, pois os totais são sempre recalculados a partir dos lançamentos.

## Categorias

- **RN-14 — Tipo.** Toda categoria é de **receita** ou de **despesa**. Não há subcategorias: as categorias têm um único nível.
  - **RN-14a — Classe da despesa.** Toda categoria de despesa tem uma classe, que agrupa os gastos para orçamento e análise:
    - **Fixa:** gastos essenciais e recorrentes (moradia, contas, escola);
    - **Variável:** gastos que mudam de um mês para o outro (mercado, lazer, compras);
    - **Investimento:** dinheiro guardado ou aplicado (RN-28).

    A classe é **obrigatória** e escolhida pelo usuário: ao criar uma categoria de despesa, nenhuma classe vem marcada, e a categoria só é salva depois que o usuário escolhe uma. Categorias de receita não têm classe.
- **RN-15 — Categorias padrão.** Toda conta nova recebe as categorias abaixo, cada uma com uma cor predefinida (RN-16a). As de despesa já vêm com uma classe sugerida, que o usuário pode trocar (RN-17):
  - Receitas: Salário, Freelance, Renda extra, Outras receitas.
  - Despesas fixas: Moradia, Saúde, Educação, Contas e serviços, Assinaturas.
  - Despesas variáveis: Alimentação, Transporte, Lazer, Compras, Outras despesas.

  - Investimento: Reserva de emergência, Investimentos.

  Nas contas criadas antes da RN-14a, as categorias padrão recebem a classe sugerida acima, e as criadas pelo usuário ficam como Variável, que ele pode trocar. Essas contas também recebem as duas categorias de Investimento; se já existir uma categoria de despesa com o mesmo nome, ela passa para a classe Investimento em vez de ser duplicada.
- **RN-16 — Nome.** O nome tem de 1 a 40 caracteres e é único entre as categorias do mesmo usuário e do mesmo tipo, sem diferenciar maiúsculas, minúsculas e espaços nas extremidades.
  - **RN-16a — Cor.** Toda categoria tem uma cor, escolhida em uma paleta fixa de 12 cores. A cor ajuda a reconhecer a categoria em listas e gráficos.
  - **RN-16b — Limite.** Cada usuário pode ter no máximo 30 categorias de cada tipo.
- **RN-17 — Edição.** O usuário pode criar categorias e alterar o nome, a cor e a classe (RN-14a) de qualquer categoria, inclusive as padrão. O tipo de uma categoria não pode ser alterado depois de criada.
  - Alterar a classe muda os totais por classe de todos os períodos, inclusive os passados, pois eles são recalculados a partir dos lançamentos (como em RN-13).
  - Ao mudar para Investimento uma categoria que tem orçamento (RN-29), o orçamento é removido, e a confirmação avisa isso. Como os totais por classe, o limite deixa de aparecer também nos períodos passados, e não volta se a categoria retornar para Fixa ou Variável.
- **RN-18 — Exclusão.** A exclusão exige confirmação do usuário.
  - Se a categoria não tem lançamentos, ela é excluída.
  - Se tem lançamentos, o usuário escolhe outra categoria **do mesmo tipo** para recebê-los. Os lançamentos são movidos e a categoria é excluída em uma única operação: ou tudo acontece, ou nada.
  - O orçamento da categoria excluída (RN-29), se houver, é removido junto, e a confirmação avisa isso.
  - Se a categoria é a categoria padrão de algum grupo (RN-64), o grupo passa a usar a categoria que recebeu os lançamentos ou, se não houve lançamentos, a primeira categoria de despesa em ordem alfabética.
  - **RN-18a — Mínimo por tipo.** O usuário mantém sempre pelo menos uma categoria de receita e uma de despesa. A última categoria de um tipo não pode ser excluída, apenas editada.

## Lançamentos (receitas e despesas)

- **RN-19 — Campos.** Um lançamento tem tipo (receita ou despesa), valor, data, categoria, situação (RN-22) e descrição opcional (até 120 caracteres). Despesas têm também a forma de pagamento (RN-67) e, quando pagas no crédito, o cartão (RN-52).
- **RN-20 — Valor.** Maior que zero e no máximo R$ 10.000.000,00 por lançamento.
- **RN-21 — Categoria compatível.** A categoria é obrigatória, deve pertencer ao usuário e ser do mesmo tipo do lançamento.
- **RN-22 — Situação: pendente ou pago.** A situação de um lançamento é marcada pelo usuário com um check:
  - despesa: **pendente** ou **paga**;
  - receita: **pendente** ou **recebida**.

  A situação é armazenada e só muda quando o usuário a altera. Ao criar um lançamento, o formulário já sugere a situação pela data: **marcado** (pago/recebido) quando a data é até hoje, e **desmarcado** (pendente) quando é futura. O usuário pode mudar antes de salvar, por exemplo para registrar uma conta já vencida que ainda não pagou ou uma conta futura que pagou adiantado.

  Compras no cartão de crédito não têm check próprio: a situação delas acompanha a fatura (RN-54).
  - **RN-22a — Atrasado.** Um lançamento pendente com data anterior a hoje é exibido como **atrasado**. Essa indicação é calculada, não armazenada.
  - **RN-22b — Marcar pela lista.** O usuário pode marcar e desmarcar um lançamento direto na lista, com um toque, sem abrir o formulário.
- **RN-23 — Limite de datas.** Lançamentos podem ter data até 12 meses após hoje. Datas anteriores a 01/01/2000 não são aceitas, para evitar erros de digitação. A única exceção são as parcelas de compras parceladas (RN-56).
- **RN-24 — Edição.** Todos os campos de um lançamento podem ser editados, inclusive a situação, com as mesmas validações da criação. Alterar a data não muda a situação.
- **RN-25 — Exclusão.** A exclusão é definitiva e exige confirmação do usuário.
- **RN-25a — Duplicar.** O usuário pode duplicar um lançamento: o formulário abre preenchido com os dados do original, para ajuste antes de salvar. A situação é sugerida pela data, como na criação (RN-22). A cópia segue as mesmas validações da criação.
- **RN-25b — Repetir mensalmente.** O usuário pode repetir um lançamento nos meses seguintes, de 1 a 12 vezes. Cada cópia mantém tipo, valor, categoria, forma de pagamento, cartão e descrição, com a data no mesmo dia dos meses seguintes. Se o dia não existir no mês de destino (ex.: 31 em abril, 29 a 31 em fevereiro), usa-se o último dia desse mês. Cada cópia recebe a situação sugerida pela sua data (RN-22): as de data futura nascem pendentes.
- **RN-25c — Cópias independentes.** Lançamentos duplicados ou repetidos são independentes do original: editar ou excluir um deles não afeta os demais.
- **RN-25d — Repetição atômica.** Se alguma cópia violar uma regra (por exemplo, ultrapassar o limite de RN-23), nenhuma cópia é criada, e o usuário é informado de quantas repetições são possíveis.

## Formas de pagamento

- **RN-67 — Forma de pagamento.** Toda despesa tem uma forma de pagamento, obrigatória, que diz como o dinheiro saiu. Receitas não têm forma de pagamento.
- **RN-68 — Formas padrão.** Toda conta tem as formas **Pix**, **Débito**, **Crédito**, **Dinheiro** e **Boleto**. Elas não podem ser renomeadas nem excluídas, porque o app depende delas (ex.: Crédito exige um cartão, RN-52).
- **RN-69 — Formas personalizadas.** O usuário pode criar outras formas (ex.: "Vale-refeição", "Transferência"), com nome de 1 a 30 caracteres, único entre todas as formas da conta, inclusive as padrão, sem diferenciar maiúsculas, minúsculas e espaços nas extremidades. Cada usuário pode ter até 10 formas personalizadas. Elas podem ser renomeadas e excluídas:
  - sem lançamentos, a forma é excluída;
  - com lançamentos, o usuário escolhe outra forma para recebê-los, menos Crédito, que exigiria um cartão. Os lançamentos são movidos e a forma é excluída numa única operação (como em RN-18).
- **RN-70 — Forma não informada.** As despesas registradas antes da RN-67 ficam com a forma **"Não informada"**. Ela não pode ser escolhida em despesas novas nem ao duplicar (RN-25a), mas é mantida ao editar outros campos de uma despesa antiga e ao repeti-la (RN-25b). O usuário pode trocá-la por uma forma de verdade a qualquer momento.
- **RN-71 — Onde aparece.** A lista de lançamentos pode ser filtrada por forma de pagamento e por cartão, e o painel mostra quanto foi gasto em cada forma no período (RN-48).

## Resultado do período

- **RN-26 — Resultado realizado.** Resultado = receitas **recebidas** − despesas **pagas** do período financeiro, considerando a data dos lançamentos. Pode ser negativo. Despesas de todas as classes entram no cálculo, inclusive Investimento (RN-28).
- **RN-27 — Resultado projetado.** Resultado projetado = resultado realizado + receitas pendentes − despesas pendentes do período. É exibido separadamente do resultado realizado.
- **RN-28 — Investimentos.** *(substitui "aportes não são despesas")* Um aporte é registrado como despesa em uma categoria da classe Investimento. Ele entra no resultado (RN-26), porque é dinheiro que deixou de estar disponível. Nos totais do período, porém, aparece à parte, como **investido no período**, e não se soma aos gastos fixos e variáveis.
  - **RN-28a — Saldo acumulado.** O resultado de um período passa para o seguinte:
    - **saldo anterior** de um período = saldo acumulado ao fim do período anterior;
    - **saldo acumulado** = saldo inicial (RN-44a) + receitas recebidas − despesas pagas de todos os lançamentos com data até o fim do período;
    - **saldo acumulado projetado** = saldo acumulado + receitas pendentes − despesas pendentes com data até o fim do período, incluindo as atrasadas de períodos anteriores.

    O saldo é sempre recalculado a partir dos lançamentos: marcar como paga uma conta antiga muda o saldo do período dela e dos seguintes. Ele não representa o saldo bancário, mas se aproxima dele quando o saldo inicial é o saldo da conta no início do uso do app.

## Orçamento

- **RN-29 — Orçamento por categoria.** O usuário pode definir um limite mensal (valor > 0) para uma categoria de despesa das classes Fixa ou Variável.
  - **RN-29a — Orçamento por classe.** O usuário pode definir também um limite mensal para cada uma das classes **Fixa** e **Variável**, que soma todas as categorias da classe. Os limites das categorias e da classe são independentes. Se a soma dos limites das categorias de uma classe passar do limite da classe, o sistema avisa, mas permite.
  - **RN-29b — Meta de investimento.** Para a classe Investimento, o valor não é um teto, e sim uma meta mínima: quanto o usuário quer investir por período. A meta é **atingida** quando as despesas pagas da classe no período chegam ao valor da meta. Durante o período, o sistema mostra quanto falta.
- **RN-30 — Vigência.** O limite (ou a meta) passa a valer a partir do período financeiro em que foi definido e se repete nos períodos seguintes até ser alterado ou removido. Alterações valem do período atual em diante; períodos anteriores mantêm o valor que tinham.
- **RN-31 — Consumo.** Para uma categoria ou classe, no período:
  - consumido = soma das despesas **pagas**;
  - comprometido = soma das despesas **pendentes**, incluindo compras no cartão de faturas ainda não pagas;
  - disponível = limite − consumido − comprometido (pode ser negativo).
- **RN-32 — Alertas.** Uma categoria ou classe com limite é sinalizada como **atenção** quando consumido + comprometido atinge o nível de atenção e como **estourada** quando ultrapassa 100% do limite.
  - **RN-32a — Nível de atenção.** O nível de atenção é definido pelo usuário nas configurações, em porcentagem do limite, de 0% a 100% (padrão 80%). É uma porcentagem, e não um valor, para que um único ajuste sirva a limites de tamanhos diferentes. O estouro é sempre ao passar de 100%, porque significa ter gastado além do limite. Os mesmos níveis valem para o limite dos cartões (RN-55).

## Meta de economia

- **RN-33 — Definição.** O usuário pode definir uma meta de economia por período (valor > 0). A vigência segue a mesma regra do orçamento (RN-30).
- **RN-34 — Avaliação.** A meta é **atingida** quando o resultado realizado do período (RN-26) é maior ou igual à meta. Durante o período, o sistema mostra também se o resultado projetado (RN-27) atinge a meta.

## Painel do período

- **RN-48 — Painel.** A tela inicial mostra o período atual, com navegação para os anteriores e os seguintes (como na lista de lançamentos):
  - saldo anterior, receitas, gastos fixos, gastos variáveis, investido, resultado realizado e projetado, e saldo acumulado (RN-26 a RN-28a);
  - meta de economia (RN-34) e meta de investimento (RN-29b);
  - para cada classe e cada categoria com limite: consumido, comprometido e disponível, com os alertas de RN-32;
  - gastos por categoria, inclusive as sem limite, do maior para o menor;
  - gastos por forma de pagamento (RN-71);
  - total pendente do período e quantidade de contas atrasadas (RN-22a), com o progresso das contas e um atalho para as Contas do mês (RN-50, RN-50a).
- **RN-49 — Comparação com o período anterior.** Para cada categoria e classe de despesa, o painel compara o gasto do período com o do período anterior, em reais e em porcentagem. Se o período anterior não teve gasto, mostra "novo" em vez da porcentagem.
  - A comparação considera todas as despesas pela data, pagas ou pendentes, porque mede o quanto se gastou, e não o quanto já saiu da conta.
  - No período atual, que ainda não terminou, a comparação usa o período anterior até o mesmo dia (ex.: os 10 primeiros dias de cada um). Períodos já encerrados são comparados inteiros.

## Contas do mês

- **RN-50 — Checklist.** A aba Contas do mês, na navegação principal, mostra as despesas do período escolhido em forma de checklist, ordenadas pela data: primeiro as **pendentes** (as atrasadas, RN-22a, destacadas), depois as **pagas**, riscadas. O usuário marca e desmarca com um toque (RN-22b).
  - **RN-50a — Progresso.** O topo mostra quantas despesas do período estão pagas e quanto falta pagar (ex.: "8 de 10 contas pagas · falta pagar R$ 450,00"). O progresso conta só despesas: é a lista das contas a pagar.
  - **RN-50b — A receber.** Receitas pendentes do período (ex.: salário lançado com antecedência, um pagamento que alguém ainda deve) aparecem numa seção à parte, "A receber", com o total. Sem receitas pendentes, a seção não aparece.
  - **RN-50c — Atrasadas de meses anteriores.** No período atual, as despesas e receitas pendentes de períodos anteriores aparecem num aviso recolhível ("3 contas atrasadas de meses anteriores"), e não misturadas à lista do mês, até serem marcadas. Ao navegar para um período passado, a tela mostra as contas daquele período, com as que ficaram pendentes marcadas como atrasadas.
  - **RN-50d — Compras no cartão.** Enquanto as faturas (RN-53, RN-54) não existem, as compras no cartão aparecem uma a uma, como as demais despesas. Com as faturas, cada fatura que vence no período passa a aparecer como um único item, com o valor total e o check da fatura.

  O painel mostra o mesmo progresso no bloco de contas, com um atalho para esta aba (RN-48).

## Cartões de crédito *(em parte: cadastro e escolha do cartão; faturas, limite e parcelamento planejados)*

- **RN-51 — Cadastro.** Um cartão tem nome (1 a 30 caracteres, único entre os cartões do usuário), limite (valor > 0, até o máximo de RN-20), dia de fechamento (1 a 31), dia de vencimento (1 a 31) e cor da paleta (RN-16a). Cada usuário pode ter até 10 cartões. Nos meses em que o dia de fechamento ou de vencimento não existe, usa-se o último dia do mês. Os cartões são gerenciados nas configurações da conta (RN-47a). O limite e as datas já são pedidos no cadastro, embora só sejam usados nas faturas (RN-53 a RN-55).
- **RN-52 — Compra no cartão.** Uma despesa com a forma de pagamento **Crédito** (RN-67) exige um cartão do usuário que não esteja arquivado (RN-57); as demais formas não têm cartão. Ao editar uma compra antiga feita num cartão que depois foi arquivado, o cartão é mantido. Receitas não podem ter cartão. A compra conta no orçamento e nos gastos pela data da compra, como qualquer despesa.
- **RN-53 — Fatura.** Cada cartão tem uma fatura por mês, identificada pelo mês de vencimento. A compra entra na fatura que fecha depois da data da compra: compras feitas **no dia do fechamento ou depois** vão para a fatura seguinte. A fatura vence no dia de vencimento do mesmo mês do fechamento se esse dia for depois do fechamento, ou do mês seguinte caso contrário.

  Exemplo: cartão que fecha dia 25 e vence dia 2. Uma compra em 24/11 entra na fatura que fecha em 25/11 e vence em 02/12. Uma compra em 25/11 vai para a fatura que fecha em 25/12 e vence em 02/01.
- **RN-54 — Pagar a fatura.** O check fica na fatura, e não em cada compra. Marcar a fatura como paga marca como pagas todas as compras e parcelas dela, e desmarcar volta todas para pendente. Se uma compra for registrada em uma fatura já paga, a fatura volta a ficar pendente, e o sistema avisa.
- **RN-55 — Limite do cartão.** Utilizado = soma das compras e parcelas de faturas não pagas, inclusive as parcelas futuras. Disponível = limite − utilizado (pode ser negativo). O cartão é sinalizado como **atenção** e **estourado** pelos mesmos níveis do orçamento (RN-32a).
- **RN-56 — Parcelamento.** Uma compra no cartão pode ser parcelada de 2 a 24 vezes. O usuário informa o valor total, e o sistema cria uma parcela por mês:
  - valor de cada parcela = total ÷ número de parcelas, em centavos; os centavos que sobram da divisão vão para a primeira parcela (R$ 100,00 em 3x = R$ 33,34 + R$ 33,33 + R$ 33,33);
  - a parcela *i* tem a data da compra mais *i* − 1 meses (com a regra de último dia de RN-25b) e entra na fatura correspondente a essa data (RN-53);
  - a descrição recebe a indicação da parcela, ex.: "Geladeira (3/10)";
  - as parcelas podem passar do limite de 12 meses de RN-23.
  - **RN-56a — Parcelas ligadas.** As parcelas de uma compra formam um parcelamento e são editadas em conjunto: alterar a categoria ou a descrição de uma parcela altera todas. Para mudar valor, número de parcelas, data ou cartão, o usuário exclui o parcelamento e o registra de novo. Excluir uma parcela exclui o parcelamento inteiro, inclusive as parcelas de faturas já pagas, com confirmação.
- **RN-57 — Arquivar cartão.** Um cartão sem compras pode ser excluído. Um cartão com compras não pode ser excluído, apenas **arquivado**: deixa de aparecer para novas compras, mas mantém o histórico e as faturas. Um cartão arquivado pode ser reativado.

## Despesas compartilhadas *(planejada)*

- **RN-58 — Grupo.** O usuário pode criar grupos para dividir despesas com outras pessoas (ex.: "Casa", "Viagem para a praia"). Um grupo tem nome (1 a 40 caracteres) e até 20 membros. Quem cria o grupo é o **administrador**. Cada usuário pode participar de até 20 grupos.
- **RN-59 — Convite.** Qualquer membro pode convidar pessoas pelo e-mail.
  - O convidado recebe um link que vale por **7 dias** e pode ser usado uma única vez. Se ainda não tem conta, faz o cadastro normal (RN-05) e entra no grupo depois de confirmar o e-mail.
  - O convite só pode ser aceito pela conta com o e-mail convidado.
  - Convites pendentes podem ser cancelados por qualquer membro.
- **RN-60 — Visibilidade.** Os membros de um grupo veem o nome dos outros membros e todas as despesas, acertos e saldos do grupo. Ninguém vê as finanças pessoais dos outros membros (lançamentos, categorias, orçamentos, cartões).
- **RN-61 — Despesa compartilhada.** Uma despesa do grupo tem descrição (1 a 120 caracteres), valor (RN-20), data (RN-23), quem pagou (um membro) e os participantes (um ou mais membros, podendo ou não incluir quem pagou). A divisão entre os participantes pode ser:
  - **igual:** os centavos que sobram da divisão vão, um a um, para os primeiros participantes em ordem alfabética;
  - **por valores:** a soma das partes deve ser igual ao valor total;
  - **por porcentagem:** a soma deve ser 100%, com até duas casas decimais; os centavos que sobram seguem a regra da divisão igual.

  Qualquer membro pode criar, editar e excluir despesas do grupo. A despesa mostra quem a criou e quem a alterou por último. A exclusão exige confirmação.
- **RN-62 — Saldos.** O saldo de cada membro no grupo = total que pagou − soma das suas partes + acertos que fez − acertos que recebeu. Saldo positivo: o membro tem a receber; negativo: tem a pagar. A soma dos saldos do grupo é sempre zero. O grupo mostra também **quem deve a quem**, com o menor número possível de pagamentos para zerar todos os saldos.
- **RN-63 — Acerto.** Um membro registra que pagou um valor (> 0) a outro membro, com data. Quem pagou ou quem recebeu pode registrar o acerto, e qualquer um dos dois pode excluí-lo, com confirmação. O acerto altera apenas os saldos do grupo.
- **RN-64 — Ligação com as finanças pessoais.** A parte de cada participante em uma despesa do grupo vira, automaticamente, um lançamento de despesa nas finanças pessoais dele:
  - com a data da despesa, o valor da parte, a descrição "Nome do grupo: descrição" e a situação **paga**;
  - na categoria padrão que o membro escolheu para o grupo (inicialmente, Outras despesas ou a primeira categoria de despesa em ordem alfabética). O membro pode trocar a categoria do próprio lançamento;
  - os demais campos só mudam pelo grupo: editar ou excluir a despesa compartilhada atualiza ou remove os lançamentos ligados.

  Assim, cada um vê no orçamento só a própria parte. O que um membro pagou pelos outros e os acertos não são receitas nem despesas pessoais: ficam controlados nos saldos do grupo.
- **RN-65 — Sair, remover e excluir.**
  - Um membro só pode sair do grupo com saldo zero. O administrador pode remover membros com saldo zero. Se o administrador sair, o membro mais antigo passa a ser o administrador.
  - O administrador pode excluir o grupo quando todos os saldos estão zerados. A exclusão apaga despesas e acertos do grupo, com confirmação.
  - Ao sair ou ao excluir o grupo, os lançamentos pessoais ligados (RN-64) continuam existindo como lançamentos comuns, sem ligação.
  - Nas despesas antigas do grupo, quem saiu aparece como "Ex-membro".

## Assistente com IA

- **RN-66 — Lançar conversando.** No painel, o usuário descreve receitas e despesas em texto livre ("paguei 45 no almoço", "aluguei uma casa por R$ 2.000 todo dia 10"), e um modelo de linguagem local propõe os lançamentos correspondentes: tipo, valor, data, categoria, descrição, situação (RN-22) e quantas vezes repetir (RN-25b). Se faltar algo essencial, como o valor, o assistente pergunta em vez de inventar.
  - **RN-66a — Nada sem confirmação.** O assistente só propõe. Cada proposta aparece com os detalhes e os botões Salvar e Descartar, e só é salva quando o usuário confirma, pelas mesmas validações do formulário (RN-19 a RN-25d).
  - **RN-66b — Propostas conferidas.** Antes de mostrar, o sistema confere cada proposta: o valor precisa estar escrito na conversa (se não estiver, a proposta é descartada e o assistente pergunta o valor, para que nada seja inventado); valor e data fora dos limites (RN-20, RN-23) descartam a proposta, e o usuário é avisado de quantas foram descartadas; categoria inexistente, de outro usuário ou do tipo errado (RN-21) é trocada pela categoria "Outras" do tipo; se o usuário já tem um lançamento com a mesma descrição, a categoria dele é usada; repetições que passariam do limite de datas são reduzidas às que cabem.
  - **RN-66e — Conversão feita pelo sistema.** O modelo só interpreta a frase: tipo, valor em reais, a expressão de data, a categoria (escolhida entre as do usuário), a descrição, se foi dito que está pago e quantas vezes repete. O sistema converte o resto de forma exata: o valor em centavos; "hoje", "ontem", "anteontem", "amanhã", "DD/MM" e "dia N" em datas ("dia N" de algo que se repete e cujo dia já passou neste mês começa no mês seguinte; de um gasto único, é o dia N deste mês); e a situação: com um lançamento só na mensagem, expressões claras como "ainda não paguei", "vence" e "vou pagar" (pendente) ou "paguei" e "recebi" (pago) valem sobre o que o modelo entendeu; sem informação, vale a sugestão pela data (RN-22).
  - **RN-66c — Limite de uso.** Cada usuário pode enviar até 20 mensagens ao assistente a cada 10 minutos.
  - **RN-66d — Privacidade.** A conversa fica só no navegador e não é armazenada pelo pocket-plan. As mensagens, a data de hoje e os nomes das categorias do usuário são interpretados por um modelo de linguagem pequeno que roda no próprio servidor (Ollama), sem envio a serviços externos. Sem o modelo local disponível, o assistente aparece desativado e a interface explica o que falta.

## Investimentos *(adiada)*

Nesta entrega, investimentos são tratados de forma simplificada, como despesas da classe Investimento (RN-28) com meta mensal (RN-29b). As regras abaixo descrevem a carteira com cálculo de rendimento, que fica para depois.

- **RN-35 — Cadastro.** Um investimento tem nome (1 a 60 caracteres), data de início, aporte inicial (> 0) e tipo de rendimento:
  - **Prefixado:** taxa anual fixa informada pelo usuário (maior que 0% e até 100% ao ano);
  - **Pós-fixado (CDI):** percentual do CDI informado pelo usuário (maior que 0% e até 300% do CDI).
- **RN-36 — Aportes e resgates.** O usuário pode registrar aportes e resgates (valor > 0 e data igual ou posterior à data de início do investimento, até hoje). Um resgate não pode ser maior que o saldo estimado na data do resgate.
- **RN-37 — Rendimento prefixado.** Composto diariamente por dias corridos: taxa diária = (1 + taxa anual)^(1/365) − 1.
- **RN-38 — Rendimento pós-fixado (CDI histórico).** O rendimento usa a taxa **real de cada dia**: para cada dia útil desde o aporte, o saldo é multiplicado por (1 + CDI do dia × percentual do CDI). Os valores diários vêm da API pública do Banco Central (SGS, série 12 — CDI diário). Dias sem CDI publicado (fins de semana e feriados) não rendem.
- **RN-38a — Atualização do CDI.** As taxas diárias são armazenadas no banco e atualizadas no máximo uma vez por dia, buscando apenas as datas que faltam. Se a consulta falhar, o cálculo usa as taxas já armazenadas, e a interface informa a data da última taxa disponível.
- **RN-39 — Saldo e projeção.** O sistema mostra, para cada investimento e no total: valor aplicado (aportes − resgates), saldo estimado hoje, rendimento estimado e projeção do saldo em 6 e 12 meses. Na projeção de pós-fixados, usa-se a última taxa diária disponível, considerando 21 dias úteis por mês.
- **RN-40 — Valores brutos.** Os valores são estimativas brutas: não consideram imposto de renda, IOF nem taxas. A interface deve deixar isso claro.
- **RN-41 — Exclusão.** Excluir um investimento exclui também seus aportes e resgates, mediante confirmação.

## Configurações da conta

- **RN-42 — Nome.** O usuário pode alterar o nome a qualquer momento, com as mesmas regras do cadastro (RN-05). O e-mail é exibido, mas não pode ser alterado nesta entrega.
- **RN-43 — Alteração de senha.** Para alterar a senha, o usuário informa a senha atual e a nova duas vezes. A nova senha segue RN-07 e deve ser diferente da atual. Após a alteração, as demais sessões da conta são encerradas; a sessão em uso continua ativa.
- **RN-44 — Mês financeiro.** O dia de início (RN-10) e o nome do período (RN-12) são alterados nas configurações, que mostram uma prévia do período atual com a opção escolhida.
  - **RN-44a — Saldo inicial.** O usuário pode informar um saldo inicial (padrão: R$ 0,00; pode ser negativo, com o mesmo limite de valor de RN-20), usado como ponto de partida do saldo acumulado (RN-28a). Alterá-lo recalcula o saldo de todos os períodos.
- **RN-45 — Tema.** O usuário escolhe o tema da interface: **claro**, **escuro** ou **automático** (segue o tema do aparelho). O padrão é automático. A escolha fica salva na conta e vale em todos os aparelhos.
- **RN-46 — Sair de todos os aparelhos.** O usuário pode encerrar todas as sessões da conta, inclusive a atual.
- **RN-47 — Exclusão da conta.** O usuário pode excluir a própria conta, informando a senha atual e confirmando a ação. A exclusão é definitiva: apaga a conta e todos os seus dados (categorias, lançamentos, orçamentos, metas e cartões) e encerra todas as sessões.
  - Se o usuário tem saldo diferente de zero em algum grupo (RN-62), a exclusão é recusada, e o sistema indica quais grupos precisam ser acertados.
  - Com os saldos zerados, o usuário sai de todos os grupos, como em RN-65.
- **RN-47a — Categorias nos ajustes.** As categorias (RN-14 a RN-18) são gerenciadas dentro das configurações da conta, e não na navegação principal, porque são definidas uma vez e mudam pouco. O mesmo vale para o nível de atenção (RN-32a). Já as metas (RN-29b, RN-33), que o usuário ajusta com frequência, são editadas direto no painel. Para chegar às categorias sem passar pelos ajustes, há um atalho no campo de categoria do lançamento e nos gastos por categoria do painel.

## Decisões adiadas

- **Alteração de e-mail (RN-42).** Exigiria confirmar o novo endereço; fica para depois.
- **Recorrência automática.** Séries recorrentes (em que alterar uma ocorrência pode alterar as demais) ficam para depois. Nesta entrega, despesas e receitas fixas são cobertas por duplicar e repetir (RN-25a a RN-25d).
- **Carteira de investimentos (RN-35 a RN-41).** Fica para depois. Se for retomada e o CDI histórico (RN-38) se mostrar complexo demais para o prazo, a alternativa é aplicar a taxa anual atual do CDI (série 4389) a todo o período, documentando a simplificação.
- **Importar fatura e extrato.** A entrada automática de lançamentos fica para depois. Pela ordem de viabilidade:
  - arquivos CSV ou OFX exportados pelos bancos;
  - PDF da fatura, com extração por IA e revisão do usuário antes de salvar;
  - notificações do celular, que exigiriam um app nativo ou integração com Open Finance.
