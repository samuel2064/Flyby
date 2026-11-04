// Mirror of the API's stable checkpoint ids (apps/api/server.js
// checkpointIdFor): ck-<airport-lower>-<slug>. Derived locally so checkpoint
// cards can address per-checkpoint endpoints without an id round trip.
// server.test.js pins the same ids (ck-jfk-main, ck-ord-terminal-2,
// ck-atl-domestic-north-checkpoint-a) - keep the two in sync.
export function checkpointId(airportCode: string, checkpointName: string): string {
  const slug = String(checkpointName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `ck-${airportCode.toLowerCase()}-${slug}`
}
