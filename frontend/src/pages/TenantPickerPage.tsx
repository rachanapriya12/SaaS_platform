import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Crown, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Api } from '../lib/api';

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  member_count?: number;
  doc_count?: number;
}

export default function TenantPickerPage() {
  const { user, memberships, setActiveTenant, logout } = useAuth();
  const navigate = useNavigate();
  const [allTenants, setAllTenants] = useState<AdminTenant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.isSuperAdmin) return;
    setLoading(true);
    Api.listOrgs()
      .then((res) => setAllTenants(res.tenants as AdminTenant[]))
      .catch((e) => setError(e?.message || 'Failed to load organizations'))
      .finally(() => setLoading(false));
  }, [user?.isSuperAdmin]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-brand-600 w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold">
            C
          </div>
          <div>
            <div className="text-xl font-semibold">CollabDocs</div>
            <div className="text-sm text-slate-500">Hi {user?.name}, choose an organization</div>
          </div>
        </div>

        {user?.isSuperAdmin && (
          <div className="card p-4 mb-4 flex items-center justify-between bg-gradient-to-r from-amber-50 to-amber-100/40 border-amber-200">
            <div className="flex items-center gap-3">
              <Crown className="text-amber-600" />
              <div>
                <div className="font-semibold">Platform Super Admin</div>
                <div className="text-sm text-slate-600">
                  You can enter any organization below and act as full admin.
                </div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/super-admin')}>
              Super Admin Console
            </button>
          </div>
        )}

        {/* Memberships block (regular users) */}
        {!user?.isSuperAdmin && (
          <div className="space-y-2">
            {memberships.length === 0 && (
              <div className="card p-6 text-slate-500 text-sm">
                You don't belong to any organization yet. Ask an admin to invite you.
              </div>
            )}
            {memberships.map((m) => (
              <button
                key={m.tenant_id}
                onClick={() => {
                  setActiveTenant(m.tenant_id);
                  navigate('/app');
                }}
                className="card w-full p-4 flex items-center justify-between hover:border-brand-400 hover:shadow-md transition text-left"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="text-brand-600" />
                  <div>
                    <div className="font-semibold text-slate-900">{m.tenant_name}</div>
                    <div className="text-sm text-slate-500">{m.tenant_slug}</div>
                  </div>
                </div>
                <span className={`badge badge-${roleColor(m.role)}`}>{m.role}</span>
              </button>
            ))}
          </div>
        )}

        {/* Super-admin: pick any org */}
        {user?.isSuperAdmin && (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-500 mt-4 mb-2">
              All organizations
            </div>
            {loading && (
              <div className="card p-6 text-slate-500 text-sm flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} /> Loading organizations…
              </div>
            )}
            {error && (
              <div className="card p-6 border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
            )}
            {!loading && !error && (allTenants?.length ?? 0) === 0 && (
              <div className="card p-6 text-slate-500 text-sm">
                No organizations exist yet. Use the Super Admin Console to create one.
              </div>
            )}
            <div className="space-y-2">
              {(allTenants || []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTenant(t.id);
                    navigate('/app');
                  }}
                  className="card w-full p-4 flex items-center justify-between hover:border-brand-400 hover:shadow-md transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="text-brand-600" />
                    <div>
                      <div className="font-semibold text-slate-900">{t.name}</div>
                      <div className="text-sm text-slate-500">slug: {t.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    {t.member_count != null && <span>{t.member_count} members</span>}
                    {t.doc_count != null && <span>{t.doc_count} docs</span>}
                    <span className="badge badge-amber">enter as admin</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 text-sm">
          <button onClick={logout} className="text-slate-500 hover:text-slate-700">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function roleColor(role: string) {
  return role === 'admin' ? 'blue' : role === 'editor' ? 'green' : 'slate';
}
