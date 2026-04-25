import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { Member, Tenant, User } from '../models';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = verifyAccessToken(token);
    const u = await User.findById(payload.sub).lean();
    if (!u) return res.status(401).json({ error: 'Invalid user' });
    if (u.isDeactivated) return res.status(403).json({ error: 'Account deactivated' });
    req.user = {
      id: String(u._id),
      email: u.email,
      name: u.name,
      isSuperAdmin: !!u.isSuperAdmin,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin required' });
  }
  next();
}

/**
 * Tenant ID can be supplied via:
 *  - X-Tenant-Id header
 *  - URL param :tenantId
 *  - Query string ?tenantId=...
 * Members of the tenant are allowed; super admins bypass membership.
 */
export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const tenantId =
    (req.params.tenantId as string | undefined) ||
    (req.headers['x-tenant-id'] as string | undefined) ||
    (req.query.tenantId as string | undefined);
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID is required' });

  const t = await Tenant.findById(tenantId).lean();
  if (!t || !t.isActive) return res.status(404).json({ error: 'Tenant not found' });

  if (!req.user.isSuperAdmin) {
    const member = await Member.findOne({ tenantId, userId: req.user.id }).lean();
    if (!member) return res.status(403).json({ error: 'Not a member of this tenant' });
  }
  req.tenantId = tenantId;
  next();
}

export async function requireOrgAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.tenantId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.isSuperAdmin) return next();
  const m = await Member.findOne({ tenantId: req.tenantId, userId: req.user.id }).lean();
  if (m?.role !== 'admin') {
    return res.status(403).json({ error: 'Organization admin required' });
  }
  next();
}
