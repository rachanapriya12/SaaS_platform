import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  ScrollText,
  Settings,
  LogOut,
  Building2,
  Crown,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/documents', label: 'Documents', icon: FileText },
  { to: '/app/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/app/audit', label: 'Audit Logs', icon: ScrollText, adminOnly: true },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, activeMembership, memberships, setActiveTenant, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.isSuperAdmin || activeMembership?.role === 'admin';

  const sidebar = (
    <>
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-brand-500 w-8 h-8 rounded-lg flex items-center justify-center font-bold">
            C
          </div>
          <div>
            <div className="font-semibold">CollabDocs</div>
            <div className="text-xs text-slate-400">Real-time SaaS</div>
          </div>
        </div>
        <button
          className="md:hidden text-slate-400"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <div className="px-3 py-3 border-b border-slate-800">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-1 px-2">
          Organization
        </div>
        <div className="px-2 py-2 rounded-md bg-slate-800/60 flex items-center gap-2">
          <Building2 size={14} className="text-slate-400" />
          <span className="text-sm font-medium truncate flex-1">
            {activeMembership?.tenant_name || 'Loading…'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">
            {user?.isSuperAdmin && activeMembership?.role === 'admin' && !activeMembership.tenant_slug
              ? 'super'
              : activeMembership?.role || '—'}
          </span>
        </div>
        {(memberships.length > 1 || user?.isSuperAdmin) && (
          <button
            onClick={() => {
              setActiveTenant(null);
              setMobileOpen(false);
              navigate('/tenants');
            }}
            className="mt-2 w-full text-left text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
          >
            Switch organization →
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )
              }
            >
              <Icon size={16} />
              {item.label}
            </NavLink>
          );
        })}
        {user?.isSuperAdmin && (
          <NavLink
            to="/super-admin"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-amber-300 hover:bg-slate-800"
          >
            <Crown size={16} />
            Super Admin
          </NavLink>
        )}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <div className="px-2 py-2 mb-2">
          <div className="text-sm font-medium truncate">{user?.name}</div>
          <div className="text-xs text-slate-400 truncate">{user?.email}</div>
        </div>
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-100 flex-col shrink-0">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 text-slate-100 flex flex-col">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden bg-slate-50 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded hover:bg-slate-100">
            <Menu size={20} />
          </button>
          <div className="font-semibold">CollabDocs</div>
          <div className="ml-auto text-xs text-slate-500 truncate max-w-[40%]">
            {activeMembership?.tenant_name || ''}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
