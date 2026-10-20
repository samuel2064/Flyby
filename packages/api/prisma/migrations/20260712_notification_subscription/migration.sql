-- CreateTable
CREATE TABLE "notification_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_subscriptions_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);