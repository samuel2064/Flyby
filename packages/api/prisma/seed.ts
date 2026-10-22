import { fileURLToPath } from 'url';
import { PrismaClient } from "@prisma/client";
import airports from "./seed/airports.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const prisma = new PrismaClient();

export const getCheckpointsForAirport = (code: string) => {
  const checkpointMap: Record<string, Array<{ code: string; name: string; terminal: string }>> = {
    ATL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "N-A", name: "Domestic North Checkpoint A", terminal: "N" },
      { code: "N-B", name: "Domestic North Checkpoint B", terminal: "N" },
      { code: "S-A", name: "Domestic South Checkpoint A", terminal: "S" },
      { code: "S-B", name: "Domestic South Checkpoint B", terminal: "S" },
    ],
    LAX: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T4", name: "Terminal 4 Security", terminal: "4" },
      { code: "TBIT", name: "Tom Bradley Terminal Security", terminal: "B" },
      { code: "T5", name: "Terminal 5 Security", terminal: "5" },
    ],
    ORD: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1-A", name: "Terminal 1 Security A", terminal: "1" },
      { code: "T3-A", name: "Terminal 3 Security A", terminal: "3" },
      { code: "T5-A", name: "Terminal 5 Security A", terminal: "5" },
      { code: "INTL", name: "International Terminal Security", terminal: "5" },
    ],
    DFW: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Terminal A Security", terminal: "A" },
      { code: "B", name: "Terminal B Security", terminal: "B" },
      { code: "C", name: "Terminal C Security", terminal: "C" },
      { code: "E", name: "Terminal E Security", terminal: "E" },
    ],
    DEN: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "W-A", name: "West Security Checkpoint A", terminal: "W" },
      { code: "W-B", name: "West Security Checkpoint B", terminal: "W" },
      { code: "S-A", name: "South Security Checkpoint A", terminal: "S" },
      { code: "S-B", name: "South Security Checkpoint B", terminal: "S" },
    ],
    JFK: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T4", name: "Terminal 4 Security", terminal: "4" },
      { code: "T5", name: "Terminal 5 Security", terminal: "5" },
      { code: "T8", name: "Terminal 8 Security", terminal: "8" },
    ],
    SFO: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
      { code: "T3", name: "Terminal 3 Security", terminal: "3" },
      { code: "INTL", name: "International Terminal G", terminal: "G" },
      { code: "INTL2", name: "International Terminal A", terminal: "A" },
    ],
    SEA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "N", name: "North Checkpoint", terminal: "N" },
      { code: "S", name: "South Checkpoint", terminal: "S" },
      { code: "D", name: "D Checkpoint", terminal: "D" },
      { code: "E", name: "E Checkpoint", terminal: "E" },
    ],
    LAS: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T3", name: "Terminal 3 Security", terminal: "3" },
      { code: "T3-D", name: "Terminal 3 D Gates", terminal: "3" },
    ],
    MCO: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Side A Security", terminal: "A" },
      { code: "B", name: "Side B Security", terminal: "B" },
      { code: "C", name: "Side C Security", terminal: "C" },
      { code: "D", name: "Side D Security", terminal: "D" },
    ],
    CLT: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Atrium A Security", terminal: "A" },
      { code: "B", name: "Atrium B Security", terminal: "B" },
      { code: "C", name: "Atrium C Security", terminal: "C" },
      { code: "D", name: "Atrium D Security", terminal: "D" },
    ],
    EWR: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Terminal A Security", terminal: "A" },
      { code: "B", name: "Terminal B Security", terminal: "B" },
      { code: "C", name: "Terminal C Security", terminal: "C" },
    ],
    PHX: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T3-A", name: "Terminal 3 Security A", terminal: "3" },
      { code: "T3-B", name: "Terminal 3 Security B", terminal: "3" },
      { code: "T4", name: "Terminal 4 Security", terminal: "4" },
      { code: "T4-B", name: "Terminal 4 Security B", terminal: "4" },
    ],
    MIA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "N-CHK", name: "North Checkpoint", terminal: "N" },
      { code: "S-CHK", name: "South Checkpoint", terminal: "S" },
      { code: "CLB", name: "Central Lobby B", terminal: "CLB" },
    ],
    IAH: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A-CHK", name: "Terminal A Checkpoint", terminal: "A" },
      { code: "B-CHK", name: "Terminal B Checkpoint", terminal: "B" },
      { code: "C-CHK", name: "Terminal C Checkpoint", terminal: "C" },
      { code: "E-CHK", name: "Terminal E Checkpoint", terminal: "E" },
    ],
    BOS: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Terminal A Security", terminal: "A" },
      { code: "B", name: "Terminal B Security", terminal: "B" },
      { code: "C", name: "Terminal C Security", terminal: "C" },
      { code: "E", name: "Terminal E Security", terminal: "E" },
    ],
    MSP: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
      { code: "INTL", name: "International Terminal G", terminal: "G" },
      { code: "INTL2", name: "International Terminal F", terminal: "F" },
    ],
    DTW: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "MCNA-N", name: "McNamara Terminal North Security", terminal: "McNamara" },
      { code: "MCNA-S", name: "McNamara Terminal South Security", terminal: "McNamara" },
      { code: "EVANS", name: "Evans Terminal Security", terminal: "Evans" },
      { code: "SMITH", name: "Smith Terminal Security", terminal: "Smith" },
    ],
    FLL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T3-S", name: "Terminal 3 South", terminal: "3" },
      { code: "T3-N", name: "Terminal 3 North", terminal: "3" },
      { code: "T4", name: "Terminal 4 Security", terminal: "4" },
    ],
    PHL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A-West", name: "A-West Security", terminal: "A-West" },
      { code: "B", name: "B Terminal Security", terminal: "B" },
      { code: "C", name: "C Terminal Security", terminal: "C" },
      { code: "D", name: "D Terminal Security", terminal: "D" },
    ],
    BWI: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    DCA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
      { code: "NCHK", name: "North Checkpoint", terminal: "N" },
      { code: "SCHK", name: "South Checkpoint", terminal: "S" },
    ],
    MDW: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "A", name: "Midway Gate A Security", terminal: "A" },
      { code: "B", name: "Midway Gate B Security", terminal: "B" },
      { code: "C", name: "Midway Gate C Security", terminal: "C" },
    ],
    TPA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
      { code: "CHK-E", name: "Checkpoint E", terminal: "E" },
    ],
    SAN: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
    ],
    SLC: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "C-N", name: "Concourse North", terminal: "N" },
      { code: "C-S", name: "Concourse South", terminal: "S" },
      { code: "C-E", name: "Concourse East", terminal: "E" },
      { code: "C-W", name: "Concourse West", terminal: "W" },
    ],
    PDX: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "N-CHK", name: "North Checkpoint", terminal: "N" },
      { code: "S-CHK", name: "South Checkpoint", terminal: "S" },
      { code: "C-CHK", name: "Center Checkpoint", terminal: "C" },
    ],
    STL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
    ],
    CVG: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    RDU: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
    ],
    IND: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    AUS: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    DAL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    BNA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    SMF: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    MCI: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    HNL: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    OAK: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "T1", name: "Terminal 1 Security", terminal: "1" },
      { code: "T2", name: "Terminal 2 Security", terminal: "2" },
    ],
    MSY: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    CLE: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    PIT: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    SJC: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    SAT: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    RSW: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    IAD: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
      { code: "CHK-D", name: "Checkpoint D", terminal: "D" },
    ],
    SNA: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
      { code: "CHK-C", name: "Checkpoint C", terminal: "C" },
    ],
    MKE: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    PBI: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    RIC: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    BUF: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
    ONT: [
      { code: "CHK-MAIN", name: "Main", terminal: "Main" },
      { code: "CHK-A", name: "Checkpoint A", terminal: "A" },
      { code: "CHK-B", name: "Checkpoint B", terminal: "B" },
    ],
  };

  return checkpointMap[code] || [];
};

