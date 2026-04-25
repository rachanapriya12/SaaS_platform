import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { writeAudit } from '../utils/audit';
import { Tenant, Member, DocumentDoc, User } from '../models';

const router = Router();

router.use(requireAuth);

function tenantToJson(t: any) {
  return {
    id: String(t._id),
    name: t.name,
    slug: t.slug,
    created_at: new Date(t.createdAt).getTime(),
    created_by: t.createdBy,
    is_active: t.isActive !== false,
  };
}

router.get('/', async (req, res, next) => {
  try {
    if (req.user!.isSuperAdmin) {
      const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
      const ids = tenants.map((t) => String(t._id));
      // counts in parallel
      const [memberCounts, docCounts] = await Promise.all([
        Member.aggregate([
          { $match: { tenantId: { $in: ids } } },
          { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        ]),
        DocumentDoc.aggregate([
          { $match: { tenantId: { $in: ids }, deletedAt: null } },
          { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        ]),
      ]);
      const mMap = new Map(memberCounts.map((r) => [r._id, r.count as number]));
      const dMap = new Map(docCounts.map((r) => [r._id, r.count as number]));
      return res.json({
        tenants: tenants.map((t) => ({
          ...tenantToJson(t),
          member_count: mMap.get(String(t._id)) || 0,
          doc_count: dMap.get(String(t._id)) || 0,
        })),
      });
    }
    const myMembers = await Member.find({ userId: req.user!.id }).lean();
    const tenantIds = myMembers.map((m) => m.tenantId);
    const tenants = await Tenant.find({ _id: { $in: tenantIds }, isActive: true }).lean();
    const roleMap = new Map(myMembers.map((m) => [m.tenantId, m.role]));
    res.json({
      tenants: tenants.map((t) => ({ ...tenantToJson(t), my_role: roleMap.get(String(t._id)) || null })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const t = await Tenant.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ error: 'Tenant not found' });
    if (!req.user!.isSuperAdmin) {
      const m = await Member.findOne({ tenantId: t._id, userId: req.user!.id }).lean();
      if (!m) return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ tenant: tenantToJson(t) });
  } catch (e) {
    next(e);
  }
});

router.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, slug, adminEmail, adminName, adminPassword } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
    const slugLower = String(slug).toLowerCase();
    const existing = await Tenant.findOne({ slug: slugLower }).lean();
    if (existing) return res.status(409).json({ error: 'Slug already exists' });

    const t = await Tenant.create({
      name,
      slug: slugLower,
      createdBy: req.user!.id,
      isActive: true,
    });
    const tenantId = String(t._id);

    if (adminEmail && adminName && adminPassword) {
      let userId: string;
      const existingUser = await User.findOne({ email: String(adminEmail).toLowerCase() }).lean();
      if (existingUser) {
        userId = String(existingUser._id);
      } else {
        const hash = await bcrypt.hash(adminPassword, 10);
        const u = await User.create({
          email: String(adminEmail).toLowerCase(),
          name: adminName,
          passwordHash: hash,
          isSuperAdmin: false,
        });
        userId = String(u._id);
      }
      await Member.updateOne(
        { tenantId, userId },
        { $set: { role: 'admin' } },
        { upsert: true }
      );
    }

    await writeAudit({
      tenantId,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'org.create',
      targetType: 'tenant',
      targetId: tenantId,
      metadata: { name, slug: slugLower },
    });
    res.status(201).json({ tenant: tenantToJson(t) });
  } catch (e) {
    next(e);
  }
});

/* Edit org name/slug — super admin only */
router.patch('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, slug } = req.body || {};
    const t = await Tenant.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tenant not found' });
    if (typeof name === 'string' && name.trim()) t.name = name.trim();
    if (typeof slug === 'string' && slug.trim()) {
      const next = slug.trim().toLowerCase();
      const conflict = await Tenant.findOne({ slug: next, _id: { $ne: t._id } }).lean();
      if (conflict) return res.status(409).json({ error: 'Slug already exists' });
      t.slug = next;
    }
    await t.save();
    await writeAudit({
      tenantId: String(t._id),
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'org.update',
      targetType: 'tenant',
      targetId: String(t._id),
      metadata: { name: t.name, slug: t.slug },
    });
    res.json({ tenant: tenantToJson(t.toObject()) });
  } catch (e) {
    next(e);
  }
});

/* Deactivate (soft-delete) org — super admin only */
router.delete('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const t = await Tenant.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tenant not found' });
    t.isActive = false;
    await t.save();
    await writeAudit({
      tenantId: String(t._id),
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'org.deactivate',
      targetType: 'tenant',
      targetId: String(t._id),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
