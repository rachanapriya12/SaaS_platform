import { FormEvent, useEffect, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import Modal from './Modal';
import { Api } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: string;
  tenantId: string;
}

export default function ShareModal({ open, onClose, documentId, tenantId }: Props) {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([
        Api.listPermissions(documentId),
        Api.listUsers(tenantId).catch(() => ({ members: [] })),
      ]);
      setPermissions(p.permissions);
      setMembers(m.members);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load(); /* eslint-disable-next-line */
  }, [open, documentId]);

  async function addPermission(e: FormEvent) {
    e.preventDefault();
    if (!newUserId) return;
    setSubmitting(true);
    setError(null);
    try {
      await Api.share(documentId, { userId: newUserId, role: newRole });
      setNewUserId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    await Api.updatePermission(documentId, userId, role);
    await load();
  }

  async function revoke(userId: string) {
    if (!confirm('Revoke access for this user?')) return;
    await Api.revokePermission(documentId, userId);
    await load();
  }

  const availableMembers = members.filter(
    (m) => !permissions.some((p) => p.user_id === m.user_id)
  );

  return (
    <Modal open={open} onClose={onClose} title="Share document" size="lg">
      <div className="space-y-4">
        <form onSubmit={addPermission} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Add member</label>
            <select
              className="input"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {availableMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={submitting || !newUserId}>
            <UserPlus size={14} /> Grant access
          </button>
        </form>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="border-t border-slate-200 pt-3">
          <h3 className="font-semibold text-sm mb-2">People with access</h3>
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          <div className="divide-y divide-slate-100">
            {permissions.map((p) => (
              <div key={p.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input max-w-[140px]"
                    value={p.role}
                    onChange={(e) => changeRole(p.user_id, e.target.value)}
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    className="btn btn-ghost text-red-600 hover:bg-red-50"
                    onClick={() => revoke(p.user_id)}
                    title="Revoke"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!loading && permissions.length === 0 && (
              <div className="py-2 text-sm text-slate-500">No one has access yet.</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
