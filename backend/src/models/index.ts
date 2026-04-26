import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { nanoid } from 'nanoid';


const tenantSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    createdBy: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { _id: false, timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

/* --- User --- */
const userSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    isSuperAdmin: { type: Boolean, default: false },
    isDeactivated: { type: Boolean, default: false, index: true },
  },
  { _id: false, timestamps: true }
);

/* --- OrganizationMember (user ↔ tenant + role) --- */
const memberSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['admin', 'editor', 'viewer'], required: true },
  },
  { _id: false, timestamps: true }
);
memberSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

/* --- Document --- */
const documentSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    contentHtml: { type: String, default: '' },
    createdBy: { type: String, required: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { _id: false, timestamps: true }
);

/* --- DocumentPermission --- */
const permissionSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    tenantId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
    grantedBy: { type: String, required: true },
  },
  { _id: false, timestamps: true }
);
permissionSchema.index({ documentId: 1, userId: 1 }, { unique: true });

/* --- DocumentVersion --- */
const versionSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    tenantId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    versionNumber: { type: Number, required: true },
    title: { type: String, required: true },
    contentHtml: { type: String, default: '' },
    createdBy: { type: String, default: null },
    reason: { type: String, default: null },
  },
  { _id: false, timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
versionSchema.index({ documentId: 1, versionNumber: -1 });

/* --- YjsUpdate (binary CRDT updates appended in order) --- */
const yjsUpdateSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    updateData: { type: Buffer, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
yjsUpdateSchema.index({ documentId: 1, _id: 1 });

/* --- AuditLog --- */
const auditSchema = new Schema(
  {
    _id: { type: String, default: () => nanoid() },
    tenantId: { type: String, default: null, index: true },
    userId: { type: String, default: null },
    actorEmail: { type: String, default: null },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null, index: true },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false, timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

/* --- RefreshToken --- */
const refreshSchema = new Schema(
  {
    _id: { type: String, required: true }, // jti
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false },
  },
  { _id: false, timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

/* Avoid OverwriteModelError in dev when tsx watch reloads */
function model<T extends mongoose.Schema>(name: string, schema: T): Model<InferSchemaType<T>> {
  return (mongoose.models[name] as Model<InferSchemaType<T>>) ||
    mongoose.model<InferSchemaType<T>>(name, schema as unknown as mongoose.Schema);
}

export const Tenant       = model('Tenant', tenantSchema);
export const User         = model('User', userSchema);
export const Member       = model('Member', memberSchema);
export const DocumentDoc  = model('Document', documentSchema);
export const Permission   = model('Permission', permissionSchema);
export const Version      = model('Version', versionSchema);
export const YjsUpdate    = model('YjsUpdate', yjsUpdateSchema);
export const AuditLog     = model('AuditLog', auditSchema);
export const RefreshToken = model('RefreshToken', refreshSchema);

export type TenantDoc     = InferSchemaType<typeof tenantSchema>     & { _id: string };
export type UserModel     = InferSchemaType<typeof userSchema>       & { _id: string };
export type MemberDoc     = InferSchemaType<typeof memberSchema>     & { _id: string };
export type DocumentModel = InferSchemaType<typeof documentSchema>   & { _id: string };
export type PermissionDoc = InferSchemaType<typeof permissionSchema> & { _id: string };
export type VersionDoc    = InferSchemaType<typeof versionSchema>    & { _id: string };
