import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, RotateCcw, Search, Pencil, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';

export default function DocumentsPage() {
  const { user, activeMembership } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.isSuperAdmin || activeMembership?.role === 'admin';
  const canCreate = isAdmin || activeMembership?.role === 'editor';

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [search, setSearch] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await Api.listDocs(includeDeleted);
      setDocs(data.documents);
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [includeDeleted, activeMembership?.tenant_id]);

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Documents"
        description="All documents shared with you in this organization"
        actions={
          canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New document
            </button>
          )
        }
      />
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
              />
              Show deleted
            </label>
          )}
        </div>

        {error && (
          <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Your role</th>
                <th className="px-5 py-3">Updated</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading…
                    </span>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    {search ? 'No documents match your search.' : 'No documents yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/app/documents/${d.id}`}
                      className="flex items-center gap-2 text-slate-900 font-medium"
                    >
                      <FileText size={14} className="text-brand-600" />
                      {d.title}
                      {d.deleted_at && (
                        <span className="badge badge-red ml-2">Deleted</span>
                      )}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5 ml-6">
                      Created by {d.creator_name || d.creator_email || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge badge-${roleColor(d.my_role)}`}>{d.my_role}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {new Date(d.updated_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        className="btn btn-ghost"
                        onClick={() => navigate(`/app/documents/${d.id}`)}
                      >
                        Open
                      </button>
                      {(isAdmin || d.my_role === 'owner') && !d.deleted_at && (
                        <button
                          className="btn btn-ghost"
                          title="Rename"
                          onClick={() => setRenaming({ id: d.id, title: d.title })}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {(isAdmin || d.my_role === 'owner') && !d.deleted_at && (
                        <button
                          className="btn btn-ghost text-red-600 hover:bg-red-50"
                          title="Delete"
                          onClick={async () => {
                            if (confirm(`Delete "${d.title}"?`)) {
                              try {
                                await Api.deleteDoc(d.id);
                                await load();
                              } catch (e: any) {
                                alert(e?.message || 'Failed to delete');
                              }
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      {(isAdmin || d.my_role === 'owner') && d.deleted_at && (
                        <button
                          className="btn btn-ghost text-green-700"
                          onClick={async () => {
                            try {
                              await Api.restoreDoc(d.id);
                              await load();
                            } catch (e: any) {
                              alert(e?.message || 'Failed to restore');
                            }
                          }}
                        >
                          <RotateCcw size={14} /> Restore
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

      <CreateDocModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (doc) => {
          setShowCreate(false);
          await load();
          navigate(`/app/documents/${doc.id}`);
        }}
      />
      <RenameDocModal
        target={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={async () => {
          setRenaming(null);
          await load();
        }}
      />
    </div>
  );
}

function RenameDocModal({
  target,
  onClose,
  onRenamed,
}: {
  target: { id: string; title: string } | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setTitle(target.title);
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await Api.updateDoc(target!.id, { title });
      onRenamed();
    } catch (e: any) {
      setError(e?.message || 'Failed to rename');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title="Rename document">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="label">New title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateDocModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: any) => void;
}) {
  const [title, setTitle] = useState('Untitled document');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('Untitled document');
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await Api.createDoc(title);
      onCreated(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create document">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create & open'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function roleColor(role: string) {
  return role === 'owner' ? 'blue' : role === 'editor' ? 'green' : role === 'admin' ? 'amber' : 'slate';
}