export const data = {
  airports: (airports as any[]),
};

export async function main() {
  // Clear all mutable data so each E2E run starts clean
  await prisma.waitTime.deleteMany({});
  await prisma.checkpoint.deleteMany({});
  await prisma.airport.deleteMany({});
  await prisma.user.deleteMany({});

  console.log("[seed] Cleared waitTimes, checkpoints, airports, users: 0");

  // Upsert airports
  for (const a of data.airports) {
    await prisma.airport.upsert({
      where: { code: a.code },
      update: {},
      create: a,
    });
  }

  // Seed checkpoints per airport
  const dbAirports = await prisma.airport.findMany();
  for (const airport of dbAirports) {
    const cps = getCheckpointsForAirport(airport.code);
    for (const cp of cps) {
      await prisma.checkpoint.upsert({
        where: {
          airportId_code: {
            airportId: airport.id,
            code: cp.code,
          },
        },
        update: {},
        create: {
          airportId: airport.id,
          code: cp.code,
          name: cp.name,
          terminal: cp.terminal,
        },
      });
    }
  }

  // Seed wait times for all checkpoints
  const allCheckpoints = await prisma.checkpoint.findMany();
  for (const cp of allCheckpoints) {
    const existing = await prisma.waitTime.count({ where: { checkpointId: cp.id } });
    if (existing === 0) {
      await prisma.waitTime.create({
        data: {
          checkpointId: cp.id,
          minutes: Math.floor(Math.random() * 30) + 5,
          source: "crowd",
          reportedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)),
        },
      });
      await prisma.waitTime.create({
        data: {
          checkpointId: cp.id,
          minutes: Math.floor(Math.random() * 30) + 5,
          source: "pattern",
          reportedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000) - 600000),
        },
      });
    }
  }

  console.log("Seed complete.", { airports: dbAirports.length, checkpoints: allCheckpoints.length });
}

if (process.argv[1] && (process.argv[1] === __filename || process.argv[1].replace(/\\/g, '/') === __filename)) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
