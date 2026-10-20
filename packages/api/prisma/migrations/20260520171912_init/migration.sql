-- CreateTable
CREATE TABLE "airports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "airportId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "terminal" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "checkpoints_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wait_times" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkpoint_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wait_times_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_airportId_code_key" ON "checkpoints"("airportId", "code");

-- CreateIndex
CREATE INDEX "wait_times_checkpoint_id_reported_at_idx" ON "wait_times"("checkpoint_id", "reported_at");
