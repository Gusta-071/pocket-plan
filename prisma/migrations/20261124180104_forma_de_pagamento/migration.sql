-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "description" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethodId" INTEGER,
    "cardId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("amountCents", "categoryId", "createdAt", "date", "description", "id", "paid", "type", "updatedAt", "userId") SELECT "amountCents", "categoryId", "createdAt", "date", "description", "id", "paid", "type", "updatedAt", "userId" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_date_idx" ON "Entry"("userId", "date");
CREATE INDEX "Entry_categoryId_idx" ON "Entry"("categoryId");
CREATE INDEX "Entry_paymentMethodId_idx" ON "Entry"("paymentMethodId");
CREATE INDEX "Entry_cardId_idx" ON "Entry"("cardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_userId_nameKey_key" ON "PaymentMethod"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "Card_userId_idx" ON "Card"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_userId_nameKey_key" ON "Card"("userId", "nameKey");

-- RN-68, RN-70: toda conta existente recebe as formas padrão e a "Não informada".
INSERT INTO "PaymentMethod" ("userId", "kind", "name", "nameKey")
SELECT "User"."id", m.kind, m.name, m.nameKey
FROM "User"
CROSS JOIN (
  SELECT column1 AS kind, column2 AS name, column3 AS nameKey
  FROM (VALUES
    ('PIX', 'Pix', 'pix'),
    ('DEBIT', 'Débito', 'débito'),
    ('CREDIT', 'Crédito', 'crédito'),
    ('CASH', 'Dinheiro', 'dinheiro'),
    ('BOLETO', 'Boleto', 'boleto'),
    ('UNSPECIFIED', 'Não informada', 'não informada')
  )
) AS m;

-- RN-70: as despesas registradas antes da RN-67 ficam com a forma "Não informada".
UPDATE "Entry" SET "paymentMethodId" = (
  SELECT pm."id" FROM "PaymentMethod" pm WHERE pm."userId" = "Entry"."userId" AND pm."kind" = 'UNSPECIFIED'
)
WHERE "type" = 'EXPENSE';
