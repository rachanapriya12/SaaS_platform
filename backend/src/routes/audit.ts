import { Router } from 'express';
import { requireAuth, requireTenant, requireOrgAdmin } from '../middleware/auth';
import { AuditLog } from '../models';

const router = Router();
router.use(requireAuth, requireTenant, requireOrgAdmin);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
    const action = (req.query.action as string | undefined) || null;
    const targetId = (req.query.targetId as string | undefined) || null;

    const filter: any = { tenantId: req.tenantId };
    if (action) filter.action = action;
    if (targetId) filter.targetId = targetId;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    res.json({
      logs: logs.map((l) => ({
        id: String(l._id),
        tenant_id: l.tenantId,
        user_id: l.userId,
        actor_email: l.actorEmail,
        action: l.action,
        target_type: l.targetType,
        target_id: l.targetId,
        metadata: l.metadata,
        created_at: new Date(l.createdAt as any).getTime(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
