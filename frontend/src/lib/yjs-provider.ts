/* Custom Yjs WebSocket provider with auth token & tenant in URL */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface ProviderOptions {
  url: string;
  documentId: string;
  tenantId: string;
  token: string;
  doc: Y.Doc;
}

type StatusListener = (status: 'connecting' | 'connected' | 'disconnected') => void;

export class CollabProvider {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  ws: WebSocket | null = null;
  shouldConnect = true;
  status: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private url: string;
  private documentId: string;
  private tenantId: string;
  private token: string;
  private statusListeners: Set<StatusListener> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private synced = false;
  private syncedListeners: Set<(synced: boolean) => void> = new Set();

  constructor(opts: ProviderOptions) {
    this.doc = opts.doc;
    this.url = opts.url;
    this.documentId = opts.documentId;
    this.tenantId = opts.tenantId;
    this.token = opts.token;
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    window.addEventListener('beforeunload', this.beforeUnload);

    this.connect();
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onSynced(fn: (synced: boolean) => void) {
    this.syncedListeners.add(fn);
    fn(this.synced);
    return () => this.syncedListeners.delete(fn);
  }

  private setStatus(s: 'connecting' | 'connected' | 'disconnected') {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  private setSynced(v: boolean) {
    if (this.synced === v) return;
    this.synced = v;
    for (const l of this.syncedListeners) l(v);
  }

  connect() {
    if (this.ws) return;
    this.shouldConnect = true;
    this.setStatus('connecting');
    const fullUrl = `${this.url}/collaboration/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(
      this.documentId
    )}?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(fullUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      // Send sync step 1
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));

      // Broadcast our awareness state
      if (this.awareness.getLocalState() !== null) {
        const aEnc = encoding.createEncoder();
        encoding.writeVarUint(aEnc, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          aEnc,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.awareness.clientID])
        );
        ws.send(encoding.toUint8Array(aEnc));
      }
    };
    ws.onmessage = (e) => {
      const data = new Uint8Array(e.data as ArrayBuffer);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
          // syncMessageType 1 = SyncStep2 (server replied with full state)
          if (syncMessageType === 1) {
            this.setSynced(true);
          }
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
          break;
        }
        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            this
          );
          break;
        }
      }
    };
    ws.onerror = () => {
      // ignore — handled in close
    };
    ws.onclose = () => {
      this.ws = null;
      this.setSynced(false);
      this.setStatus('disconnected');
      if (this.shouldConnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 500 * 2 ** Math.min(this.reconnectAttempts, 6));
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  destroy() {
    this.disconnect();
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      'destroy'
    );
    window.removeEventListener('beforeunload', this.beforeUnload);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return;
    const changedClients = added.concat(updated, removed);
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    );
    ws.send(encoding.toUint8Array(encoder));
  };

  private beforeUnload = () => {
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      'window unload'
    );
  };
}

export function getWebsocketBase() {
  const apiBase = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:4000';
  return apiBase.replace(/^http/, 'ws');
}
