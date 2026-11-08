import { Router, Request, Response, NextFunction } from 'express';
import { signup, login, profile, linkSession, getUserReports } from './users';
import { getOrCreateSession } from './me';
import { decodeToken, type TokenPayload } from './auth';
import { catchAsyncRoutes } from './middleware';

interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  session?: {
    id: string;
    userId?: string;
    createdAt: string;
    reportsSubmitted: number;
    nickname?: string;
  };
}

const router = Router();

// Same promise-safety as the main app: Router instances register through
// their own route methods, which app-level patching does not cover.
catchAsyncRoutes(router);

router.post('/signup', signup);
router.post('/login', login);

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const dec = decodeToken(token);
    const sub = dec?.sub;
    if (!sub || typeof sub !== 'string' || dec.scope !== 'auth') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as AuthenticatedRequest).user = dec;
    if (req.session) {
      req.session.userId = sub;
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/me', authMiddleware, profile);

router.get('/me/reports', getUserReports);

const linkSessionMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  getOrCreateSession(req);
  next();
};

router.post('/link-session', linkSessionMiddleware, linkSession);

export default router;