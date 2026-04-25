import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user, activeMembership } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="p-8 max-w-2xl space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Profile</h3>
          <div className="text-sm text-slate-600">
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Name</span>
              <span className="col-span-2">{user?.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Email</span>
              <span className="col-span-2">{user?.email}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Account type</span>
              <span className="col-span-2">
                {user?.isSuperAdmin ? 'Platform super admin' : 'Standard user'}
              </span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Organization</h3>
          <div className="text-sm text-slate-600">
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Name</span>
              <span className="col-span-2">{activeMembership?.tenant_name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Slug</span>
              <span className="col-span-2 font-mono text-xs">{activeMembership?.tenant_slug}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-slate-500">Your role</span>
              <span className="col-span-2 capitalize">{activeMembership?.role}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
