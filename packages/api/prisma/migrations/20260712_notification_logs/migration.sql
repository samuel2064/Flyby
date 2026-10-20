-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "checkpointId" TEXT,
    "alertType" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "notification_subscriptions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_logs_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notification_logs_subscriptionId_createdAt_idx" ON "notification_logs"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_airportId_createdAt_idx" ON "notification_logs"("airportId", "createdAt");