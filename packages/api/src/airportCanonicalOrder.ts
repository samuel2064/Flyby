import fs from "fs";
import path from "path";

// Canonical airport display order = the shared seed file order, which matches
// the deploy repo's data/airports.json (TIR-339 M3 parity). Public surfaces
// that list airports across the network (summary, lists) must iterate in this
// order so responses byte-match the deployed contract. Unknown codes sort
// after the canonical list, alphabetically.
//
// The seed file lives outside src/ (rootDir), so it is read at runtime from
// packages/api/prisma/seed/ — the same relative layout holds for the tsc build
// (dist/) and for tsx dev (src/).
let ORDER_INDEX: Map<string, number> = new Map();
try {
  const seedPath = path.join(__dirname, "..", "prisma", "seed", "airports.json");
  const parsed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as Array<{ code: string }>;
  ORDER_INDEX = new Map(parsed.map((a, i) => [a.code.toUpperCase(), i]));
} catch (err) {
  // Canonical order is a parity nicety; fall back to caller-side ordering
  // (code asc) rather than failing startup if the seed file is absent.
  console.warn(
    `[airportCanonicalOrder] seed airports.json unreadable (${(err as Error).message}); falling back to code order`,
  );
}

export function canonicalAirportCompare(a: { code: string }, b: { code: string }): number {
  const ia = ORDER_INDEX.get(a.code.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
  const ib = ORDER_INDEX.get(b.code.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
  if (ia !== ib) return ia - ib;
  return a.code.localeCompare(b.code);
}
