import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireOrgAdmin, requireTenant } from '../middleware/auth';
import { writeAudit } from '../utils/audit';
import { User, Member, Permission } from '../models';

// /organizations/:tenantId/users
const router = Router({ mergeParams: true });

router.use(requireAuth, requireTenant);

router.get('/', async (req, res, next) => {
  try {
    const members = await Member.find({ tenantId: req.tenantId }).sort({ createdAt: 1 }).lean();
    if (members.length === 0) return res.json({ members: [] });
    const users = await User.find({ _id: { $in: members.map((m) => m.userId) } })
      .lean()
      .then((arr) => new Map(arr.map((u) => [String(u._id), u])));
    const out = members
      .map((m) => {
        const u = users.get(m.userId);
        if (!u) return null;
        return {
          user_id: m.userId,
          email: u.email,
          name: u.name,
          role: m.role,
          is_deactivated: !!u.isDeactivated,
          created_at: new Date(m.createdAt as any).getTime(),
        };
      })
      .filter(Boolean);
    out.sort((a: any, b: any) => a.name.localeCompare(b.name));
    res.json({ members: out });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireOrgAdmin, async (req, res, next) => {
  try {
    const { email, name, password, role } = req.body || {};
    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: 'email, name, password, role required' });
    }
    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }
    const emailLower = String(email).toLowerCase();

    let userId: string;
    let isNew = false;
    const existing = await User.findOne({ email: emailLower }).lean();
    if (existing) {
      userId = String(existing._id);
    } else {
      const hash = await bcrypt.hash(password, 10);
      const u = await User.create({
        email: emailLower,
        name,
        passwordHash: hash,
        isSuperAdmin: false,
      });
      userId = String(u._id);
      isNew = true;
    }

    const exists = await Member.findOne({ tenantId: req.tenantId, userId }).lean();
    if (exists) return res.status(409).json({ error: 'User already in organization' });

    await Member.create({ tenantId: req.tenantId, userId, role });

    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'user.invite',
      targetType: 'user',
      targetId: userId,
      metadata: { email: emailLower, role, newAccount: isNew },
    });

    res.status(201).json({ userId, email: emailLower, name, role });
  } catch (e) {
    next(e);
  }
});

router.patch('/:userId/role', requireOrgAdmin, async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }
    const m = await Member.findOne({ tenantId: req.tenantId, userId: req.params.userId });
    if (!m) return res.status(404).json({ error: 'member not found' });
    const fromRole = m.role;
    m.role = role;
    await m.save();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: req.params.userId,
      metadata: { from: fromRole, to: role },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* Remove a user (member) from the organization. Their account stays. */
router.delete('/:userId', requireOrgAdmin, async (req, res, next) => {
  try {
    const m = await Member.findOne({ tenantId: req.tenantId, userId: req.params.userId });
    if (!m) return res.status(404).json({ error: 'member not found' });
    if (m.userId === req.user!.id && !req.user!.isSuperAdmin) {
      return res.status(400).json({ error: 'You cannot remove yourself' });
    }
    await Member.deleteOne({ _id: m._id });
    // also revoke all per-doc permissions in this tenant for that user
    await Permission.deleteMany({ tenantId: req.tenantId, userId: req.params.userId });
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'user.removed',
      targetType: 'user',
      targetId: req.params.userId,
      metadata: { previousRole: m.role },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* Deactivate a user (cross-tenant action) — super admin only */
router.post('/:userId/deactivate', async (req, res, next) => {
  try {
    if (!req.user!.isSuperAdmin) return res.status(403).json({ error: 'Super admin required' });
    const u = await User.findById(req.params.userId);
    if (!u) return res.status(404).json({ error: 'user not found' });
    u.isDeactivated = true;
    await u.save();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'user.deactivated',
      targetType: 'user',
      targetId: String(u._id),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
