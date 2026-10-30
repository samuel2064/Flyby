-- TIR-359: idempotent push subscriptions (PostgreSQL deploy target).
--
-- Enforce one row per (endpoint, "airportId") so a browser push endpoint can
-- only be subscribed once per airport; re-subscribes refresh the existing row
-- via upsert. Collapse pre-existing duplicates (keep the earliest row) before
-- adding the compound unique index.

DELETE FROM "notification_subscriptions" a
USING "notification_subscriptions" b
WHERE a."id" > b."id"
  AND a."endpoint" = b."endpoint"
  AND a."airportId" = b."airportId";

CREATE UNIQUE INDEX "notification_subscriptions_endpoint_airportId_key"
    ON "notification_subscriptions"("endpoint", "airportId");
