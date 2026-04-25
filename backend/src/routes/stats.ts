import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { Tenant, Member, DocumentDoc, User, AuditLog } from '../models';
import { getActiveCollaboratorCount, getAllActiveCollaboratorCount } from '../ws/collab';

const router = Router();
router.use(requireAuth);

/**
 * Tenant-scoped or platform-wide stats for the dashboard.
 *  - Super admin (no tenant) → platform totals.
 *  - Otherwise              → totals scoped to the active tenant from header/query.
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId =
      (req.headers['x-tenant-id'] as string | undefined) ||
      (req.query.tenantId as string | undefined);

    if (req.user!.isSuperAdmin && !tenantId) {
      const [tenants, users, documents, recent] = await Promise.all([
        Tenant.countDocuments({ isActive: true }),
        User.countDocuments({ isDeactivated: { $ne: true } }),
        DocumentDoc.countDocuments({ deletedAt: null }),
        AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
      ]);
      return res.json({
        scope: 'platform',
        organizations: tenants,
        users,
        documents,
        active_collaborators: getAllActiveCollaboratorCount(),
        recent: recent.map((r) => ({
          id: String(r._id),
          actor_email: r.actorEmail,
          action: r.action,
          target_id: r.targetId,
          tenant_id: r.tenantId,
          created_at: new Date(r.createdAt as any).getTime(),
        })),
      });
    }

    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    if (!req.user!.isSuperAdmin) {
      const member = await Member.findOne({ tenantId, userId: req.user!.id }).lean();
      if (!member) return res.status(403).json({ error: 'Not a member of this tenant' });
    }
    const [users, documents, recent] = await Promise.all([
      Member.countDocuments({ tenantId }),
      DocumentDoc.countDocuments({ tenantId, deletedAt: null }),
      AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    res.json({
      scope: 'tenant',
      tenant_id: tenantId,
      users,
      documents,
      active_collaborators: getActiveCollaboratorCount(tenantId),
      recent: recent.map((r) => ({
        id: String(r._id),
        actor_email: r.actorEmail,
        action: r.action,
        target_id: r.targetId,
        tenant_id: r.tenantId,
        created_at: new Date(r.createdAt as any).getTime(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
