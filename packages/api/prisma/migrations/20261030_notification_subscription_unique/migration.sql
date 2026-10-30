-- TIR-359: idempotent push subscriptions.
--
-- Enforce one row per (endpoint, airportId) so re-subscribing the same browser
-- push endpoint for the same airport updates the existing row instead of
-- creating a duplicate (a duplicate makes the dispatcher push N times to the
-- same device). Collapse any pre-existing duplicates first (keep the newest
-- row per pair), then add the compound unique index the `upsert` relies on.

DELETE FROM "notification_subscriptions"
WHERE "id" NOT IN (
    SELECT "id" FROM (
        SELECT "id",
               ROW_NUMBER() OVER (
                   PARTITION BY "endpoint", "airportId"
                   ORDER BY "createdAt" DESC, "id" DESC
               ) AS rn
        FROM "notification_subscriptions"
    )
    WHERE rn = 1
);

CREATE UNIQUE INDEX "notification_subscriptions_endpoint_airportId_key"
    ON "notification_subscriptions"("endpoint", "airportId");
