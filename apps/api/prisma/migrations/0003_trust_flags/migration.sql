-- CreateTable
CREATE TABLE "ReportFlag" (
    "id" SERIAL NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportFlag_reportId_sessionId_key" ON "ReportFlag"("reportId", "sessionId");

-- CreateIndex
CREATE INDEX "ReportFlag_reportId_idx" ON "ReportFlag"("reportId");

-- AddForeignKey
ALTER TABLE "ReportFlag" ADD CONSTRAINT "ReportFlag_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WaitTimeReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
