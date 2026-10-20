/*
  Warnings:

  - Added the required column `updated_at` to the `wait_times` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_wait_times" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkpoint_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "report_type" TEXT NOT NULL DEFAULT 'standard',
    "reported_at" DATETIME NOT NULL,
    "user_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "wait_times_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wait_times_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_wait_times" ("checkpoint_id", "created_at", "id", "minutes", "reported_at", "source") SELECT "checkpoint_id", "created_at", "id", "minutes", "reported_at", "source" FROM "wait_times";
DROP TABLE "wait_times";
ALTER TABLE "new_wait_times" RENAME TO "wait_times";
CREATE INDEX "wait_times_checkpoint_id_reported_at_idx" ON "wait_times"("checkpoint_id", "reported_at");
CREATE INDEX "wait_times_user_id_idx" ON "wait_times"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
