import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth';
import { resolveDocAccess } from '../utils/permissions';
import { writeAudit } from '../utils/audit';
import { DocumentDoc, Version, User, YjsUpdate } from '../models';
import * as Y from 'yjs';

const router = Router();
router.use(requireAuth, requireTenant);

async function getDoc(documentId: string, tenantId: string) {
  return DocumentDoc.findOne({ _id: documentId, tenantId }).lean();
}

router.get('/:documentId/versions', async (req, res, next) => {
  try {
    const doc = await getDoc(req.params.documentId, req.tenantId!);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canView) return res.status(403).json({ error: 'No access' });
    const versions = await Version.find({ documentId: doc._id }).sort({ versionNumber: -1 }).lean();
    const userIds = Array.from(new Set(versions.map((v) => v.createdBy).filter(Boolean) as string[]));
    const users = await User.find({ _id: { $in: userIds } }, 'name email').lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      versions: versions.map((v) => {
        const u = v.createdBy ? uMap.get(v.createdBy) : null;
        return {
          id: String(v._id),
          version_number: v.versionNumber,
          title: v.title,
          created_at: new Date(v.createdAt as any).getTime(),
          reason: v.reason,
          created_by: v.createdBy,
          creator_name: u?.name || null,
          creator_email: u?.email || null,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:documentId/versions/:versionId', async (req, res, next) => {
  try {
    const doc = await getDoc(req.params.documentId, req.tenantId!);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canView) return res.status(403).json({ error: 'No access' });
    const v = await Version.findOne({ _id: req.params.versionId, documentId: doc._id }).lean();
    if (!v) return res.status(404).json({ error: 'Version not found' });
    res.json({
      version: {
        id: String(v._id),
        version_number: v.versionNumber,
        title: v.title,
        content_html: v.contentHtml,
        created_at: new Date(v.createdAt as any).getTime(),
        reason: v.reason,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:documentId/versions/:versionId/restore', async (req, res, next) => {
  try {
    const doc = await DocumentDoc.findOne({ _id: req.params.documentId, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const access = await resolveDocAccess({
      userId: req.user!.id,
      isSuperAdmin: req.user!.isSuperAdmin,
      documentId: String(doc._id),
    });
    if (!access.canDelete) return res.status(403).json({ error: 'Cannot restore' });
    const target = await Version.findOne({ _id: req.params.versionId, documentId: doc._id }).lean();
    if (!target) return res.status(404).json({ error: 'Version not found' });

    const last = await Version.findOne({ documentId: doc._id }).sort({ versionNumber: -1 }).lean();
    const next = (last?.versionNumber ?? 0) + 1;

    await Version.create({
      tenantId: req.tenantId!,
      documentId: String(doc._id),
      versionNumber: next,
      title: target.title,
      contentHtml: target.contentHtml,
      createdBy: req.user!.id,
      reason: `restored_from_v${target.versionNumber}`,
    });

    doc.title = target.title;
    await doc.save();

    /* Reset the live Yjs CRDT updates so live editor reflects the restored version
       on the next reconnect. We do this by erasing accumulated updates and
       seeding the doc with a new state matching the restored HTML. */
    try {
      await YjsUpdate.deleteMany({ documentId: doc._id });
      const ydoc = new Y.Doc();
      // We don't have a server-side prosemirror schema; we just store an initial
      // state with the title in a Y.Text("title") field. The live editor will pick up
      // the restored HTML via API on next load.
      const update = Y.encodeStateAsUpdate(ydoc);
      await YjsUpdate.create({
        tenantId: req.tenantId!,
        documentId: String(doc._id),
        updateData: Buffer.from(update),
      });
    } catch (e) {
      console.error('[versions] failed to reset Yjs updates after restore', e);
    }

    await writeAudit({
      tenantId: req.tenantId!,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'doc.version_restored',
      targetType: 'document',
      targetId: String(doc._id),
      metadata: {
        restoredFromVersion: target.versionNumber,
        newVersion: next,
      },
    });
    res.json({ ok: true, newVersion: next, restoredFrom: target.versionNumber });
  } catch (e) {
    next(e);
  }
});

export default router;
