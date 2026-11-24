-- CreateTable
CREATE TABLE "Budget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "categoryId" INTEGER,
    "expenseClass" TEXT,
    "amountCents" INTEGER,
    "validFrom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "monthStartDay" INTEGER NOT NULL DEFAULT 1,
    "periodNaming" TEXT NOT NULL DEFAULT 'AUTO',
    "initialBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "warningPercent" INTEGER NOT NULL DEFAULT 80,
    "theme" TEXT NOT NULL DEFAULT 'SYSTEM',
    "emailVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerifiedAt", "id", "initialBalanceCents", "monthStartDay", "name", "passwordHash", "periodNaming", "theme") SELECT "createdAt", "email", "emailVerifiedAt", "id", "initialBalanceCents", "monthStartDay", "name", "passwordHash", "periodNaming", "theme" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Budget_userId_kind_idx" ON "Budget"("userId", "kind");

-- CreateIndex
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");
