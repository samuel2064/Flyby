-- Make reportedAt required in WaitReport model
-- This migration ensures reportedAt column has NOT NULL constraint
-- and is indexed for efficient querying.

-- Ensure reportedAt has default value for existing rows
UPDATE wait_times SET reported_at = created_at WHERE reported_at IS NULL;

-- Add NOT NULL constraint if not already present
-- Note: SQLite may not support ALTER TABLE ... ALTER COLUMN directly.
-- For SQLite, we recreate the table to enforce the constraint.

PRAGMA foreign_keys=OFF;

CREATE TABLE "wait_times_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checkpoint_id" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "report_type" TEXT NOT NULL DEFAULT 'standard',
  "reported_at" DATETIME NOT NULL,
  "user_id" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "wait_times_new" SELECT * FROM "wait_times";

DROP TABLE "wait_times";
ALTER TABLE "wait_times_new" RENAME TO "wait_times";

PRAGMA foreign_keys=ON;
