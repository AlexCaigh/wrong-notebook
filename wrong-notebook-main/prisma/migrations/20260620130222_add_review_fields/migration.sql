/*
  Warnings:

  - Added the required column `updatedAt` to the `ReviewSchedule` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "errorItemId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "isCorrect" BOOLEAN,
    "reviewStage" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewSchedule_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewSchedule" ("completedAt", "createdAt", "errorItemId", "id", "isCorrect", "scheduledFor") SELECT "completedAt", "createdAt", "errorItemId", "id", "isCorrect", "scheduledFor" FROM "ReviewSchedule";
DROP TABLE "ReviewSchedule";
ALTER TABLE "new_ReviewSchedule" RENAME TO "ReviewSchedule";
CREATE INDEX "ReviewSchedule_errorItemId_scheduledFor_idx" ON "ReviewSchedule"("errorItemId", "scheduledFor");
CREATE INDEX "ReviewSchedule_scheduledFor_completedAt_idx" ON "ReviewSchedule"("scheduledFor", "completedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
