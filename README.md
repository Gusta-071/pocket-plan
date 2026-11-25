# pocket-plan

[![CI](https://github.com/Gusta-071/pocket-plan/actions/workflows/ci.yml/badge.svg)](https://github.com/Gusta-071/pocket-plan/actions/workflows/ci.yml)

Aplicação web de controle e planejamento financeiro pessoal, pensada primeiro para o celular: receitas e despesas, contas do mês, cartões de crédito com faturas e parcelamento, orçamento por categoria e metas.

Projeto da disciplina de Engenharia de Software — UNIFESP, 2º semestre de 2026.

As regras de negócio estão em [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md): cada regra tem um identificador (`RN-XX`), citado no código e nos testes.

## Funcionalidades

| Área | O que faz |
| --- | --- |
| Conta | Cadastro com confirmação de e-mail, login, recuperação de senha, sair de todos os aparelhos, excluir a conta |
| Mês financeiro | O mês pode começar em qualquer dia de 1 a 28 (ex.: dia do salário), com o nome do período configurável |
| Lançamentos | Receitas e despesas com categoria, forma de pagamento e situação (pago/pendente); duplicar e repetir nos meses seguintes |
| Categorias | De receita e de despesa; as de despesa têm classe: fixa, variável ou investimento |
| Formas de pagamento | Pix, débito, crédito, dinheiro, boleto e formas criadas pelo usuário |
| Cartões de crédito | Fatura calculada pelo dia de fechamento, pagamento da fatura inteira, limite usado e disponível, parcelamento de 2 a 480 vezes |
| Contas do mês | Checklist do que vence no mês (faturas como um item só), progresso e atrasadas de meses anteriores |
| Orçamento e metas | Limite por categoria e por classe com alertas, meta de economia e meta de investimento |
| Painel | Resultado, saldo acumulado, gastos do mês × a pagar no mês, metas, orçamento, gastos por categoria e por forma de pagamento, comparação com o mês anterior |
| Assistente | Lançar conversando ("paguei 45 no almoço"), com um modelo de linguagem local; nada é salvo sem confirmação |

O que ficou para depois está em [Decisões adiadas](docs/REGRAS-DE-NEGOCIO.md#decisões-adiadas) e nas [issues abertas](https://github.com/Gusta-071/pocket-plan/issues).

## Como rodar

Pré-requisito: Node.js 22 ou superior.

```sh
npm install
cp .env.example .env      # no Windows: copy .env.example .env
npm run db:generate       # gera o cliente do Prisma
npm run db:deploy         # cria o banco SQLite e aplica as migrations
npm run db:seed           # opcional: cria a conta de demonstração
npm run dev
```

Abra http://localhost:5173. A API roda em http://localhost:3333, e o Vite encaminha as chamadas `/api` para ela.

- **Conta de demonstração:** depois do `db:seed`, entre com **demo@pocket-plan.local** / **demo1234**. Ela tem 8 meses de lançamentos, dois cartões com faturas, dois parcelamentos, limites de orçamento, metas e algumas contas atrasadas. Rodar o `db:seed` de novo recria a conta do zero.
- **E-mail:** sem `SMTP_HOST` no `.env`, os e-mails (confirmação de conta e redefinição de senha) não são enviados: o link aparece no console da API.
- **Assistente:** usa um modelo local pelo [Ollama](https://ollama.com). Com o Ollama aberto, baixe o modelo uma vez com `ollama pull qwen2.5:1.5b-instruct`. Sem ele, o resto do app funciona e o assistente aparece desativado.
- **Depois de um `git pull`** que traga migrations novas, rode `npm install`, `npm run db:deploy` e `npm run db:generate`.

## Testes

```sh
npm test          # só os testes
npm run verify    # tipos da API e da interface + testes (o mesmo que o CI roda)
```

São 272 testes automatizados, em dois níveis:

- **Unidade, sem banco:** as regras mais delicadas ficam em funções puras — fatura e parcelas ([shared/invoice.ts](shared/invoice.ts)), período financeiro ([shared/period.ts](shared/period.ts)), orçamento ([budgets.core.ts](server/src/modules/budgets/budgets.core.ts)) e contas do mês ([bills.core.ts](server/src/modules/bills/bills.core.ts)). Os testes delas cobrem as fronteiras: compra no próprio dia do fechamento, meses curtos, virada de ano, alerta em exatamente 80%, divisão de centavos.
- **API, com banco:** chamadas HTTP reais (Supertest) contra a aplicação, num banco SQLite próprio (`data/test.db`), recriado a cada execução — não mexe nos seus dados. Cobrem as regras de ponta a ponta, o isolamento entre usuários (RN-04) e as validações.

Os nomes dos testes citam as regras (ex.: `trocar a classe da categoria muda os totais, inclusive de períodos passados (RN-17)`).

## Arquitetura

```text
 Navegador (React)                 API (Express)                                Banco
 ─────────────────                 ─────────────                                ─────
 páginas e componentes  ── HTTP ─▶  rotas      valida a entrada (Zod)
                         /api       serviços   busca e grava ──────────────▶  SQLite
                                    núcleo     regras puras (*.core.ts)         (Prisma)
        ▲                              ▲
        └──────── shared/ ─────────────┘   regras usadas dos dois lados (período, fatura)
```

- **Um módulo por funcionalidade** em `server/src/modules/` (`entries`, `cards`, `bills`, `budgets`…), cada um com rotas, validação (`*.schemas.ts`) e serviço (`*.service.ts`).
- **Functional Core, Imperative Shell:** onde a regra é delicada, ela fica num núcleo de funções puras (`*.core.ts` e `shared/`), sem banco nem relógio. O serviço busca os dados, chama o núcleo e grava o resultado. Isso deixa as regras testáveis sem banco e reaproveitáveis.
- **Código compartilhado:** `shared/` é importado pela API e pela interface. Assim, o formulário mostra "entra na fatura que vence em 02/12" com exatamente a mesma conta que o servidor usa para gravar.
- **Dinheiro em centavos inteiros** (RN-01) e **datas sem horário** como texto `AAAA-MM-DD` (RN-03), no fuso de São Paulo (RN-02).
- **Erros padronizados:** toda regra violada responde com um código estável (ex.: `CARD_REQUIRED`) e, quando é de um campo, o campo — a interface mostra a mensagem ao lado dele.
- **Segurança:** senhas com scrypt, sessão em cookie `httpOnly`, códigos de e-mail guardados como hash e de uso único, limite de tentativas de login, e todo acesso filtrado pelo usuário da sessão (RN-04).
- **Interface mobile-first:** cada tela foi desenhada primeiro para ~360 px; no PC, as telas usam a largura em colunas.

## Estrutura

```text
server/
  src/
    app.ts              Montagem do Express (rotas e tratamento de erros)
    lib/                Prisma, erros, e-mail e criptografia
    modules/<nome>/     Uma pasta por funcionalidade: *.routes.ts, *.schemas.ts, *.service.ts e, às vezes, *.core.ts
  scripts/seed-demo.ts  Conta de demonstração
  test/                 Testes de unidade e de API
shared/                 Regras puras usadas pela API e pela interface (período financeiro, fatura e parcelas)
web/src/
  pages/                Uma página por tela
  components/           Componentes reutilizados (formulário de lançamento, janelas, campos)
  lib/                  Cliente da API, roteador, formatação de dinheiro
prisma/
  schema.prisma         Modelo do banco (com as regras citadas nos comentários)
  migrations/           Histórico de mudanças do banco
docs/                   Regras de negócio
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe API e interface juntas, recarregando ao salvar |
| `npm run build` | Gera a interface de produção em `dist/web` |
| `npm test` | Executa os testes |
| `npm run typecheck` | Verifica os tipos da API e da interface |
| `npm run verify` | Tipos + testes (rodar antes de abrir PR) |
| `npm run db:generate` | Gera o cliente do Prisma |
| `npm run db:migrate` | Cria e aplica uma migration em desenvolvimento |
| `npm run db:deploy` | Aplica as migrations existentes no banco |
| `npm run db:seed` | Cria (ou recria) a conta de demonstração |
| `npm run db:studio` | Abre o Prisma Studio para inspecionar o banco |

## Fluxo de trabalho

1. **Regra antes do código:** cada funcionalidade começa discutida e escrita em [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md).
2. **Issue:** a tarefa vira uma [issue](https://github.com/Gusta-071/pocket-plan/issues), com critérios de aceite.
3. **Branch** no padrão `tipo/descricao` (`feature/`, `fix/`, `docs/`, `chore/`) e **commits** no padrão `tipo: descrição`.
4. **Pull request** citando `Closes #N`, com o que mudou e como foi testado.
5. **CI** ([GitHub Actions](.github/workflows/ci.yml)): tipos, testes e build numa máquina limpa, em todo pull request e em todo push na `main`.
6. **Revisão** registrada no pull request, com as regras conferidas e os pontos de atenção — que viram issues quando precisam de correção.
7. **Merge** na `main` só com o CI verde.
