import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectMongo } from './db/mongoose';
import { writeAudit } from './utils/audit';
import mongoose from 'mongoose';
import { Tenant, User, Member, DocumentDoc, Permission, Version } from './models';

interface SeedUser {
  email: string;
  name: string;
  password: string;
}

interface SeedOrgUser extends SeedUser {
  role: 'admin' | 'editor' | 'viewer';
}

interface SeedOrg {
  name: string;
  slug: string;
  users: SeedOrgUser[];
}

const SUPER_ADMIN: SeedUser = {
  email: 'super@platform.com',
  name: 'Platform Super Admin',
  password: 'Super@123',
};

const ORGS: SeedOrg[] = [
  {
    name: 'ABC Company',
    slug: 'abc',
    users: [
      { email: 'abc-admin@example.com',    name: 'Aarav Admin',    password: 'Admin@123',  role: 'admin' },
      { email: 'abc-editor@example.com',   name: 'Bhavna Editor',  password: 'Editor@123', role: 'editor' },
      { email: 'abc-editor2@example.com',  name: 'Dev Editor',     password: 'Editor@123', role: 'editor' },
      { email: 'abc-editor3@example.com',  name: 'Esha Editor',    password: 'Editor@123', role: 'editor' },
      { email: 'abc-viewer@example.com',   name: 'Charu Viewer',   password: 'Viewer@123', role: 'viewer' },
      { email: 'abc-viewer2@example.com',  name: 'Farhan Viewer',  password: 'Viewer@123', role: 'viewer' },
    ],
  },
  {
    name: 'XYZ Company',
    slug: 'xyz',
    users: [
      { email: 'xyz-admin@example.com',    name: 'Xavier Admin',   password: 'Admin@123',  role: 'admin' },
      { email: 'xyz-editor@example.com',   name: 'Yara Editor',    password: 'Editor@123', role: 'editor' },
      { email: 'xyz-editor2@example.com',  name: 'Zaid Editor',    password: 'Editor@123', role: 'editor' },
      { email: 'xyz-editor3@example.com',  name: 'Priya Editor',   password: 'Editor@123', role: 'editor' },
      { email: 'xyz-viewer@example.com',   name: 'Wendy Viewer',   password: 'Viewer@123', role: 'viewer' },
    ],
  },
];

async function ensureUser(u: SeedUser, isSuper = false): Promise<string> {
  const email = u.email.toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) return String(existing._id);
  const hash = await bcrypt.hash(u.password, 10);
  const created = await User.create({
    email,
    name: u.name,
    passwordHash: hash,
    isSuperAdmin: isSuper,
    isDeactivated: false,
  });
  return String(created._id);
}

async function ensureMember(tenantId: string, userId: string, role: 'admin' | 'editor' | 'viewer') {
  await Member.updateOne(
    { tenantId, userId },
    { $setOnInsert: { tenantId, userId, role } },
    { upsert: true }
  );
}

async function ensureTenant(name: string, slug: string, createdBy: string): Promise<string> {
  const existing = await Tenant.findOne({ slug }).lean();
  if (existing) return String(existing._id);
  const t = await Tenant.create({ name, slug, createdBy, isActive: true });
  await writeAudit({
    tenantId: String(t._id),
    userId: createdBy,
    actorEmail: SUPER_ADMIN.email,
    action: 'org.create',
    targetType: 'tenant',
    targetId: String(t._id),
    metadata: { name, slug, source: 'seed' },
  });
  return String(t._id);
}

async function ensureDocument(tenantId: string, title: string, ownerUserId: string): Promise<string> {
  const existing = await DocumentDoc.findOne({ tenantId, title, deletedAt: null }).lean();
  if (existing) return String(existing._id);
  const doc = await DocumentDoc.create({ tenantId, title, createdBy: ownerUserId });
  await Permission.create({
    tenantId,
    documentId: String(doc._id),
    userId: ownerUserId,
    role: 'owner',
    grantedBy: ownerUserId,
  });
  await Version.create({
    tenantId,
    documentId: String(doc._id),
    versionNumber: 1,
    title,
    contentHtml: '',
    createdBy: ownerUserId,
    reason: 'seed',
  });
  await writeAudit({
    tenantId,
    userId: ownerUserId,
    actorEmail: null,
    action: 'doc.create',
    targetType: 'document',
    targetId: String(doc._id),
    metadata: { title, source: 'seed' },
  });
  return String(doc._id);
}

async function grant(
  tenantId: string,
  documentId: string,
  userId: string,
  role: 'owner' | 'editor' | 'viewer',
  grantedBy: string
) {
  const existing = await Permission.findOne({ documentId, userId }).lean();
  if (existing) return;
  await Permission.create({ tenantId, documentId, userId, role, grantedBy });
  await writeAudit({
    tenantId,
    userId: grantedBy,
    actorEmail: null,
    action: 'doc.share',
    targetType: 'document',
    targetId: documentId,
    metadata: { userId, role, source: 'seed' },
  });
}

async function main() {
  await connectMongo();
  console.log('Seeding MongoDB...');

  const superId = await ensureUser(SUPER_ADMIN, true);

  for (const org of ORGS) {
    const tenantId = await ensureTenant(org.name, org.slug, superId);
    let adminId = '';
    const idsByEmail: Record<string, string> = {};
    for (const u of org.users) {
      const uid = await ensureUser(u);
      idsByEmail[u.email] = uid;
      await ensureMember(tenantId, uid, u.role);
      if (u.role === 'admin') adminId = uid;
    }

    const onboardingId = await ensureDocument(tenantId, `${org.name} - Onboarding Guide`, adminId);
    const roadmapId    = await ensureDocument(tenantId, `${org.name} - Product Roadmap 2026`, adminId);
    const collabId     = await ensureDocument(tenantId, `${org.name} - Real-time Collab Sandbox`, adminId);

    const editors = org.users.filter((u) => u.role === 'editor');
    const viewers = org.users.filter((u) => u.role === 'viewer');

    for (const e of editors) await grant(tenantId, onboardingId, idsByEmail[e.email], 'editor', adminId);
    for (const v of viewers) await grant(tenantId, onboardingId, idsByEmail[v.email], 'viewer', adminId);

    for (const e of editors) await grant(tenantId, roadmapId, idsByEmail[e.email], 'editor', adminId);

    for (const e of editors) await grant(tenantId, collabId, idsByEmail[e.email], 'editor', adminId);
    for (const v of viewers) await grant(tenantId, collabId, idsByEmail[v.email], 'editor', adminId);
  }

  console.log('Seed complete.\n');
  console.log('--- Login credentials ---');
  console.log(`Super Admin:  ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
  for (const o of ORGS) {
    console.log(`\n${o.name}:`);
    for (const u of o.users) console.log(`  ${u.role.padEnd(6)}  ${u.email.padEnd(32)} / ${u.password}`);
  }
  console.log(
    '\nTip: every org has a "<Org> - Real-time Collab Sandbox" doc where every member has editor access. Open it in two windows as two users to see live editing.'
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect();
  process.exit(1);
});
