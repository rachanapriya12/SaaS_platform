import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { writeAudit } from '../utils/audit';
import { requireAuth } from '../middleware/auth';
import { User, Member, Tenant, RefreshToken } from '../models';

const router = Router();

interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role: 'admin' | 'editor' | 'viewer';
}

async function fetchMemberships(userId: string): Promise<MembershipRow[]> {
  const members = await Member.find({ userId }).lean();
  if (members.length === 0) return [];
  const tenants = await Tenant.find({ _id: { $in: members.map((m) => m.tenantId) }, isActive: true }).lean();
  const tMap = new Map(tenants.map((t) => [String(t._id), t]));
  const rows: MembershipRow[] = [];
  for (const m of members) {
    const t = tMap.get(m.tenantId);
    if (!t) continue;
    rows.push({
      tenant_id: m.tenantId,
      tenant_name: t.name,
      tenant_slug: t.slug,
      role: m.role as MembershipRow['role'],
    });
  }
  rows.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
  return rows;
}

async function issueRefreshToken(userId: string) {
  const jti = nanoid();
  const token = signRefreshToken({ sub: userId, jti });
  const hash = await bcrypt.hash(token, 8);
  const days = 7;
  await RefreshToken.create({
    _id: jti,
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    revoked: false,
  });
  return token;
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, name, password } = req.body || {};
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'email, name, and password are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 chars' });
    }
    const existing = await User.findOne({ email: String(email).toLowerCase() }).lean();
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ email: String(email).toLowerCase(), name, passwordHash: hash, isSuperAdmin: false });
    const id = String(u._id);
    const access = signAccessToken({ sub: id, email: u.email, isSuperAdmin: false });
    const refresh = await issueRefreshToken(id);
    await writeAudit({
      tenantId: null,
      userId: id,
      actorEmail: u.email,
      action: 'auth.signup',
      targetType: 'user',
      targetId: id,
    });
    res.json({
      accessToken: access,
      refreshToken: refresh,
      user: { id, email: u.email, name: u.name, isSuperAdmin: false },
      memberships: [],
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const u = await User.findOne({ email: String(email).toLowerCase() }).lean();
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });
    if (u.isDeactivated) return res.status(403).json({ error: 'Account deactivated' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const access = signAccessToken({
      sub: String(u._id),
      email: u.email,
      isSuperAdmin: !!u.isSuperAdmin,
    });
    const refresh = await issueRefreshToken(String(u._id));
    const memberships = await fetchMemberships(String(u._id));
    await writeAudit({
      tenantId: null,
      userId: String(u._id),
      actorEmail: u.email,
      action: 'auth.login',
      targetType: 'user',
      targetId: String(u._id),
    });
    res.json({
      accessToken: access,
      refreshToken: refresh,
      user: {
        id: String(u._id),
        email: u.email,
        name: u.name,
        isSuperAdmin: !!u.isSuperAdmin,
      },
      memberships,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        await RefreshToken.updateOne({ _id: payload.jti }, { $set: { revoked: true } });
      } catch {
        /* ignore */
      }
    }
    await writeAudit({
      tenantId: null,
      userId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'auth.logout',
      targetType: 'user',
      targetId: req.user!.id,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const tokenDoc = await RefreshToken.findById(payload.jti).lean();
    if (!tokenDoc || tokenDoc.revoked || tokenDoc.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const matches = await bcrypt.compare(refreshToken, tokenDoc.tokenHash);
    if (!matches) return res.status(401).json({ error: 'Invalid refresh token' });

    const u = await User.findById(tokenDoc.userId).lean();
    if (!u || u.isDeactivated) return res.status(401).json({ error: 'Invalid user' });
    const access = signAccessToken({
      sub: String(u._id),
      email: u.email,
      isSuperAdmin: !!u.isSuperAdmin,
    });
    res.json({ accessToken: access });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const memberships = await fetchMemberships(req.user!.id);
    res.json({ user: req.user, memberships });
  } catch (e) {
    next(e);
  }
});

export default router;
