import { FormEvent, useEffect, useState } from 'react';
import { Plus, UserPlus, Trash2, PowerOff, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';

export default function UsersPage() {
  const { user, activeMembership } = useAuth();
  const isAdmin = user?.isSuperAdmin || activeMembership?.role === 'admin';

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  async function load() {
    if (!activeMembership) return;
    setLoading(true);
    setError(null);
    try {
      const data = await Api.listUsers(activeMembership.tenant_id);
      setMembers(data.members);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeMembership) load();
    // eslint-disable-next-line
  }, [activeMembership?.tenant_id]);

  async function changeRole(userId: string, role: string) {
    try {
      await Api.changeUserRole(activeMembership!.tenant_id, userId, role);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to change role');
    }
  }

  async function removeUser(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this organization?`)) return;
    try {
      await Api.removeUser(activeMembership!.tenant_id, userId);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove user');
    }
  }

  async function deactivateUser(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}'s account globally? They won't be able to log in.`)) return;
    try {
      await Api.deactivateUser(activeMembership!.tenant_id, userId);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to deactivate user');
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Users" />
        <div className="p-8 text-slate-500">You do not have permission to manage users.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={`Members of ${activeMembership?.tenant_name || 'this organization'}`}
        actions={
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <UserPlus size={16} /> Invite member
          </button>
        }
      />
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Loading members…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-red-700 bg-red-50">
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-slate-500 text-center">
                      No members yet. Invite the first one.
                    </td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  members.map((m) => (
                    <tr key={m.user_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{m.name}</td>
                      <td className="px-5 py-3 text-slate-600">{m.email}</td>
                      <td className="px-5 py-3">
                        <select
                          className="input max-w-[140px]"
                          value={m.role}
                          onChange={(e) => changeRole(m.user_id, e.target.value)}
                          disabled={m.user_id === user?.id && !user?.isSuperAdmin}
                        >
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        {m.is_deactivated ? (
                          <span className="badge badge-red">deactivated</span>
                        ) : (
                          <span className="badge badge-green">active</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            className="btn btn-ghost"
                            title="Remove from organization"
                            onClick={() => removeUser(m.user_id, m.name)}
                            disabled={m.user_id === user?.id && !user?.isSuperAdmin}
                          >
                            <Trash2 size={14} />
                          </button>
                          {user?.isSuperAdmin && !m.is_deactivated && (
                            <button
                              className="btn btn-ghost text-red-600"
                              title="Deactivate account"
                              onClick={() => deactivateUser(m.user_id, m.name)}
                            >
                              <PowerOff size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InviteUserModal
        tenantId={activeMembership!.tenant_id}
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onCreated={async () => {
          setShowInvite(false);
          await load();
        }}
      />
    </div>
  );
}

function InviteUserModal({
  open,
  onClose,
  onCreated,
  tenantId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  tenantId: string;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('Welcome@123');
  const [role, setRole] = useState('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail('');
      setName('');
      setPassword('Welcome@123');
      setRole('editor');
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await Api.inviteUser(tenantId, { email, name, password, role });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite member">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Initial password</label>
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="text-xs text-slate-500 mt-1">
            Share this password with the user. They can change it after sign-in (in a real app).
          </div>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            <Plus size={14} /> {submitting ? 'Inviting…' : 'Invite member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
