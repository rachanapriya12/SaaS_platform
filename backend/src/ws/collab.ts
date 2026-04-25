import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import * as Y from 'yjs';
import { verifyAccessToken } from '../utils/jwt';
import { resolveDocAccess } from '../utils/permissions';
import { writeAudit } from '../utils/audit';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { DocumentDoc, User, Version, YjsUpdate } from '../models';

/* ------------------------------------------------------------------ *
 *   Y-WebSocket compatible server with auth + tenant/permission gate *
 *   (MongoDB persistence)                                            *
 * ------------------------------------------------------------------ */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface DocSession {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, ConnContext>;
  versionTimer: NodeJS.Timeout | null;
  versionDirty: boolean;
}

interface ConnContext {
  userId: string;
  userEmail: string;
  userName: string;
  canEdit: boolean;
  canManage: boolean;
  tenantId: string;
  documentId: string;
  controlledIds: Set<number>;
}

const sessions = new Map<string, DocSession>(); // key: tenantId:documentId
const VERSION_INTERVAL_MS = 2 * 60 * 1000; // autosnapshot every 2 minutes when dirty

function roomKey(tenantId: string, documentId: string) {
  return `${tenantId}:${documentId}`;
}

async function loadDocFromStorage(tenantId: string, documentId: string): Promise<Y.Doc> {
  const ydoc = new Y.Doc();
  const updates = await YjsUpdate.find({ tenantId, documentId })
    .sort({ _id: 1 })
    .lean();
  if (updates.length > 0) {
    ydoc.transact(() => {
      for (const row of updates) {
        try {
          Y.applyUpdate(ydoc, new Uint8Array((row.updateData as any).buffer || row.updateData));
        } catch (e) {
          console.error('[ws] applyUpdate failed', e);
        }
      }
    });
  }
  return ydoc;
}

const sessionLocks = new Map<string, Promise<DocSession>>();
function getOrCreateSession(tenantId: string, documentId: string): Promise<DocSession> {
  const key = roomKey(tenantId, documentId);
  const existing = sessions.get(key);
  if (existing) return Promise.resolve(existing);
  const lock = sessionLocks.get(key);
  if (lock) return lock;

  const created = (async () => {
    const ydoc = await loadDocFromStorage(tenantId, documentId);
    const awareness = new awarenessProtocol.Awareness(ydoc);
    awareness.setLocalState(null);

    const session: DocSession = {
      ydoc,
      awareness,
      conns: new Map(),
      versionTimer: null,
      versionDirty: false,
    };
    sessions.set(key, session);

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      persistUpdate(tenantId, documentId, update);
      session.versionDirty = true;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const ws of session.conns.keys()) {
        if (ws !== origin) sendBytes(ws, message);
      }
    });

    awareness.on(
      'update',
      (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: WebSocket | null
      ) => {
        const changedClients = changes.added.concat(changes.updated, changes.removed);
        if (origin) {
          const ctx = session.conns.get(origin);
          if (ctx) {
            for (const id of changes.added) ctx.controlledIds.add(id);
            for (const id of changes.removed) ctx.controlledIds.delete(id);
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder);
        for (const ws of session.conns.keys()) sendBytes(ws, message);
      }
    );

    session.versionTimer = setInterval(() => {
      if (session.versionDirty) {
        autoSnapshotVersion(tenantId, documentId, ydoc);
        session.versionDirty = false;
      }
    }, VERSION_INTERVAL_MS);

    return session;
  })();
  sessionLocks.set(key, created);
  created.finally(() => sessionLocks.delete(key));
  return created;
}

function sendBytes(ws: WebSocket, bytes: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(bytes);
  } catch {
    /* ignore */
  }
}

async function persistUpdate(tenantId: string, documentId: string, update: Uint8Array) {
  try {
    await YjsUpdate.create({
      tenantId,
      documentId,
      updateData: Buffer.from(update),
    });
    await DocumentDoc.updateOne({ _id: documentId }, { $set: { updatedAt: new Date() } });
  } catch (err) {
    console.error('[ws] persistUpdate failed:', err);
  }
}

async function autoSnapshotVersion(tenantId: string, documentId: string, ydoc: Y.Doc) {
  try {
    const doc = await DocumentDoc.findOne({ _id: documentId, tenantId }, 'title').lean();
    if (!doc) return;
    const html = yDocToHtml(ydoc);
    const last = await Version.findOne({ documentId }).sort({ versionNumber: -1 }).lean();
    if (last && last.contentHtml === html) return;
    const next = (last?.versionNumber ?? 0) + 1;
    await Version.create({
      tenantId,
      documentId,
      versionNumber: next,
      title: doc.title,
      contentHtml: html,
      createdBy: null,
      reason: 'auto_snapshot',
    });
  } catch (err) {
    console.error('[ws] autoSnapshotVersion failed:', err);
  }
}

