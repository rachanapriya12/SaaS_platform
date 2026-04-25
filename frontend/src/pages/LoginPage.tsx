import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!loading && user) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  function fill(e: string, p: string) {
    setEmail(e);
    setPassword(p);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-10">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 backdrop-blur w-9 h-9 rounded-lg flex items-center justify-center font-bold">
            C
          </div>
          <div className="text-lg font-semibold">CollabDocs</div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">
            Real-time, multi-tenant document collaboration
          </h1>
          <p className="text-white/80 mt-4 max-w-md">
            Open the same document in two browsers and watch edits sync instantly with live
            cursors, version history, and audit logs — all isolated per organization.
          </p>
          <ul className="mt-8 space-y-2 text-white/85 text-sm">
            <li>• CRDT-based real-time editing (Yjs)</li>
            <li>• Strict tenant isolation</li>
            <li>• Owner / Editor / Viewer roles</li>
            <li>• Version history with one-click restore</li>
          </ul>
        </div>
        <div className="text-xs text-white/60">
          © 2026 CollabDocs · Multi-tenant SaaS demo
        </div>
      </div>

      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="card w-full max-w-md p-8">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="text-slate-500 text-sm mt-1 mb-6">Welcome back. Enter your credentials.</p>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded mb-3">
              {error}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary w-full justify-center" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="mt-4 text-sm text-slate-500">
            New here?{' '}
            <Link to="/signup" className="text-brand-600 hover:underline">
              Create an account
            </Link>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
              Demo accounts
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs max-h-56 overflow-y-auto pr-1">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-slate-100 text-left"
                  onClick={() => fill(d.email, d.password)}
                >
                  <span className="text-slate-700">
                    <span className={`badge badge-${d.color} mr-2`}>{d.label}</span>
                    {d.email}
                  </span>
                  <span className="text-slate-400">{d.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEMO_ACCOUNTS = [
  { email: 'super@platform.com',       password: 'Super@123',  label: 'Super',      color: 'amber' },
  { email: 'abc-admin@example.com',    password: 'Admin@123',  label: 'ABC Admin',  color: 'blue' },
  { email: 'abc-editor@example.com',   password: 'Editor@123', label: 'ABC Editor', color: 'green' },
  { email: 'abc-editor2@example.com',  password: 'Editor@123', label: 'ABC Editor', color: 'green' },
  { email: 'abc-editor3@example.com',  password: 'Editor@123', label: 'ABC Editor', color: 'green' },
  { email: 'abc-viewer@example.com',   password: 'Viewer@123', label: 'ABC Viewer', color: 'slate' },
  { email: 'abc-viewer2@example.com',  password: 'Viewer@123', label: 'ABC Viewer', color: 'slate' },
  { email: 'xyz-admin@example.com',    password: 'Admin@123',  label: 'XYZ Admin',  color: 'blue' },
  { email: 'xyz-editor@example.com',   password: 'Editor@123', label: 'XYZ Editor', color: 'green' },
  { email: 'xyz-editor2@example.com',  password: 'Editor@123', label: 'XYZ Editor', color: 'green' },
  { email: 'xyz-editor3@example.com',  password: 'Editor@123', label: 'XYZ Editor', color: 'green' },
  { email: 'xyz-viewer@example.com',   password: 'Viewer@123', label: 'XYZ Viewer', color: 'slate' },
];
