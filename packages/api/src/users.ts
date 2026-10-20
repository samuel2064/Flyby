import type { Request, Response } from 'express';
import { prisma } from './prisma';
import { hashPassword, verifyPassword, signToken, decodeToken } from './auth';
import { errorTotal } from './metrics';

interface SafeUser {
  id: string;
  email: string;
  displayName?: string;
  isPremium: boolean;
  reportsSubmitted?: number;
}

interface PrismaUser {
  id: string;
  email: string;
  displayName?: string | null;
  isPremium?: boolean | null;
  reportsSubmitted?: number | null;
  passwordHash: string;
}

function toSafeUser(user: PrismaUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? undefined,
    isPremium: user.isPremium ?? false,
    reportsSubmitted: user.reportsSubmitted ?? 0,
  };
}

// Extend session context to include userId for linking
declare module 'express' {
  interface Request {
    session?: {
      id: string;
      userId?: string;
      createdAt: string;
      reportsSubmitted: number;
      nickname?: string;
    };
  }
}

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const pwHash = hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash: pwHash, displayName },
    });

    const token = signToken({ sub: user.id });

    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: displayName ?? user.displayName },
    });

    res.status(201).json({ data: { user: toSafeUser(user), token } });
  } catch (err) {
    console.error('signup error:', err);
    errorTotal.labels('signup').inc();
    if (err instanceof Error && 'code' in err && err.code === 'P2002') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ sub: user.id });

    res.json({ data: { user: toSafeUser(user), token } });
  } catch (err) {
    console.error('login error:', err);
    errorTotal.labels('login').inc();
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const profile = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = decodeToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = payload.sub;
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reportsSubmitted = await prisma.waitTime.count({
      where: { userId: user.id },
    });

    res.json({
      data: toSafeUser({ ...user, reportsSubmitted }),
    });
  } catch (err) {
    console.error('profile error:', err);
    errorTotal.labels('profile').inc();
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const linkSession = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // attach userId to session (if session middleware is applied)
    if (req.session) {
      req.session.userId = user.id;
    }

    // Sync nickname from session
    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: req.session?.nickname ?? user.displayName },
    });

    res.json({ data: { success: true, user: toSafeUser(user) } });
  } catch (err) {
    console.error('linkSession error:', err);
    errorTotal.labels('linkSession').inc();
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserReports = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = decodeToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reports = await prisma.waitTime.findMany({
      where: { userId: String(payload.sub) },
      orderBy: { reportedAt: 'desc' },
      include: {
        checkpoint: {
          select: {
            id: true,
            name: true,
            airport: { select: { code: true, city: true } },
          },
        },
      },
    });

    res.json({ data: reports });
  } catch (err) {
    console.error('getUserReports error:', err);
    errorTotal.labels('getUserReports').inc();
    res.status(500).json({ error: 'Internal server error' });
  }
};