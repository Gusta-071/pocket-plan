# Regras de negócio — pocket-plan

Este documento define as regras do domínio do pocket-plan. Cada regra tem um identificador (`RN-XX`) para ser referenciada no código, nos testes e nas discussões. Quando uma regra mudar, este documento deve ser atualizado junto com o código.

**Status:** proposta para revisão — 23/11/2026.

## Convenções gerais

- **RN-01 — Moeda e precisão.** Todos os valores são em reais (BRL), com precisão de centavos. Internamente, valores monetários são armazenados como números inteiros de centavos (R$ 150,50 = `15050`), para evitar erros de arredondamento.
- **RN-02 — Fuso horário e "hoje".** O sistema considera o fuso `America/Sao_Paulo`. "Hoje" é a data atual nesse fuso.
- **RN-03 — Datas sem horário.** Lançamentos, aportes e resgates têm apenas data (dia, mês e ano), sem horário.
- **RN-04 — Isolamento de dados.** Cada usuário só consulta, cria, altera ou exclui os próprios dados. O servidor identifica o usuário pela sessão autenticada e nunca por um identificador enviado pelo cliente.

## Conta de usuário

- **RN-05 — Cadastro.** O usuário informa nome (2 a 80 caracteres), e-mail e senha. A senha é digitada duas vezes, e o cadastro só prossegue se as duas forem iguais. O mesmo vale para a nova senha na recuperação (RN-09d).
- **RN-06 — E-mail único.** O e-mail é normalizado (espaços removidos e letras minúsculas) e não pode estar em uso por outra conta.
- **RN-07 — Senha.** Mínimo de 8 caracteres, com pelo menos uma letra e um número. A senha nunca é armazenada nem registrada em logs; apenas seu hash.
- **RN-08 — Sessão.** O login cria uma sessão válida por 7 dias. Sair encerra a sessão. Sem sessão válida, o usuário é levado à tela de login.
  - **RN-08a — Erro de login genérico.** E-mail inexistente e senha incorreta geram a mesma mensagem ("E-mail ou senha inválidos"), para não revelar quais e-mails estão cadastrados.
  - **RN-08b — Entrada após o cadastro.** Ao concluir o cadastro, o usuário já entra logado, sem precisar fazer login.
  - **RN-08c — Limite de tentativas.** Após 10 tentativas de login com erro para o mesmo e-mail em 15 minutos, novas tentativas para esse e-mail são recusadas até que a janela passe. A regra vale também para e-mails não cadastrados, para não revelar quais existem.
- **RN-09 — Configuração inicial.** Ao criar a conta, o sistema cria as categorias padrão (RN-15) define o início do mês financeiro no dia 1 (RN-10) e o nome do período como automático (RN-12).

### Recuperação de senha

- **RN-09a — Solicitação.** Na tela de login, o usuário informa seu e-mail e solicita a recuperação. A resposta é sempre a mesma mensagem ("Se o e-mail estiver cadastrado, você receberá um link"), exista ou não a conta, para não revelar quais e-mails estão cadastrados.
- **RN-09b — Link de redefinição.** Se a conta existir, o sistema envia ao e-mail um link com um código aleatório. O código é armazenado apenas como hash, vale por **30 minutos** e pode ser usado **uma única vez**. Uma nova solicitação invalida os códigos anteriores.
- **RN-09c — Limite de solicitações.** São permitidas no máximo 3 solicitações por e-mail a cada 15 minutos.
- **RN-09d — Nova senha.** Pelo link, o usuário define uma nova senha, seguindo RN-07 e diferente da senha atual. Após a redefinição, todas as sessões abertas da conta são encerradas e o usuário precisa entrar novamente.
- **RN-09e — Envio.** Os e-mails (de recuperação e de confirmação) são enviados por um servidor SMTP configurado no ambiente. Sem SMTP configurado (ambiente de desenvolvimento), o link é exibido no console do servidor.

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
- **RN-15 — Categorias padrão.** Toda conta nova recebe as categorias abaixo, cada uma com uma cor predefinida (RN-16a):
  - Receitas: Salário, Freelance, Renda extra, Outras receitas.
  - Despesas: Alimentação, Moradia, Transporte, Saúde, Educação, Lazer, Compras, Contas e serviços, Assinaturas, Outras despesas.
- **RN-16 — Nome.** O nome tem de 1 a 40 caracteres e é único entre as categorias do mesmo usuário e do mesmo tipo, sem diferenciar maiúsculas, minúsculas e espaços nas extremidades.
  - **RN-16a — Cor.** Toda categoria tem uma cor, escolhida em uma paleta fixa de 12 cores. A cor ajuda a reconhecer a categoria em listas e gráficos.
  - **RN-16b — Limite.** Cada usuário pode ter no máximo 30 categorias de cada tipo.
- **RN-17 — Edição.** O usuário pode criar categorias e alterar o nome e a cor de qualquer categoria, inclusive as padrão. O tipo de uma categoria não pode ser alterado depois de criada.
- **RN-18 — Exclusão.** A exclusão exige confirmação do usuário.
  - Se a categoria não tem lançamentos, ela é excluída.
  - Se tem lançamentos, o usuário escolhe outra categoria **do mesmo tipo** para recebê-los. Os lançamentos são movidos e a categoria é excluída em uma única operação: ou tudo acontece, ou nada.
  - O orçamento da categoria excluída (RN-29), se houver, é removido junto, e a confirmação avisa isso.
  - **RN-18a — Mínimo por tipo.** O usuário mantém sempre pelo menos uma categoria de receita e uma de despesa. A última categoria de um tipo não pode ser excluída, apenas editada.

