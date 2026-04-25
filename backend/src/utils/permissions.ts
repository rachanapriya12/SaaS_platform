import { Member, Permission, DocumentDoc } from '../models';

export type OrgRole = 'admin' | 'editor' | 'viewer';
export type DocRole = 'owner' | 'editor' | 'viewer';

export async function getOrgRole(userId: string, tenantId: string): Promise<OrgRole | null> {
  const m = await Member.findOne({ userId, tenantId }).lean();
  return (m?.role as OrgRole) ?? null;
}

export async function getDocPermission(userId: string, documentId: string): Promise<DocRole | null> {
  const p = await Permission.findOne({ userId, documentId }).lean();
  return (p?.role as DocRole) ?? null;
}

export interface DocAccess {
  canView: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  effectiveRole: DocRole | 'admin' | null;
}

/**
 * Decide what a user is allowed to do on a document.
 *  - Super admin → can do everything (any tenant).
 *  - Org admin   → can do everything in their tenant's documents.
 *  - Otherwise   → must have an explicit Permission row.
 */
export async function resolveDocAccess(args: {
  userId: string;
  isSuperAdmin: boolean;
  documentId: string;
}): Promise<DocAccess> {
  const { userId, isSuperAdmin, documentId } = args;

  if (isSuperAdmin) {
    return { canView: true, canEdit: true, canShare: true, canDelete: true, effectiveRole: 'admin' };
  }

  const doc = await DocumentDoc.findById(documentId).lean();
  if (!doc) return { canView: false, canEdit: false, canShare: false, canDelete: false, effectiveRole: null };

  const orgRole = await getOrgRole(userId, doc.tenantId);
  if (orgRole === 'admin') {
    return { canView: true, canEdit: true, canShare: true, canDelete: true, effectiveRole: 'admin' };
  }

  const docRole = await getDocPermission(userId, documentId);
  if (!docRole) return { canView: false, canEdit: false, canShare: false, canDelete: false, effectiveRole: null };

  return {
    canView: true,
    canEdit: docRole === 'owner' || docRole === 'editor',
    canShare: docRole === 'owner',
    canDelete: docRole === 'owner',
    effectiveRole: docRole,
  };
}
