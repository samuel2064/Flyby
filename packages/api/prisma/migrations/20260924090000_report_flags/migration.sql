-- Report abuse flagging (MVP #9):
-- denormalized flag counter on wait_times plus the audit table of flags.

-- AlterTable
ALTER TABLE "wait_times" ADD COLUMN "flag_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "report_flags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "report_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "session_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_flags_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "wait_times" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "report_flags_report_id_idx" ON "report_flags"("report_id");

-- CreateIndex (one flag per session per report)
CREATE UNIQUE INDEX "report_flags_report_id_session_id_key" ON "report_flags"("report_id", "session_id");
