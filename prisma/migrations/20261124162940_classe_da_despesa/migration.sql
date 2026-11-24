-- AlterTable
ALTER TABLE "Category" ADD COLUMN "expenseClass" TEXT;

-- RN-15: as categorias padrão de despesa recebem a classe sugerida.
UPDATE "Category" SET "expenseClass" = 'FIXED'
WHERE "type" = 'EXPENSE' AND "nameKey" IN ('moradia', 'saúde', 'educação', 'contas e serviços', 'assinaturas');

-- As demais categorias de despesa (padrão variáveis e as criadas pelo usuário) ficam como Variável.
UPDATE "Category" SET "expenseClass" = 'VARIABLE'
WHERE "type" = 'EXPENSE' AND "expenseClass" IS NULL;

-- As categorias de investimento padrão: se o usuário já tem uma com o mesmo nome, ela vira Investimento.
UPDATE "Category" SET "expenseClass" = 'INVESTMENT'
WHERE "type" = 'EXPENSE' AND "nameKey" IN ('reserva de emergência', 'investimentos');

-- Senão, é criada, respeitando o limite de 30 categorias por tipo (RN-16b).
INSERT INTO "Category" ("userId", "type", "name", "nameKey", "color", "expenseClass")
SELECT "User"."id", 'EXPENSE', 'Reserva de emergência', 'reserva de emergência', 'lime', 'INVESTMENT'
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."userId" = "User"."id" AND c."type" = 'EXPENSE' AND c."nameKey" = 'reserva de emergência'
)
AND (SELECT COUNT(*) FROM "Category" c WHERE c."userId" = "User"."id" AND c."type" = 'EXPENSE') < 30;

INSERT INTO "Category" ("userId", "type", "name", "nameKey", "color", "expenseClass")
SELECT "User"."id", 'EXPENSE', 'Investimentos', 'investimentos', 'green', 'INVESTMENT'
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."userId" = "User"."id" AND c."type" = 'EXPENSE' AND c."nameKey" = 'investimentos'
)
AND (SELECT COUNT(*) FROM "Category" c WHERE c."userId" = "User"."id" AND c."type" = 'EXPENSE') < 30;
