-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dndEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dndStartHour" INTEGER NOT NULL DEFAULT 22,
    "dndEndHour" INTEGER NOT NULL DEFAULT 6,
    "thresholdMinutes" INTEGER NOT NULL DEFAULT 30,
    "spikePercent" INTEGER NOT NULL DEFAULT 100,
    "leaveNowPercent" INTEGER NOT NULL DEFAULT 150,
    "rateLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "notification_preferences_userId_createdAt_idx" ON "notification_preferences"("userId", "createdAt");