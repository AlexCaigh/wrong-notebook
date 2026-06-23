-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ErrorItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "originalImageUrl" TEXT NOT NULL,
    "ocrText" TEXT,
    "questionText" TEXT,
    "answerText" TEXT,
    "analysis" TEXT,
    "wrongAnswerText" TEXT,
    "mistakeAnalysis" TEXT,
    "mistakeStatus" TEXT,
    "knowledgePoints" TEXT,
    "geogebraCommands" TEXT,
    "source" TEXT,
    "errorType" TEXT,
    "userNotes" TEXT,
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "verificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "verificationPassed" BOOLEAN,
    "gradeSemester" TEXT,
    "paperLevel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErrorItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ErrorItem" ("analysis", "answerText", "createdAt", "errorType", "geogebraCommands", "gradeSemester", "id", "knowledgePoints", "masteryLevel", "mistakeAnalysis", "mistakeStatus", "ocrText", "originalImageUrl", "paperLevel", "questionText", "source", "subjectId", "updatedAt", "userId", "userNotes", "wrongAnswerText") SELECT "analysis", "answerText", "createdAt", "errorType", "geogebraCommands", "gradeSemester", "id", "knowledgePoints", "masteryLevel", "mistakeAnalysis", "mistakeStatus", "ocrText", "originalImageUrl", "paperLevel", "questionText", "source", "subjectId", "updatedAt", "userId", "userNotes", "wrongAnswerText" FROM "ErrorItem";
DROP TABLE "ErrorItem";
ALTER TABLE "new_ErrorItem" RENAME TO "ErrorItem";
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
    "phase" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewSchedule_errorItemId_fkey" FOREIGN KEY ("errorItemId") REFERENCES "ErrorItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewSchedule" ("completedAt", "consecutiveCorrect", "createdAt", "easeFactor", "errorItemId", "id", "intervalDays", "isCorrect", "reviewStage", "scheduledFor", "updatedAt") SELECT "completedAt", "consecutiveCorrect", "createdAt", "easeFactor", "errorItemId", "id", "intervalDays", "isCorrect", "reviewStage", "scheduledFor", "updatedAt" FROM "ReviewSchedule";
DROP TABLE "ReviewSchedule";
ALTER TABLE "new_ReviewSchedule" RENAME TO "ReviewSchedule";
CREATE INDEX "ReviewSchedule_errorItemId_scheduledFor_idx" ON "ReviewSchedule"("errorItemId", "scheduledFor");
CREATE INDEX "ReviewSchedule_scheduledFor_completedAt_idx" ON "ReviewSchedule"("scheduledFor", "completedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
