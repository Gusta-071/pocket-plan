-- CreateTable
CREATE TABLE "NoticeState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "readLevel" INTEGER,
    "dismissedUntil" TEXT,
    "dismissedLevel" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NoticeState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "noticeSnoozeDays" INTEGER NOT NULL DEFAULT 3,
    "theme" TEXT NOT NULL DEFAULT 'SYSTEM',
    "emailVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerifiedAt", "id", "initialBalanceCents", "monthStartDay", "name", "passwordHash", "periodNaming", "theme", "warningPercent") SELECT "createdAt", "email", "emailVerifiedAt", "id", "initialBalanceCents", "monthStartDay", "name", "passwordHash", "periodNaming", "theme", "warningPercent" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NoticeState_userId_key_key" ON "NoticeState"("userId", "key");
