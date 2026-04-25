import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Plus,
  ArrowLeft,
  ShieldAlert,
  ArrowRight,
  Pencil,
  PowerOff,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';
import Modal from '../components/Modal';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  member_count?: number;
  doc_count?: number;
  created_at: number;
  is_active?: boolean;
}

export default function SuperAdminPage() {
  const { user, setActiveTenant, refreshMemberships } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await Api.listOrgs();
      setTenants(data.tenants as Tenant[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!user?.isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        <div className="card p-6 max-w-md text-center">
          <ShieldAlert className="mx-auto text-red-500 mb-2" />
          <h2 className="font-semibold text-lg">Forbidden</h2>
          <p className="text-sm text-slate-500 mt-1">You are not a platform super admin.</p>
          <button className="btn btn-secondary mt-4" onClick={() => navigate('/app')}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  function openOrg(t: Tenant) {
    setActiveTenant(t.id);
    navigate('/app');
  }

  async function deactivate(t: Tenant) {
    if (!confirm(`Deactivate "${t.name}"? Members will no longer be able to log into it.`)) return;
    try {
      await Api.deactivateOrg(t.id);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to deactivate organization');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tenants')}
              className="p-1.5 rounded hover:bg-white/10"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold opacity-80">
                Platform
              </div>
              <h1 className="text-xl font-semibold">Super Admin Console</h1>
            </div>
          </div>
          <button
            className="btn bg-white text-amber-700 hover:bg-amber-50 self-start sm:self-auto"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} /> New Organization
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Stat label="Tenants" value={tenants.length} />
          <Stat
            label="Total members"
            value={tenants.reduce((a, t) => a + (t.member_count || 0), 0)}
          />
          <Stat
            label="Total documents"
            value={tenants.reduce((a, t) => a + (t.doc_count || 0), 0)}
          />
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 font-semibold flex items-center justify-between">
            <span>Organizations</span>
            <span className="text-xs text-slate-500 font-normal">
              Click <strong>Enter</strong> on any org to manage its users, documents and audit logs as
              full admin.
            </span>
          </div>
          {loading && (
            <div className="p-6 text-slate-500 text-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="p-6 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>
          )}
          {!loading && tenants.length === 0 && !error && (
            <div className="p-6 text-slate-500 text-sm">No organizations yet.</div>
          )}
          <div className="divide-y divide-slate-200">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="text-brand-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-slate-500 truncate">slug: {t.slug}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{t.member_count ?? 0} members</span>
                  <span>{t.doc_count ?? 0} documents</span>
                  {t.is_active === false && <span className="badge badge-red">deactivated</span>}
                  <div className="flex items-center gap-2 ml-auto md:ml-2">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditing(t)}
                      title="Rename / change slug"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-ghost text-red-600"
                      onClick={() => deactivate(t)}
                      title="Deactivate organization"
                    >
                      <PowerOff size={14} />
                    </button>
                    <button className="btn btn-primary" onClick={() => openOrg(t)} title="Enter as admin">
                      Enter <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NewTenantModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          setShowCreate(false);
          await load();
          await refreshMemberships();
        }}
      />
      <EditTenantModal
        tenant={editing}
        onClose={() => setEditing(null)}
        onUpdated={async () => {
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function NewTenantModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setSlug('');
      setAdminEmail('');
      setAdminName('');
      setAdminPassword('');
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await Api.createOrg({
        name,
        slug,
        adminEmail: adminEmail || undefined,
        adminName: adminName || undefined,
        adminPassword: adminPassword || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create organization" size="md">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="label">Organization name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Slug (unique)</label>
          <input
            className="input"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            required
          />
        </div>
        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Initial admin (optional)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Admin name</label>
              <input
                className="input"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Admin email</label>
              <input
                className="input"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="label">Admin password</label>
            <input
              className="input"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditTenantModal({
  tenant,
  onClose,
  onUpdated,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setError(null);
    }
  }, [tenant]);

  if (!tenant) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await Api.updateOrg(tenant!.id, { name, slug });
      onUpdated();
    } catch (e: any) {
      setError(e?.message || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!tenant} onClose={onClose} title="Edit organization" size="md">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="label">Organization name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Slug (unique)</label>
          <input
            className="input"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
