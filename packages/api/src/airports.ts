import type { Request, Response } from "express";
import { prisma } from "./prisma";
import { errorTotal } from "./metrics";
import { VISIBLE_REPORT_WHERE } from "./waitTimeUtils";

export const searchAirports = async (req: Request, res: Response) => {
  const { q, lat, lng, radiusMiles } = req.query;

  // TIR-339 contract alignment: see app.ts route comment.
  // The bare /api/airports route lists everything; /api/airports/search
  // still requires q (existing test contract).

  // Geospatial nearby search
  if (lat && lng) {
    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radius = radiusMiles ? parseFloat(radiusMiles as string) : 50;

    if (Number.isNaN(latitude) || Number.isNaN(longitude) || Number.isNaN(radius)) {
      res.status(400).json({ error: "Invalid lat, lng, or radiusMiles" });
      return;
    }

    try {
      const airports = await prisma.airport.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
        },
      });

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 3959; // Earth radius in miles

      const nearby = airports
        .map((a) => {
          const dLat = toRad(a.latitude! - latitude);
          const dLon = toRad(a.longitude! - longitude);
          const lat1Rad = toRad(latitude);
          const lat2Rad = toRad(a.latitude!);
          const aVal =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
          const distance = R * c;
          return { ...a, distance };
        })
        .filter((a) => a.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);

      res.json({ data: nearby });
      return;
    } catch (err) {
      console.error("searchAirports geo error:", err);
      errorTotal.labels("searchAirports_geo").inc();
      res.status(500).json({ error: "Database unavailable" });
      return;
    }
  }

  // Text search
  if (!q || typeof q !== "string" || q.length < 2) {
    res.status(400).json({ error: "Query must be at least 2 characters" });
    return;
  }

  try {
    const term = q.trim().toLowerCase();
    const airports = await prisma.airport.findMany({
      where: {
        OR: [
          { code: { contains: term } },
          { name: { contains: term } },
          { city: { contains: term } },
        ],
      },
      orderBy: [
        { code: "asc" },
      ],
      take: 20,
    });

    // Boost exact code match to top
    const upperTerm = term.toUpperCase();
    const sorted = airports.sort((a, b) => {
      const aExact = a.code === upperTerm ? 0 : 1;
      const bExact = b.code === upperTerm ? 0 : 1;
      return aExact - bExact;
    });

    res.json({ data: sorted });
    return;
  } catch (err) {
    console.error("searchAirports error:", err);
    errorTotal.labels("searchAirports_text").inc();
    res.status(500).json({ error: "Database unavailable" });
    return;
  }
};

export const getAirportByCode = async (req: Request, res: Response) => {
  let code = req.params.code as string;

  // Deploy-compat (TIR-339): apt-<code-lower> resolves to the airport's code.
  // The deploy public API accepted the apt-ids from day one (TIR-298).
  if (typeof code === "string" && /^apt-[a-z]{3}$/i.test(code)) {
    code = code.slice(4).toUpperCase();
  }

  try {
    const airport = await prisma.airport.findUnique({
      where: { code: String(code).toUpperCase() },
      include: {
        checkpoints: {
          include: {
            waitTimes: {
              where: VISIBLE_REPORT_WHERE,
              orderBy: { reportedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!airport) {
      res.status(404).json({ error: "Airport not found" });
      return;
    }

    const checkpoints = airport.checkpoints.map((cp) => {
      const latest = cp.waitTimes[0];
      return {
        id: cp.id,
        code: cp.code,
        name: cp.name,
        terminal: cp.terminal,
        latestWaitTimeMinutes: latest?.minutes ?? null,
        latestReportedAt: latest?.reportedAt?.toISOString() ?? null,
        source: latest?.source ?? null,
      };
    });

    res.json({ data: { ...airport, checkpoints } });
  } catch (err) {
    console.error("getAirportByCode error:", err);
    errorTotal.labels("getAirportByCode").inc();
    res.status(500).json({ error: "Database unavailable" });
    return;
  }
};