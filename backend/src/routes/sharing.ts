import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth';
import { resolveDocAccess } from '../utils/permissions';
import { writeAudit } from '../utils/audit';
import { DocumentDoc, Permission, User, Member } from '../models';

const router = Router();
router.use(requireAuth, requireTenant);

async function getDoc(req: { params: { documentId: string }; tenantId?: string }) {
  return DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId }).lean();
}

router.get('/:documentId/permissions', async (req, res, next) => {
  try {
    const doc = await getDoc(req);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canView) return res.status(403).json({ error: 'No access' });
    const perms = await Permission.find({ documentId: doc._id }).lean();
    const users = await User.find({ _id: { $in: perms.map((p) => p.userId) } }, 'name email').lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const out = perms
      .map((p) => {
        const u = uMap.get(p.userId);
        if (!u) return null;
        return {
          id: String(p._id),
          user_id: p.userId,
          email: u.email,
          name: u.name,
          role: p.role,
          created_at: new Date(p.createdAt as any).getTime(),
        };
      })
      .filter(Boolean);
    out.sort((a: any, b: any) => a.name.localeCompare(b.name));
    res.json({ permissions: out });
  } catch (e) {
    next(e);
  }
});

router.post('/:documentId/share', async (req, res, next) => {
  try {
    const doc = await getDoc(req);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canShare) return res.status(403).json({ error: 'Cannot share' });

    const { userId, email, role } = req.body || {};
    if (!role || !['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be owner, editor or viewer' });
    }
    let targetId = userId as string | undefined;
    if (!targetId && email) {
      const u = await User.findOne({ email: String(email).toLowerCase() }).lean();
      if (!u) return res.status(404).json({ error: 'User not found' });
      targetId = String(u._id);
    }
    if (!targetId) return res.status(400).json({ error: 'userId or email required' });

    const memberOk = await Member.findOne({ tenantId: req.tenantId, userId: targetId }).lean();
    if (!memberOk) {
      return res.status(400).json({ error: 'Target user is not a member of this organization' });
    }

    const existing = await Permission.findOne({ documentId: doc._id, userId: targetId });
    if (existing) {
      const fromRole = existing.role;
      existing.role = role;
      await existing.save();
      await writeAudit({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'doc.role_changed',
        targetType: 'document',
        targetId: String(doc._id),
        metadata: { userId: targetId, from: fromRole, to: role },
      });
      return res.json({ ok: true, updated: true });
    }
    await Permission.create({
      tenantId: req.tenantId!,
      documentId: String(doc._id),
      userId: targetId,
      role,
      grantedBy: req.user!.id,
    });
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.share',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: { userId: targetId, role },
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch('/:documentId/permissions/:userId', async (req, res, next) => {
  try {
    const doc = await getDoc(req);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canShare) return res.status(403).json({ error: 'Cannot manage' });
    const { role } = req.body || {};
    if (!role || !['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role invalid' });
    }
    const existing = await Permission.findOne({ documentId: doc._id, userId: req.params.userId });
    if (!existing) return res.status(404).json({ error: 'Permission not found' });
    const fromRole = existing.role;
    existing.role = role;
    await existing.save();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.role_changed',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: { userId: req.params.userId, from: fromRole, to: role },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:documentId/permissions/:userId', async (req, res, next) => {
  try {
    const doc = await getDoc(req);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canShare) return res.status(403).json({ error: 'Cannot manage' });
    const existing = await Permission.findOne({ documentId: doc._id, userId: req.params.userId });
    if (!existing) return res.status(404).json({ error: 'Permission not found' });
    const role = existing.role;
    await existing.deleteOne();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.unshare',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: { userId: req.params.userId, role },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
