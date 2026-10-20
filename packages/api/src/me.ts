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

export const getMe = (req: Request, res: Response) => {
  try {
    const session = getOrCreateSession(req);
    res.json({ data: session });
  } catch (err) {
    console.error("getMe error:", err);
    errorTotal.labels("getMe").inc();
    res.status(500).json({ error: "Internal server error" });
  }
};

export const patchMe = (req: Request, res: Response) => {
  try {
    const session = getOrCreateSession(req);
    const { nickname } = req.body;
    if (nickname !== undefined) {
      session.nickname = String(nickname).slice(0, 50);
    }
    sessions.set(session.id, session);
    res.json({ data: session });
  } catch (err) {
    console.error("patchMe error:", err);
    errorTotal.labels("patchMe").inc();
    res.status(500).json({ error: "Internal server error" });
  }
};

export { getSessionId, getOrCreateSession };
