import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import {
  Api,
  loadStoredAuth,
  setAuth as setApiAuth,
  setActiveTenant as setApiTenant,
  getActiveTenant,
  getAccessToken,
} from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface Membership {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role: 'admin' | 'editor' | 'viewer';
}

interface AuthContextValue {
  user: AuthUser | null;
  memberships: Membership[];
  activeTenantId: string | null;
  activeMembership: Membership | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveTenant: (tenantId: string | null) => void;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeTenantId, setActiveTenantState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
    const tid = getActiveTenant();
    if (tid) setActiveTenantState(tid);
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    Api.me()
      .then((data) => {
        setUser(data.user);
        setMemberships((data.memberships || []) as Membership[]);
      })
      .catch(() => {
        setApiAuth({ accessToken: null, refreshToken: null });
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await Api.login(email, password);
    setApiAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setMemberships(data.memberships as Membership[]);
    if (data.memberships.length === 1) {
      setApiTenant(data.memberships[0].tenant_id);
      setActiveTenantState(data.memberships[0].tenant_id);
    } else {
      setApiTenant(null);
      setActiveTenantState(null);
    }
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    await Api.register(email, name, password);
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refreshToken') || '';
    try {
      if (refresh) await Api.logout(refresh);
    } catch {
      /* ignore */
    }
    setApiAuth({ accessToken: null, refreshToken: null });
    setApiTenant(null);
    setUser(null);
    setMemberships([]);
    setActiveTenantState(null);
  }, []);

  const setActiveTenant = useCallback((tid: string | null) => {
    setApiTenant(tid);
    setActiveTenantState(tid);
  }, []);

  const refreshMemberships = useCallback(async () => {
    if (!user) return;
    const data = await Api.me();
    setMemberships((data.memberships || []) as Membership[]);
  }, [user]);

  /**
   * Super admins do not have explicit memberships. Synthesize an
   * admin-level membership so the rest of the UI (which gates many actions
   * on `activeMembership.role === 'admin'`) keeps working when they enter
   * an organization.
   */
  let activeMembership: Membership | null =
    memberships.find((m) => m.tenant_id === activeTenantId) || null;
  if (!activeMembership && user?.isSuperAdmin && activeTenantId) {
    activeMembership = {
      tenant_id: activeTenantId,
      tenant_name: 'Super admin view',
      tenant_slug: '',
      role: 'admin',
    };
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      memberships,
      activeTenantId,
      activeMembership,
      loading,
      login,
      register,
      logout,
      setActiveTenant,
      refreshMemberships,
    }),
    [user, memberships, activeTenantId, activeMembership, loading, login, register, logout, setActiveTenant, refreshMemberships]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
