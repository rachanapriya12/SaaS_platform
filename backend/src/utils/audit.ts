import { AuditLog } from '../models';

export type AuditAction =
  | 'auth.login'
  | 'auth.signup'
  | 'auth.logout'
  | 'auth.refresh'
  | 'org.create'
  | 'org.update'
  | 'org.deactivate'
  | 'user.invite'
  | 'user.role_changed'
  | 'user.removed'
  | 'user.deactivated'
  | 'doc.create'
  | 'doc.update'
  | 'doc.rename'
  | 'doc.delete'
  | 'doc.restore'
  | 'doc.share'
  | 'doc.unshare'
  | 'doc.role_changed'
  | 'doc.version_created'
  | 'doc.version_restored';

export interface WriteAuditOpts {
  tenantId: string | null;
  userId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAudit(opts: WriteAuditOpts): Promise<void> {
  try {
    await AuditLog.create({
      tenantId: opts.tenantId,
      userId: opts.userId,
      actorEmail: opts.actorEmail,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (e: any) {
    console.error('[audit] failed to write', opts.action, e?.message || e);
  }
}
