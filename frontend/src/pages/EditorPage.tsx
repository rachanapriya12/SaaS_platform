import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Link2 from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';

import {
  ArrowLeft,
  Share2,
  History,
  Save,
  WifiOff,
  Wifi,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Api, getAccessToken, setActiveTenant as setApiTenant } from '../lib/api';
import { CollabProvider, getWebsocketBase } from '../lib/yjs-provider';
import EditorToolbar from '../components/EditorToolbar';
import ShareModal from '../components/ShareModal';
import VersionHistoryPanel from '../components/VersionHistoryPanel';

type Status = 'connecting' | 'connected' | 'disconnected';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export default function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { user, memberships, setActiveTenant } = useAuth();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [synced, setSynced] = useState(false);
  const [title, setTitle] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [activeUsers, setActiveUsers] = useState<
    Array<{ name: string; color: string; clientId: number }>
  >([]);
  const [showShare, setShowShare] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<CollabProvider | null>(null);

  // Step 1: load document metadata + ensure tenant context is correct
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    (async () => {
      // Try fetching with current tenant; if it fails (no tenant set), iterate memberships
      const tryWithTenant = async (tid: string) => {
        setApiTenant(tid);
        return Api.getDoc(documentId);
      };
      try {
        const tenantsToTry = memberships.length > 0
          ? memberships.map((m) => m.tenant_id)
          : [];
        const currentTenant = localStorage.getItem('tenantId');
        const ordered = currentTenant
          ? [currentTenant, ...tenantsToTry.filter((t) => t !== currentTenant)]
          : tenantsToTry;

        let success = false;
        for (const tid of ordered) {
          try {
            const data = await tryWithTenant(tid);
            if (cancelled) return;
            setActiveTenant(tid);
            setDoc(data.document);
            setAccess(data.access);
            setTitle(data.document.title);
            success = true;
            break;
          } catch (err: any) {
            if (err?.status === 404 || err?.status === 403) continue;
            throw err;
          }
        }
        if (!success) {
          throw new Error('You do not have access to this document');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to open');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, memberships]);

  // Step 2: set up Yjs once we have document & access
  useEffect(() => {
    if (!doc || !access || !user) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const token = getAccessToken();
    if (!token) {
      setError('Auth token missing');
      return;
    }
    const provider = new CollabProvider({
      url: getWebsocketBase(),
      tenantId: doc.tenant_id,
      documentId: doc.id,
      token,
      doc: ydoc,
    });
    providerRef.current = provider;

    const userColor = colorFor(user.id);
    provider.awareness.setLocalStateField('user', {
      name: user.name,
      color: userColor,
      id: user.id,
    });

    const offStatus = provider.onStatus(setStatus);
    const offSynced = provider.onSynced(setSynced);

    const onAware = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const list = states
        .filter(([, s]) => s.user)
        .map(([cid, s]) => ({
          name: (s.user.name as string) || 'User',
          color: (s.user.color as string) || '#3b82f6',
          clientId: cid,
        }));
      setActiveUsers(list);
    };
    provider.awareness.on('update', onAware);
    onAware();

    return () => {
      offStatus();
      offSynced();
      provider.awareness.off('update', onAware);
      provider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
    };
  }, [doc?.id, access?.canEdit, user?.id]);

  const editor = useEditor(
    {
      editable: !!access?.canEdit,
      extensions:
        ydocRef.current && providerRef.current
          ? [
              StarterKit.configure({ history: false }),
              Underline,
              Link2.configure({ openOnClick: false }),
              Placeholder.configure({
                placeholder: 'Start typing… your changes are saved and synced in real time.',
              }),
              Collaboration.configure({ document: ydocRef.current }),
              CollaborationCursor.configure({
                provider: providerRef.current,
                user: {
                  name: user?.name || 'User',
                  color: user ? colorFor(user.id) : '#3b82f6',
                },
              }),
            ]
          : [
              StarterKit,
              Underline,
              Link2.configure({ openOnClick: false }),
              Placeholder.configure({ placeholder: 'Loading…' }),
            ],
      onUpdate: () => {
        // Yjs autosaves, just update last-saved indicator with debounce
        scheduleAutosaveIndicator();
      },
    },
    // re-create editor when provider/doc identity changes
    [providerRef.current, ydocRef.current, access?.canEdit]
  );

  const indicatorTimer = useRef<number | null>(null);
  function scheduleAutosaveIndicator() {
    if (indicatorTimer.current) window.clearTimeout(indicatorTimer.current);
    indicatorTimer.current = window.setTimeout(() => setSavedAt(Date.now()), 800);
  }

  async function saveTitle() {
    if (!doc) return;
    if (title.trim() === doc.title) return;
    if (!access?.canDelete) return;
    setSavingTitle(true);
    try {
      const data = await Api.updateDoc(doc.id, { title: title.trim() });
      setDoc(data.document);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename');
      setTitle(doc.title);
    } finally {
      setSavingTitle(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="card p-6 max-w-md">
          <div className="flex items-center gap-2 mb-2 text-red-600">
            <AlertTriangle /> <span className="font-semibold">Cannot open document</span>
          </div>
          <p className="text-sm text-slate-600">{error}</p>
          <button className="btn btn-secondary mt-4" onClick={() => navigate('/app/documents')}>
            Back to documents
          </button>
        </div>
      </div>
    );
  }

  if (!doc || !access) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Opening document…
      </div>
    );
  }

  const canEdit = !!access.canEdit;
  const canManage = !!access.canDelete;
  const canShare = !!access.canShare;

  const myRoleLabel =
    access.effectiveRole === 'admin'
      ? user?.isSuperAdmin
        ? 'Super Admin'
        : 'Admin'
      : access.effectiveRole
      ? access.effectiveRole.charAt(0).toUpperCase() + access.effectiveRole.slice(1)
      : 'Viewer';

  const tenantLabel =
    memberships.find((m) => m.tenant_id === doc.tenant_id)?.tenant_name ||
    (user?.isSuperAdmin ? 'Super admin view' : '');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="px-3 sm:px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link to="/app/documents" className="p-1 rounded hover:bg-slate-100 text-slate-500">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex-1 min-w-0">
              <input
                className="text-base sm:text-lg font-semibold text-slate-900 bg-transparent w-full outline-none focus:bg-slate-50 px-2 py-1 rounded"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                disabled={!canManage}
                title={canManage ? 'Click to rename' : 'Read-only'}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 mt-0.5 text-xs text-slate-500">
                {tenantLabel && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-slate-400">Org:</span>
                    <span className="font-medium text-slate-700">{tenantLabel}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-400">You:</span>
                  <span className={`badge badge-${roleBadgeColor(access.effectiveRole)}`}>
                    {myRoleLabel}
                  </span>
                </span>
                <SaveStatus
                  status={status}
                  synced={synced}
                  savedAt={savedAt}
                  savingTitle={savingTitle}
                />
                {!canEdit && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <Lock size={12} /> Read-only
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <ActiveCollaborators users={activeUsers} />
            <button className="btn btn-secondary" onClick={() => setShowVersions(true)}>
              <History size={14} /> <span className="hidden sm:inline">History</span>
            </button>
            {canShare && (
              <button className="btn btn-primary" onClick={() => setShowShare(true)}>
                <Share2 size={14} /> <span className="hidden sm:inline">Share</span>
              </button>
            )}
          </div>
        </div>
        <EditorToolbar editor={editor} disabled={!canEdit} />
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-soft border border-slate-200 px-12 py-10 min-h-[70vh] tiptap-editor">
          {!synced && (
            <div className="text-xs text-slate-400 mb-2">Loading document state…</div>
          )}
          <EditorContent editor={editor} />
        </div>
      </main>

      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        documentId={doc.id}
        tenantId={doc.tenant_id}
      />
      <VersionHistoryPanel
        open={showVersions}
        onClose={() => setShowVersions(false)}
        documentId={doc.id}
        canRestore={canManage}
        onRestored={() => {
          // Reload doc after restore to update title
          Api.getDoc(doc.id).then((d) => {
            setDoc(d.document);
            setTitle(d.document.title);
          });
        }}
      />
    </div>
  );
}

function SaveStatus({
  status,
  synced,
  savedAt,
  savingTitle,
}: {
  status: Status;
  synced: boolean;
  savedAt: number | null;
  savingTitle: boolean;
}) {
  if (status !== 'connected') {
    return (
      <span className="inline-flex items-center gap-1">
        <WifiOff size={12} className="text-red-500" />
        {status === 'connecting' ? 'Connecting…' : 'Disconnected — reconnecting…'}
      </span>
    );
  }
  if (!synced) {
    return (
      <span className="inline-flex items-center gap-1">
        <Wifi size={12} className="text-amber-500" /> Syncing…
      </span>
    );
  }
  if (savingTitle) {
    return (
      <span className="inline-flex items-center gap-1">
        <Save size={12} /> Saving title…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CheckCircle2 size={12} />
      {savedAt ? `Saved ${formatRelative(savedAt)}` : 'All changes saved'}
    </span>
  );
}

function ActiveCollaborators({
  users,
}: {
  users: Array<{ name: string; color: string; clientId: number }>;
}) {
  if (users.length === 0) return null;
  return (
    <div className="flex -space-x-2">
      {users.slice(0, 5).map((u) => (
        <div
          key={u.clientId}
          title={u.name}
          className="w-7 h-7 rounded-full text-xs text-white flex items-center justify-center font-semibold ring-2 ring-white"
          style={{ backgroundColor: u.color }}
        >
          {initials(u.name)}
        </div>
      ))}
      {users.length > 5 && (
        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs flex items-center justify-center font-semibold ring-2 ring-white">
          +{users.length - 5}
        </div>
      )}
    </div>
  );
}

function initials(n: string) {
  const parts = n.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function roleBadgeColor(role: string | undefined) {
  switch (role) {
    case 'admin':
      return 'red';
    case 'owner':
      return 'indigo';
    case 'editor':
      return 'emerald';
    case 'viewer':
      return 'slate';
    default:
      return 'slate';
  }
}