function yDocToHtml(ydoc: Y.Doc): string {
  const frag = ydoc.getXmlFragment('default');
  function nodeToHtml(node: Y.XmlElement | Y.XmlText | Y.XmlFragment): string {
    if (node instanceof Y.XmlText) return escapeHtml(node.toString());
    if (node instanceof Y.XmlElement) {
      const tag = node.nodeName || 'div';
      let inner = '';
      for (const c of node.toArray()) inner += nodeToHtml(c as any);
      return `<${tag}>${inner}</${tag}>`;
    }
    if (node instanceof Y.XmlFragment) {
      return node.toArray().map((c) => nodeToHtml(c as any)).join('');
    }
    return '';
  }
  try {
    return nodeToHtml(frag);
  } catch {
    return '';
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ----------------------------------------------------------- */
/*  Per-connection authentication & message handling           */
/* ----------------------------------------------------------- */

interface AuthInput {
  token: string;
  tenantId: string;
  documentId: string;
}

function parseAuthFromUrl(req: IncomingMessage): AuthInput | null {
  if (!req.url) return null;
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'collaboration') return null;
  const tenantId = parts[1];
  const documentId = parts[2];
  const token = url.searchParams.get('token') || '';
  if (!token) return null;
  return { tenantId, documentId, token };
}

export function attachCollabWebsocket(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const auth = parseAuthFromUrl(req);
    if (!auth) {
      ws.close(4400, 'Bad request');
      return;
    }
    let payload;
    try {
      payload = verifyAccessToken(auth.token);
    } catch {
      ws.close(4401, 'Invalid token');
      return;
    }

    try {
      const userRow = await User.findById(payload.sub).lean();
      if (!userRow || userRow.isDeactivated) {
        ws.close(4401, 'Invalid user');
        return;
      }

      const doc = await DocumentDoc.findOne({ _id: auth.documentId, tenantId: auth.tenantId }).lean();
      if (!doc) {
        ws.close(4404, 'Document not found');
        return;
      }
      const access = await resolveDocAccess({
        userId: String(userRow._id),
        isSuperAdmin: !!userRow.isSuperAdmin,
        documentId: auth.documentId,
      });
      if (!access.canView) {
        ws.close(4403, 'Forbidden');
        return;
      }

      const session = await getOrCreateSession(auth.tenantId, auth.documentId);
      const ctx: ConnContext = {
        userId: String(userRow._id),
        userEmail: userRow.email,
        userName: userRow.name,
        canEdit: access.canEdit,
        canManage: access.canDelete,
        tenantId: auth.tenantId,
        documentId: auth.documentId,
        controlledIds: new Set<number>(),
      };
      session.conns.set(ws, ctx);

      ws.binaryType = 'arraybuffer';

      /* Initial sync */
      {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, session.ydoc);
        sendBytes(ws, encoding.toUint8Array(encoder));

        const states = session.awareness.getStates();
        if (states.size > 0) {
          const aEncoder = encoding.createEncoder();
          encoding.writeVarUint(aEncoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            aEncoder,
            awarenessProtocol.encodeAwarenessUpdate(
              session.awareness,
              Array.from(states.keys())
            )
          );
          sendBytes(ws, encoding.toUint8Array(aEncoder));
        }
      }

      ws.on('message', (data) => {
        const buf =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : Array.isArray(data)
            ? new Uint8Array(Buffer.concat(data))
            : new Uint8Array(data as Buffer);
        try {
          const decoder = decoding.createDecoder(buf);
          const messageType = decoding.readVarUint(decoder);
          switch (messageType) {
            case MESSAGE_SYNC: {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, MESSAGE_SYNC);
              const syncMessageType = syncProtocol.readSyncMessage(
                decoder,
                encoder,
                session.ydoc,
                ws
              );
              if (!ctx.canEdit && (syncMessageType === 1 || syncMessageType === 2)) {
                /* discard writes from viewers */
              }
              if (encoding.length(encoder) > 1) {
                sendBytes(ws, encoding.toUint8Array(encoder));
              }
              if (ctx.canEdit && syncMessageType === 2) {
                throttledEditAudit(ctx);
              }
              break;
            }
            case MESSAGE_AWARENESS: {
              awarenessProtocol.applyAwarenessUpdate(
                session.awareness,
                decoding.readVarUint8Array(decoder),
                ws
              );
              break;
            }
          }
        } catch (err) {
          console.error('ws message error', err);
        }
      });

      ws.on('close', () => {
        try {
          session.conns.delete(ws);
          awarenessProtocol.removeAwarenessStates(
            session.awareness,
            Array.from(ctx.controlledIds),
            null
          );
          if (session.conns.size === 0) {
            if (session.versionDirty) {
              autoSnapshotVersion(ctx.tenantId, ctx.documentId, session.ydoc);
            }
            if (session.versionTimer) clearInterval(session.versionTimer);
            session.ydoc.destroy();
            sessions.delete(roomKey(ctx.tenantId, ctx.documentId));
          }
        } catch (err) {
          console.error('[ws] close handler error:', err);
        }
      });

      ws.on('error', (err) => {
        console.error('[ws] socket error:', err);
      });
    } catch (e) {
      console.error('[ws] connect error', e);
      try {
        ws.close(1011, 'Server error');
      } catch {
        /* ignore */
      }
    }
  });
}

/* Audit throttle */
const lastAuditAt = new Map<string, number>();
function throttledEditAudit(ctx: ConnContext) {
  const key = `${ctx.tenantId}:${ctx.documentId}:${ctx.userId}`;
  const now = Date.now();
  const last = lastAuditAt.get(key) ?? 0;
  if (now - last < 60_000) return;
  lastAuditAt.set(key, now);
  writeAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: 'doc.update',
    targetType: 'document',
    targetId: ctx.documentId,
    metadata: { source: 'realtime' },
  });
}

/* Stats helpers used by /stats route */
export function getActiveCollaboratorCount(tenantId: string): number {
  const seen = new Set<string>();
  for (const [key, session] of sessions.entries()) {
    if (!key.startsWith(tenantId + ':')) continue;
    for (const ctx of session.conns.values()) seen.add(ctx.userId);
  }
  return seen.size;
}

export function getAllActiveCollaboratorCount(): number {
  const seen = new Set<string>();
  for (const session of sessions.values()) {
    for (const ctx of session.conns.values()) seen.add(ctx.userId);
  }
  return seen.size;
}
