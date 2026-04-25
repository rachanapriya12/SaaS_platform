import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import TenantPickerPage from './pages/TenantPickerPage';
import SuperAdminPage from './pages/SuperAdminPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import EditorPage from './pages/EditorPage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/AppShell';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function TenantScoped({ children }: { children: JSX.Element }) {
  const { user, loading, activeTenantId, memberships } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!activeTenantId) {
    if (user.isSuperAdmin && memberships.length === 0) {
      return <Navigate to="/super-admin" replace />;
    }
    return <Navigate to="/tenants" replace />;
  }
  return <AppShell>{children}</AppShell>;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route
        path="/tenants"
        element={
          <ProtectedRoute>
            <TenantPickerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin"
        element={
          <ProtectedRoute>
            <SuperAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app"
        element={
          <TenantScoped>
            <DashboardPage />
          </TenantScoped>
        }
      />
      <Route
        path="/app/documents"
        element={
          <TenantScoped>
            <DocumentsPage />
          </TenantScoped>
        }
      />
      <Route
        path="/app/users"
        element={
          <TenantScoped>
            <UsersPage />
          </TenantScoped>
        }
      />
      <Route
        path="/app/audit"
        element={
          <TenantScoped>
            <AuditPage />
          </TenantScoped>
        }
      />
      <Route
        path="/app/settings"
        element={
          <TenantScoped>
            <SettingsPage />
          </TenantScoped>
        }
      />
      <Route
        path="/app/documents/:documentId"
        element={
          <ProtectedRoute>
            <EditorPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
