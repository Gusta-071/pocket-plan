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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- RN-22: lançamentos existentes com data até hoje (fuso de São Paulo, UTC-3) já contam como pagos ou recebidos,
-- como antes desta mudança; os futuros ficam pendentes.
INSERT INTO "new_Entry" ("amountCents", "categoryId", "createdAt", "date", "description", "id", "type", "updatedAt", "userId", "paid") SELECT "amountCents", "categoryId", "createdAt", "date", "description", "id", "type", "updatedAt", "userId", "date" <= date('now', '-3 hours') FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_date_idx" ON "Entry"("userId", "date");
CREATE INDEX "Entry_categoryId_idx" ON "Entry"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
