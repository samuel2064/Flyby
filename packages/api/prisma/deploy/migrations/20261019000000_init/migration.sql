-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "terminal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wait_times" (
    "id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "report_type" TEXT NOT NULL DEFAULT 'standard',
    "reported_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,
    "flag_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wait_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_flags" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "checkpointId" TEXT,
    "alertType" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dndEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dndStartHour" INTEGER NOT NULL DEFAULT 22,
    "dndEndHour" INTEGER NOT NULL DEFAULT 6,
    "thresholdMinutes" INTEGER NOT NULL DEFAULT 30,
    "spikePercent" INTEGER NOT NULL DEFAULT 100,
    "leaveNowPercent" INTEGER NOT NULL DEFAULT 150,
    "rateLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_airportId_code_key" ON "checkpoints"("airportId", "code");

-- CreateIndex
CREATE INDEX "wait_times_checkpoint_id_reported_at_idx" ON "wait_times"("checkpoint_id", "reported_at");

-- CreateIndex
CREATE INDEX "wait_times_user_id_idx" ON "wait_times"("user_id");

-- CreateIndex
CREATE INDEX "report_flags_report_id_idx" ON "report_flags"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_flags_report_id_session_id_key" ON "report_flags"("report_id", "session_id");

-- CreateIndex
CREATE INDEX "notification_subscriptions_id_createdAt_idx" ON "notification_subscriptions"("id", "createdAt");

-- CreateIndex
CREATE INDEX "notification_subscriptions_airportId_createdAt_idx" ON "notification_subscriptions"("airportId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_subscriptionId_createdAt_idx" ON "notification_logs"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_airportId_createdAt_idx" ON "notification_logs"("airportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wait_times" ADD CONSTRAINT "wait_times_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wait_times" ADD CONSTRAINT "wait_times_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_flags" ADD CONSTRAINT "report_flags_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "wait_times"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "notification_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

