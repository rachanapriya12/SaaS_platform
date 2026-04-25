import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Users, ScrollText, Activity, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';
import PageHeader from '../components/PageHeader';

export default function DashboardPage() {
  const { user, activeMembership } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    users: number;
    documents: number;
    active_collaborators: number;
    recent: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.isSuperAdmin || activeMembership?.role === 'admin';

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [d, s] = await Promise.all([Api.listDocs(), Api.stats()]);
        if (!active) return;
        setDocs(d.documents);
        setStats(s);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeMembership?.tenant_id]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`}
        description={`You're working in ${activeMembership?.tenant_name || 'this organization'}`}
      />
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {error && (
          <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat
            icon={<FileText size={18} />}
            label="Documents"
            value={stats?.documents ?? docs.length}
            link="/app/documents"
          />
          {isAdmin && (
            <Stat
              icon={<Users size={18} />}
              label="Members"
              value={stats?.users ?? 0}
              link="/app/users"
            />
          )}
          <Stat
            icon={<Activity size={18} />}
            label="Active now"
            value={stats?.active_collaborators ?? 0}
          />
          <Stat
            icon={<ScrollText size={18} />}
            label="Your role"
            value={user?.isSuperAdmin ? 'Super Admin' : activeMembership?.role || '—'}
            stringValue
            link={isAdmin ? '/app/audit' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Recent documents</h3>
              <Link className="text-sm text-brand-600 hover:underline" to="/app/documents">
                View all
              </Link>
            </div>
            {loading && (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            )}
            {!loading && docs.length === 0 && (
              <div className="text-sm text-slate-500">No documents yet.</div>
            )}
            <div className="divide-y divide-slate-100">
              {docs.slice(0, 6).map((d: any) => (
                <Link
                  key={d.id}
                  to={`/app/documents/${d.id}`}
                  className="flex items-center justify-between py-3 hover:bg-slate-50 px-2 rounded"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="text-brand-600 shrink-0" size={18} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{d.title}</div>
                      <div className="text-xs text-slate-500">
                        Updated {new Date(d.updated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className={`badge badge-${roleColor(d.my_role)} ml-2`}>{d.my_role}</span>
                </Link>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Recent activity</h3>
                <Link className="text-sm text-brand-600 hover:underline" to="/app/audit">
                  View all
                </Link>
              </div>
              {!loading && (stats?.recent?.length ?? 0) === 0 && (
                <div className="text-sm text-slate-500">No activity yet.</div>
              )}
              <div className="space-y-2">
                {(stats?.recent || []).map((a: any) => (
                  <div key={a.id} className="text-xs text-slate-700 flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-[10px] text-slate-400 mr-2">
                        {new Date(a.created_at).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold">{a.actor_email || 'system'}</span>{' '}
                      <span className="text-slate-500">→</span>{' '}
                      <span className="font-mono">{a.action}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  link,
  stringValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  link?: string;
  stringValue?: boolean;
}) {
  const inner = (
    <div className="card p-4 flex items-center gap-3 hover:shadow-md transition">
      <div className="bg-brand-50 text-brand-700 p-2 rounded-md">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold capitalize truncate">
          {stringValue ? value : value}
        </div>
      </div>
    </div>
  );
  if (link) return <Link to={link}>{inner}</Link>;
  return inner;
}

function roleColor(role: string) {
  return role === 'owner'
    ? 'blue'
    : role === 'editor'
    ? 'green'
    : role === 'admin'
    ? 'amber'
    : 'slate';
}
