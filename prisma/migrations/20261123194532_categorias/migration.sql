-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_type_nameKey_key" ON "Category"("userId", "type", "nameKey");

-- RN-15: contas criadas antes desta migration também recebem as categorias padrão.
INSERT INTO "Category" ("userId", "type", "name", "nameKey", "color")
SELECT "User"."id", d.type, d.name, d.nameKey, d.color
FROM "User"
CROSS JOIN (
  SELECT column1 AS type, column2 AS name, column3 AS nameKey, column4 AS color
  FROM (VALUES
    ('INCOME', 'Salário', 'salário', 'green'),
    ('INCOME', 'Freelance', 'freelance', 'teal'),
    ('INCOME', 'Renda extra', 'renda extra', 'cyan'),
    ('INCOME', 'Outras receitas', 'outras receitas', 'slate'),
    ('EXPENSE', 'Alimentação', 'alimentação', 'orange'),
    ('EXPENSE', 'Moradia', 'moradia', 'indigo'),
    ('EXPENSE', 'Transporte', 'transporte', 'blue'),
    ('EXPENSE', 'Saúde', 'saúde', 'red'),
    ('EXPENSE', 'Educação', 'educação', 'purple'),
    ('EXPENSE', 'Lazer', 'lazer', 'pink'),
    ('EXPENSE', 'Compras', 'compras', 'amber'),
    ('EXPENSE', 'Contas e serviços', 'contas e serviços', 'cyan'),
    ('EXPENSE', 'Assinaturas', 'assinaturas', 'teal'),
    ('EXPENSE', 'Outras despesas', 'outras despesas', 'slate')
  )
) AS d;
