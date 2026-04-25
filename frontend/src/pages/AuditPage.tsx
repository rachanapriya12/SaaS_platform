import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';

const ACTIONS = [
  '',
  'auth.login',
  'auth.logout',
  'auth.signup',
  'org.create',
  'org.update',
  'org.deactivate',
  'user.invite',
  'user.role_changed',
  'user.removed',
  'user.deactivated',
  'doc.create',
  'doc.update',
  'doc.rename',
  'doc.delete',
  'doc.restore',
  'doc.share',
  'doc.unshare',
  'doc.role_changed',
  'doc.version_created',
  'doc.version_restored',
];

export default function AuditPage() {
  const { user, activeMembership } = useAuth();
  const isAdmin = user?.isSuperAdmin || activeMembership?.role === 'admin';
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await Api.audit({ action: action || undefined, limit: 200 });
      setLogs(data.logs);
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (isAdmin) load(); /* eslint-disable-next-line */
  }, [action, activeMembership?.tenant_id]);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Audit Logs" />
        <div className="p-8 text-slate-500">Admin only.</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Append-only event stream for this organization"
      />
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <label className="text-sm text-slate-500">Filter by action:</label>
          <select
            className="input max-w-full sm:max-w-[260px]"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a || 'All actions'}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm mb-4">{error}</div>
        )}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-slate-50 text-left text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && logs.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      No events.
                    </td>
                  </tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{l.actor_email || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {l.target_type ? (
                        <span>
                          <span className="text-xs text-slate-400 mr-1">{l.target_type}:</span>
                          <span className="font-mono text-xs">
                            {String(l.target_id || '').slice(0, 8)}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 font-mono max-w-md truncate">
                      {formatMeta(l.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMeta(m: unknown): string {
  if (m == null) return '';
  if (typeof m === 'string') return m;
  try {
    return JSON.stringify(m);
  } catch {
    return String(m);
  }
}
