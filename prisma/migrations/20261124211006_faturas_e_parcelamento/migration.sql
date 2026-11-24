-- CreateTable
CREATE TABLE "Installment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Installment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "payDate" TEXT NOT NULL,
    "installmentId" INTEGER,
    "installmentNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entry_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- RN-52a, RN-53: a data de pagamento é a própria data, ou o vencimento da fatura nas compras no cartão
-- (o mesmo cálculo de invoiceFor() em shared/invoice.ts).
INSERT INTO "new_Entry" ("amountCents", "cardId", "categoryId", "createdAt", "date", "description", "id", "paid", "paymentMethodId", "type", "updatedAt", "userId", "payDate") SELECT e."amountCents", e."cardId", e."categoryId", e."createdAt", e."date", e."description", e."id", e."paid", e."paymentMethodId", e."type", e."updatedAt", e."userId", COALESCE((SELECT date((CASE WHEN c."dueDay" > c."closingDay" THEN (CASE WHEN e."date" <= date(date(e."date", 'start of month'), '+' || (min(c."closingDay", CAST(strftime('%d', date(date(e."date", 'start of month'), '+1 month', '-1 day')) AS INTEGER)) - 1) || ' days') THEN date(e."date", 'start of month') ELSE date(date(e."date", 'start of month'), '+1 month') END) ELSE date((CASE WHEN e."date" <= date(date(e."date", 'start of month'), '+' || (min(c."closingDay", CAST(strftime('%d', date(date(e."date", 'start of month'), '+1 month', '-1 day')) AS INTEGER)) - 1) || ' days') THEN date(e."date", 'start of month') ELSE date(date(e."date", 'start of month'), '+1 month') END), '+1 month') END), '+' || (min(c."dueDay", CAST(strftime('%d', date((CASE WHEN c."dueDay" > c."closingDay" THEN (CASE WHEN e."date" <= date(date(e."date", 'start of month'), '+' || (min(c."closingDay", CAST(strftime('%d', date(date(e."date", 'start of month'), '+1 month', '-1 day')) AS INTEGER)) - 1) || ' days') THEN date(e."date", 'start of month') ELSE date(date(e."date", 'start of month'), '+1 month') END) ELSE date((CASE WHEN e."date" <= date(date(e."date", 'start of month'), '+' || (min(c."closingDay", CAST(strftime('%d', date(date(e."date", 'start of month'), '+1 month', '-1 day')) AS INTEGER)) - 1) || ' days') THEN date(e."date", 'start of month') ELSE date(date(e."date", 'start of month'), '+1 month') END), '+1 month') END), '+1 month', '-1 day')) AS INTEGER)) - 1) || ' days') FROM "Card" c WHERE c."id" = e."cardId"), e."date") FROM "Entry" e;
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_date_idx" ON "Entry"("userId", "date");
CREATE INDEX "Entry_categoryId_idx" ON "Entry"("categoryId");
CREATE INDEX "Entry_paymentMethodId_idx" ON "Entry"("paymentMethodId");
CREATE INDEX "Entry_cardId_idx" ON "Entry"("cardId");
CREATE INDEX "Entry_userId_payDate_idx" ON "Entry"("userId", "payDate");
CREATE INDEX "Entry_installmentId_idx" ON "Entry"("installmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Installment_userId_idx" ON "Installment"("userId");
