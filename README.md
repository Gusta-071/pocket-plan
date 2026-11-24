# pocket-plan

Aplicação web de controle e planejamento financeiro pessoal: receitas e despesas, orçamento por categoria, meta de economia e acompanhamento de investimentos.

Projeto da disciplina de Engenharia de Software — UNIFESP, 2º semestre de 2026.

As regras do domínio estão em [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md).

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Interface | React + TypeScript, com Vite |
| API | Node.js + Express + TypeScript |
| Banco de dados | SQLite, acessado pelo Prisma |
| Validação | Zod |
| Testes | Vitest + Supertest |

## Como rodar

Pré-requisito: Node.js 22 ou superior.

```sh
npm install
cp .env.example .env      # no Windows: copy .env.example .env
npm run db:generate
npm run db:deploy         # cria o banco e aplica as migrations
npm run dev
```

Abra http://localhost:5173. A API roda em http://localhost:3333, e o Vite encaminha as chamadas `/api` para ela.

Para ver as telas com dados, rode `npm run db:seed` e entre com **demo@pocket-plan.local** / **demo1234**. A conta tem cerca de 7 meses de lançamentos, com alguns pendentes e atrasados, e é recriada do zero a cada execução.

Sem `SMTP_HOST` no `.env`, os e-mails de redefinição de senha não são enviados: o link aparece no console da API.

Os testes usam um banco próprio (`data/test.db`), recriado a cada execução, então não mexem nos seus dados.

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
| `npm run db:seed` | Cria (ou recria) a conta de demonstração com lançamentos de exemplo |
| `npm run db:studio` | Abre o Prisma Studio para inspecionar o banco |

## Estrutura

```text
server/
  src/
    app.ts            Montagem do Express (rotas e tratamento de erros)
    main.ts           Inicialização do servidor
    lib/              Prisma, erros e utilitários compartilhados
    modules/          Uma pasta por funcionalidade (rotas, validação e regras)
  test/               Testes da API
web/
  src/
    App.tsx           Componente raiz
    lib/api.ts        Cliente HTTP da API
prisma/
  schema.prisma       Modelo do banco
docs/                 Regras de negócio e documentação
```

## Fluxo de trabalho

- Branches no padrão `tipo/descricao`: `feature/`, `fix/`, `docs/`, `chore/`, `test/`, `refactor/`.
- Commits no padrão `tipo: descrição` (ex.: `feat: cadastro de lançamentos`).
- Toda mudança entra na `main` por pull request, com `npm run verify` passando.