## Lançamentos (receitas e despesas)

- **RN-19 — Campos.** Um lançamento tem tipo (receita ou despesa), valor, data, categoria e descrição opcional (até 120 caracteres).
- **RN-20 — Valor.** Maior que zero e no máximo R$ 10.000.000,00 por lançamento.
- **RN-21 — Categoria compatível.** A categoria é obrigatória, deve pertencer ao usuário e ser do mesmo tipo do lançamento.
- **RN-22 — Situação: previsto ou realizado.** A situação é definida pela data:
  - data **até hoje** → **realizado**;
  - data **depois de hoje** → **previsto**.

  Quando a data de um lançamento previsto chega, ele passa a ser realizado automaticamente, sem ação do usuário. A situação é sempre calculada, nunca armazenada.
- **RN-23 — Limite de datas.** Lançamentos podem ter data até 12 meses após hoje. Datas anteriores a 01/01/2000 não são aceitas, para evitar erros de digitação.
- **RN-24 — Edição.** Todos os campos de um lançamento, previsto ou realizado, podem ser editados, com as mesmas validações da criação. Ao alterar a data, a situação é recalculada (RN-22).
- **RN-25 — Exclusão.** A exclusão é definitiva e exige confirmação do usuário.
- **RN-25a — Duplicar.** O usuário pode duplicar um lançamento: o formulário abre preenchido com os dados do original, para ajuste antes de salvar. A cópia segue as mesmas validações da criação.
- **RN-25b — Repetir mensalmente.** O usuário pode repetir um lançamento nos meses seguintes, de 1 a 12 vezes. Cada cópia mantém tipo, valor, categoria e descrição, com a data no mesmo dia dos meses seguintes. Se o dia não existir no mês de destino (ex.: 31 em abril, 29 a 31 em fevereiro), usa-se o último dia desse mês.
- **RN-25c — Cópias independentes.** Lançamentos duplicados ou repetidos são independentes do original: editar ou excluir um deles não afeta os demais.
- **RN-25d — Repetição atômica.** Se alguma cópia violar uma regra (por exemplo, ultrapassar o limite de RN-23), nenhuma cópia é criada, e o usuário é informado de quantas repetições são possíveis.

## Resultado do período

- **RN-26 — Resultado realizado.** Resultado = receitas realizadas − despesas realizadas do período financeiro. Pode ser negativo. Não representa saldo bancário.
- **RN-27 — Resultado projetado.** Resultado projetado = resultado realizado + receitas previstas − despesas previstas do período. É exibido separadamente do resultado realizado.
- **RN-28 — Aportes não são despesas.** Aportes e resgates de investimentos não entram em receitas nem em despesas. São exibidos à parte, como "investido no período".

## Orçamento por categoria

- **RN-29 — Definição.** O usuário pode definir um limite mensal (valor > 0) para uma categoria de **despesa**.
- **RN-30 — Vigência.** O limite passa a valer a partir do período financeiro em que foi definido e se repete nos períodos seguintes até ser alterado ou removido. Alterações valem do período atual em diante; períodos anteriores mantêm o limite que tinham.
- **RN-31 — Consumo.** Consumido = soma das despesas **realizadas** da categoria no período. Comprometido = soma das despesas **previstas** da categoria no período. Disponível = limite − consumido − comprometido (pode ser negativo).
- **RN-32 — Alertas.** A categoria é sinalizada como **atenção** quando consumido + comprometido atinge 80% do limite e como **estourada** quando ultrapassa 100%.

## Meta de economia

- **RN-33 — Definição.** O usuário pode definir uma meta de economia por período (valor > 0). A vigência segue a mesma regra do orçamento (RN-30).
- **RN-34 — Avaliação.** A meta é **atingida** quando o resultado realizado do período (RN-26) é maior ou igual à meta. Durante o período, o sistema mostra também se o resultado projetado (RN-27) atinge a meta.

## Investimentos

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
- **RN-45 — Tema.** O usuário escolhe o tema da interface: **claro**, **escuro** ou **automático** (segue o tema do aparelho). O padrão é automático. A escolha fica salva na conta e vale em todos os aparelhos.
- **RN-46 — Sair de todos os aparelhos.** O usuário pode encerrar todas as sessões da conta, inclusive a atual.
- **RN-47 — Exclusão da conta.** O usuário pode excluir a própria conta, informando a senha atual e confirmando a ação. A exclusão é definitiva: apaga a conta e todos os seus dados (categorias, lançamentos, orçamentos, metas e investimentos) e encerra todas as sessões.

## Decisões adiadas

- **Alteração de e-mail (RN-42).** Exigiria confirmar o novo endereço; fica para depois.
- **Recorrência automática.** Séries recorrentes (em que alterar uma ocorrência pode alterar as demais) ficam para depois. Nesta entrega, despesas e receitas fixas são cobertas por duplicar e repetir (RN-25a a RN-25d).
- **CDI histórico (RN-38).** Se o cálculo dia a dia se mostrar complexo demais para o prazo, a alternativa é aplicar a taxa anual atual do CDI (série 4389) a todo o período, documentando a simplificação.
