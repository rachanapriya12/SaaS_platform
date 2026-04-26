import { Router, type Request, type Response, type NextFunction } from 'express';
import sanitizeHtml from 'sanitize-html';
import { requireAuth, requireTenant } from '../middleware/auth';
import { resolveDocAccess, getOrgRole } from '../utils/permissions';
import { writeAudit } from '../utils/audit';
import { DocumentDoc, Permission, Version, User } from '../models';
import { isHtmlEffectivelyEmpty } from '../utils/htmlContent';

const router = Router();

router.use(requireAuth, requireTenant);

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'h1', 'h2', 'h3', 'h4', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    span: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

function docToJson(d: any, myRole: string | null, creator?: { name: string; email: string } | null) {
  return {
    id: String(d._id),
    tenant_id: d.tenantId,
    title: d.title,
    created_by: d.createdBy,
    created_at: new Date(d.createdAt).getTime(),
    updated_at: new Date(d.updatedAt).getTime(),
    deleted_at: d.deletedAt ? new Date(d.deletedAt).getTime() : null,
    creator_name: creator?.name || null,
    creator_email: creator?.email || null,
    my_role: myRole,
  };
}

async function toDocumentView(doc: any, accessRole: string | null) {
  const latest = await Version.findOne({ documentId: doc._id }).sort({ versionNumber: -1 }).lean();
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...docToJson(plain, accessRole, null),
    content_html: plain.contentHtml || '',
    organization_id: plain.tenantId,
    version: latest?.versionNumber ?? 1,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const includeDeleted =
      req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    const orgRole = await getOrgRole(req.user!.id, req.tenantId!);
    const isAdmin = req.user!.isSuperAdmin || orgRole === 'admin';

    const filter: any = { tenantId: req.tenantId };
    if (!includeDeleted) filter.deletedAt = null;

    let docs: any[];
    let permMap = new Map<string, string>();

    if (isAdmin) {
      docs = await DocumentDoc.find(filter).sort({ updatedAt: -1 }).lean();
    } else {
      const perms = await Permission.find({ tenantId: req.tenantId, userId: req.user!.id }).lean();
      const docIds = perms.map((p) => p.documentId);
      permMap = new Map(perms.map((p) => [p.documentId, p.role]));
      docs = await DocumentDoc.find({ ...filter, _id: { $in: docIds } })
        .sort({ updatedAt: -1 })
        .lean();
    }

    const creatorIds = Array.from(new Set(docs.map((d) => d.createdBy).filter(Boolean)));
    const creators = await User.find({ _id: { $in: creatorIds } }, 'name email').lean();
    const cMap = new Map(creators.map((c) => [String(c._id), { name: c.name, email: c.email }]));

    res.json({
      documents: docs.map((d) =>
        docToJson(d, isAdmin ? 'admin' : permMap.get(String(d._id)) || null, cMap.get(d.createdBy) || null)
      ),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title required' });
    }
    const orgRole = await getOrgRole(req.user!.id, req.tenantId!);
    if (!req.user!.isSuperAdmin && orgRole !== 'admin' && orgRole !== 'editor') {
      return res.status(403).json({ error: 'You cannot create documents' });
    }

    const doc = await DocumentDoc.create({
      tenantId: req.tenantId!,
      title,
      contentHtml: '',
      createdBy: req.user!.id,
    });
    await Permission.create({
      tenantId: req.tenantId!,
      documentId: String(doc._id),
      userId: req.user!.id,
      role: 'owner',
      grantedBy: req.user!.id,
    });
    await Version.create({
      tenantId: req.tenantId!,
      documentId: String(doc._id),
      versionNumber: 1,
      title,
      contentHtml: '',
      createdBy: req.user!.id,
      reason: 'created',
    });

    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.create',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: { title },
    });

    res.status(201).json({
      document: docToJson(doc.toObject(), 'owner', { name: req.user!.name, email: req.user!.email }),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:documentId', async (req, res, next) => {
  try {
    const doc = await DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId }).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canView) return res.status(403).json({ error: 'No access' });

    const latest = await Version.findOne({ documentId: doc._id })
      .sort({ versionNumber: -1 })
      .lean();

    console.log(
      `[documents] document loaded from MongoDB documentId=${doc._id} tenantId=${req.tenantId} version=${latest?.versionNumber ?? 1}`
    );

    const documentView = await toDocumentView(doc, access.effectiveRole);

    res.json({
      document: documentView,
      access,
      latestVersion: latest
        ? {
            version_number: latest.versionNumber,
            title: latest.title,
            content_html: latest.contentHtml,
            created_at: new Date(latest.createdAt as any).getTime(),
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

async function writeDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });

    const { title, contentHtml, autosave } = req.body || {};
    const isAutosave = autosave === true;
    if (title === undefined && contentHtml === undefined) {
      return res.status(400).json({ error: 'nothing to update' });
    }
    if (title !== undefined && !access.canDelete) {
      return res.status(403).json({ error: 'Not allowed to rename' });
    }
    if (contentHtml !== undefined && !access.canEdit) {
      return res.status(403).json({ error: 'Not allowed to edit content' });
    }

    const previousTitle = doc.title;
    if (title !== undefined) doc.title = String(title);

    if (title !== undefined && previousTitle !== doc.title) {
      await writeAudit({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'doc.rename',
        targetType: 'document',
        targetId: String(doc._id),
        metadata: { from: previousTitle, to: doc.title },
      });
    }

    if (contentHtml !== undefined) {
      const clean = sanitizeHtml(String(contentHtml), SANITIZE_OPTS);
      const incomingEmpty = isHtmlEffectivelyEmpty(clean);
      const existingEmpty = isHtmlEffectivelyEmpty(doc.contentHtml || '');

      if (incomingEmpty && !existingEmpty && isAutosave) {
        console.log(
          `[documents] skip autosave: refuse empty overwrite documentId=${doc._id} tenantId=${req.tenantId}`
        );
        const view = await toDocumentView(doc.toObject(), access.effectiveRole);
        return res.json({ document: view });
      }

      doc.contentHtml = clean;
      if (!isAutosave) {
        const last = await Version.findOne({ documentId: doc._id }).sort({ versionNumber: -1 }).lean();
        const next = (last?.versionNumber ?? 0) + 1;
        await Version.create({
          tenantId: req.tenantId!,
          documentId: String(doc._id),
          versionNumber: next,
          title: doc.title,
          contentHtml: clean,
          createdBy: req.user!.id,
          reason: 'manual_save',
        });
        await writeAudit({
          tenantId: req.tenantId!,
          userId: req.user!.id,
          actorEmail: req.user!.email,
          action: 'doc.update',
          targetType: 'document',
          targetId: String(doc._id),
          metadata: { versionNumber: next, source: 'manual_save' },
        });
      }
    }

    await doc.save();

    console.log(
      `[documents] document saved to MongoDB documentId=${doc._id} tenantId=${req.tenantId} autosave=${isAutosave}`
    );

    const view = await toDocumentView(doc.toObject(), access.effectiveRole);
    res.json({ document: view });
  } catch (e) {
    next(e);
  }
}

router.patch('/:documentId', writeDocument);
router.put('/:documentId', writeDocument);

router.delete('/:documentId', async (req, res, next) => {
  try {
    const doc = await DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canDelete) return res.status(403).json({ error: 'Not allowed to delete' });
    doc.deletedAt = new Date();
    await doc.save();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.delete',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: { title: doc.title },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:documentId/restore', async (req, res, next) => {
  try {
    const doc = await DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canDelete) return res.status(403).json({ error: 'Not allowed to restore' });
    if (!doc.deletedAt) return res.status(400).json({ error: 'Not deleted' });
    doc.deletedAt = null;
    await doc.save();
    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.restore',
      targetType: 'document',
      targetId: String(doc._id),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
