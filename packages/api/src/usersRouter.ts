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

const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? null;
    if (token) {
      const dec = decodeToken(token);
      if (dec?.scope === 'auth' && typeof dec?.sub === 'string') {
        (req as AuthenticatedRequest).user = dec;
        if (req.session) {
          req.session.userId = dec.sub;
        }
      }
    }
    next();
  } catch {
    next();
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