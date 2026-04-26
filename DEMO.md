# Demo script — proving every requirement

> Time required: 5–7 minutes. Two browser windows are enough; three is even better.

Before you start:

1. `cd backend && npm run reset && npm run seed && npm run dev`
2. `cd frontend && npm run dev`
3. Open <http://localhost:5173> in **window A** and **window B** (use a private/incognito window for B so the sessions are isolated).

---

## 1. Multi-tenant isolation (ABC ↔ XYZ cannot see each other)

- **Window A**: log in as `abc-admin@example.com / Admin@123`. You land on the ABC dashboard. Click **Documents** — you see two ABC docs.
- **Window B**: log in as `xyz-admin@example.com / Admin@123`. Click **Documents** — you see only XYZ docs. ABC documents are invisible.
- Optional: from Window A, copy the URL of any ABC document and paste it into Window B. The editor refuses to load it (the API returns 403/404 because the user is not in ABC).

**Proves:** every API filters by `tenant_id`. WebSocket joins are rejected too if the user is not a member.

---

## 2. Super admin can create organizations

- Sign in as `super@platform.com / Super@123`. You land on the **Tenant picker** with a "Super Admin" call-to-action.
- Click **Open Super Admin** → see all tenants and counts.
- Click **New Organization** → fill name + slug + initial admin → submit. The new org appears immediately, with member/doc counts.
- Bonus: log in as the new admin you just created → you land in their fresh tenant.

**Proves:** `POST /organizations`, audit `organization.created`, isolated data per tenant.

---

## 3. Org admin invites users and changes roles

- Sign in as `abc-admin@example.com`. Open **Users**.
- Click **Invite member**, fill in `qa@abc.com / Test User / Welcome@123 / editor` → invite. The new member appears in the table.
- Change their role via the dropdown to **Viewer**.

**Proves:** `POST /organizations/:tenantId/users` and `PATCH …/role`, audit events `user.invited` and `user.role_changed`.

---

## 4. Documents — create, share, RBAC

- Still as `abc-admin@example.com`. Go to **Documents** → **New document**, name it "Q4 Plan" → opens in the editor.
- Click **Share** → grant `abc-editor@example.com` as **Editor** and `abc-viewer@example.com` as **Viewer**. Close.

---

## 5. Real-time collaborative editing (the headline feature)

- Window A: stays on "Q4 Plan" as `abc-admin`.
- Window B: log out, sign in as `abc-editor@example.com / Editor@123`. Click **Documents** → open "Q4 Plan".
- In Window A, start typing a heading and a list. **Watch Window B render the changes live**, including coloured remote cursor & user pill above the cursor (CollaborationCursor extension).
- Switch focus to Window B and type — Window A reflects it instantly.
- Notice the avatar stack in the top right of the editor showing both users.

**Proves:** Yjs CRDT real-time sync over WebSocket, presence/awareness. Top bar shows "Saved just now" — confirming the autosave indicator. Disconnect briefly (close Window B and reopen) — the doc is fully persistent because every Yjs update was appended server-side before broadcast.

### Under the hood (what you are demonstrating)

| What you see | Mechanism |
|----------------|-----------|
| Editor 2 sees Editor 1’s text **while both are online** | **WebSocket** `/collaboration/:tenantId/:documentId` + **Yjs**: the server broadcasts CRDT updates to everyone in the room. |
| Content still there **after refresh or reopen** | **MongoDB**: `GET /api/documents/:id` loads saved `content_html` (and the server hydrates Yjs from snapshot/HTML). |
| “Saved” / persistence without one request per key | Server **debounces** writes to MongoDB; the app also uses **`PUT /api/documents/:id`** with `autosave: true` for HTML backup. |

You are **not** relying on `localStorage` for document body — the database and the socket together provide durability + live sync.

---

## 6. Viewer-only mode

