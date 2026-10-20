import type { Request, Response } from "express";
import { errorTotal } from "./metrics";

interface Session {
  id: string;
  createdAt: string;
  reportsSubmitted: number;
  nickname?: string;
}

const sessions: Map<string, Session> = new Map();

function getSessionId(req: Request): string {
  const header = req.headers["x-session-id"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return "anon-" + Math.random().toString(36).slice(2, 10);
}

function getOrCreateSession(req: Request): Session {
  const id = getSessionId(req);
  if (!sessions.has(id)) {
    sessions.set(id, {
      id,
      createdAt: new Date().toISOString(),
      reportsSubmitted: 0,
    });
  }
  return sessions.get(id)!;
}

export const getAgentsMe = (req: Request, res: Response) => {
  try {
    const session = getOrCreateSession(req);
    res.json({ data: session });
  } catch (err) {
    console.error("getAgentsMe error:", err);
    errorTotal.labels("getAgentsMe").inc();
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getInboxLite = (req: Request, res: Response) => {
  try {
    const session = getOrCreateSession(req);
    const { reportsSubmitted } = session;
    res.json({
      data: {
        sessionId: session.id,
        reportsSubmitted,
        agent: "flyby-agent",
        assignedAt: session.createdAt,
      },
    });
  } catch (err) {
    console.error("getInboxLite error:", err);
    errorTotal.labels("getInboxLite").inc();
    res.status(500).json({ error: "Internal server error" });
  }
};

export { getSessionId, getOrCreateSession };