- Open a third window and sign in as `abc-viewer@example.com / Viewer@123`. Open "Q4 Plan".
- Notice the editor:
  - Top bar shows the **Read-only** lock badge.
  - Toolbar buttons are dimmed.
  - Typing has no effect; the cursor doesn't even land in the document.
- The viewer still sees the live edits coming from windows A and B (they receive sync messages).
- Even if you tried to send an update via custom WebSocket frame, the server's per-message permission check rejects writes from a viewer.

**Proves:** Viewer / Editor / Owner RBAC end to end (UI + server WebSocket + REST).

---

## 7. Version history and restore

- As Editor (Window B): make a few edits, wait ~5 seconds.
- Click **History** → you should see at least:
  - `v1` (created)
  - One or more `auto_snapshot` versions
- Click an earlier version → preview pane shows its HTML.
- Switch to Window A (admin or owner). Click **History** → click an older version → **Restore this version**. Confirm.
- A new version row is added (`reason: restored_from_vN`). Title in editor updates to that version's title.
- Open the **Audit Logs** page → an entry appears: `document.version_restored`.

**Proves:** version history with non-destructive restore, audit logging.

---

## 8. Document delete & restore

- As `abc-admin@example.com`, open **Documents**.
- Click the trash icon on "Q4 Plan" → confirm. The doc disappears.
- Tick **Show deleted** → the doc reappears with a "Deleted" badge.
- Click **Restore** → it returns to the active list.

**Proves:** soft-delete + restore + audit trail (`document.deleted`, `document.restored`).

---

## 9. Audit logs page

- As `abc-admin@example.com`, open **Audit Logs**.
- You should see a real, append-only stream of every action you just performed: `auth.login`, `document.created`, `document.shared`, `document.permission_changed`, `document.edited`, `document.deleted`, `document.restored`, `document.version_restored`, `user.invited`, `user.role_changed`.
- Use the action filter to narrow down (e.g., to `document.shared`).

**Proves:** every required audit category is captured.

---

## 10. Tenant isolation in WebSockets (advanced check)

- Open the browser DevTools network tab while in the editor — you see a WS connection to `ws://localhost:4000/collaboration/{tenantId}/{documentId}?token=…`.
- Try changing the tenantId in that URL to a tenant the user doesn't belong to (paste manually): server closes the socket with code `4403 Forbidden`.

**Proves:** room name is `tenantId:documentId` and authorization is enforced at the WebSocket layer, not just the REST layer.

---

## What's been built — checklist

- [x] **Login / Signup** screens
- [x] **Tenant picker** + **Super Admin console**
- [x] **Organization Admin dashboard** (left sidebar: Dashboard · Documents · Users · Audit Logs · Settings)
- [x] **User management** (invite, change role)
- [x] **Document list** (search, RBAC badges, soft delete, restore)
- [x] **Create document** modal
- [x] **Real-time collaborative editor** (TipTap + Yjs)
  - [x] Document title (editable by Owner/Admin)
  - [x] Rich-text editing area
  - [x] Multiple users editing live
  - [x] Typing synchronization (CRDT, conflict free)
  - [x] Cursor / user presence with name labels
  - [x] Autosave (every Yjs update is persisted)
  - [x] Viewer-only mode
  - [x] Editor / Owner mode
  - [x] Last saved indicator
  - [x] List of active collaborators (avatar stack)
- [x] **Share / Grant access modal**
- [x] **Version history panel**
- [x] **Restore version confirmation**
- [x] **Audit logs screen**

Backend / infra:

- [x] All required REST APIs
- [x] WebSocket sync server with auth + tenant + RBAC checks
- [x] Database schema with `tenant_id` on every domain table
- [x] Yjs updates persisted before broadcast (durability before delivery)
- [x] Periodic & on-disconnect snapshot to `document_versions`
- [x] Append-only audit logs
- [x] Demo seed for ABC + XYZ companies
- [x] README + this DEMO script
