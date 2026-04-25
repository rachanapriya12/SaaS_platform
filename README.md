# CollabDocs

A multi-tenant SaaS platform for real-time document collaboration (Google Docs-style for businesses).
The main feature is a working collaborative rich-text editor where users in the same organization can edit the same document together with live cursors.

---

## Features

- Multi-tenant: each organization (tenant) has its own users, documents and audit logs.
- Roles
  - **Super Admin** — manages all organizations, users, admins and documents.
  - **Organization Admin** — manages users and documents inside one organization.
  - **Owner / Editor / Viewer** — per-document permissions.
- Real-time collaborative editor (TipTap + Yjs CRDT over WebSocket).
- Document create, read, update (rename + content), delete, restore.
- Document sharing with per-user roles.
- Version history with one-click restore.
- Append-only audit logs.
- Responsive UI (desktop, tablet, mobile).
- All data persisted in MongoDB.

---

## Tech stack

**Frontend**
- React 18 + TypeScript + Vite
- Tailwind CSS
- TipTap (ProseMirror) editor
- Yjs CRDT + WebSocket provider

**Backend**
- Node.js + Express (TypeScript)
- WebSocket (`ws`) for real-time sync
- MongoDB + Mongoose
- JWT auth + bcrypt
- HTML sanitization, Helmet, rate limiting

---

## Repository layout

```
LogiQuad_assignment/
├── backend/        # Express API + WebSocket server (Mongo + Mongoose)
└── frontend/       # React + Vite app
```

---

## MongoDB setup

You can use either:

1. **MongoDB Atlas (recommended for deploy)**
   - Create a free cluster: <https://www.mongodb.com/cloud/atlas>.
   - Create a database user and allow your IP (or `0.0.0.0/0` for testing).
   - Copy the connection string (looks like `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/collabdocs`).

2. **Local MongoDB**
   - Install MongoDB Community Edition.
   - Start `mongod`.
   - Use `mongodb://127.0.0.1:27017/collabdocs`.

---

## Local setup

> Requires Node.js 18+.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env       # Windows: copy .env.example .env
# edit .env and set MONGODB_URI

npm run seed               # Seeds demo orgs, users, documents
npm run dev                # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # Windows: copy .env.example .env

npm run dev                # http://localhost:5173
```

### Reset the database

```bash
cd backend
npm run reset && npm run seed
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable             | Description                                         | Example                                          |
| -------------------- | --------------------------------------------------- | ------------------------------------------------ |
| `PORT`               | API port                                            | `4000`                                           |
| `MONGODB_URI`        | MongoDB connection string                           | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `JWT_SECRET`         | Secret for access tokens (long random string)       | `change-me`                                      |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (different long random)   | `change-me`                                      |
| `ACCESS_TOKEN_TTL`   | Access token lifetime                               | `15m`                                            |
| `REFRESH_TOKEN_TTL`  | Refresh token lifetime                              | `7d`                                             |
| `CORS_ORIGIN`        | Allowed origin for the frontend                     | `http://localhost:5173`                          |

### Frontend (`frontend/.env`)

| Variable        | Description                  | Example                 |
| --------------- | ---------------------------- | ----------------------- |
| `VITE_API_BASE` | Backend HTTP/WS base URL     | `http://localhost:4000` |

> Never commit real `.env` files. Only `.env.example` is committed.

---

## Demo accounts

After running `npm run seed`:

| Role                  | Email                       | Password    |
| --------------------- | --------------------------- | ----------- |
| Platform Super Admin  | `super@platform.com`        | `Super@123` |
| ABC Admin             | `abc-admin@example.com`     | `Admin@123` |
| ABC Editor            | `abc-editor@example.com`    | `Editor@123`|
| ABC Viewer            | `abc-viewer@example.com`    | `Viewer@123`|
| XYZ Admin             | `xyz-admin@example.com`     | `Admin@123` |
| XYZ Editor            | `xyz-editor@example.com`    | `Editor@123`|

Two organizations are seeded — **ABC Company** and **XYZ Company** — with sample documents pre-shared with the right roles.

---

## Push to GitHub

```bash
# from project root
git init
git add .
git commit -m "Initial commit: CollabDocs (Mongo)"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` files are excluded by `.gitignore`. Do not commit them.

---

## Deploy on Vercel

The frontend deploys cleanly to Vercel. The backend uses long-lived WebSockets, which serverless platforms (including Vercel functions) do not support reliably, so deploy it to a host that supports persistent connections (Render, Railway, Fly.io, etc.).

### A. Deploy the backend (Render / Railway / Fly)

The fastest path is **Render**:

1. Push the repo to GitHub.
2. Create a new **Web Service** on Render and point it at the repo.
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Add environment variables (Settings → Environment):
   - `MONGODB_URI` (Atlas connection string)
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `ACCESS_TOKEN_TTL=15m`
   - `REFRESH_TOKEN_TTL=7d`
   - `CORS_ORIGIN` (your Vercel frontend URL, e.g. `https://collabdocs.vercel.app`)
5. Deploy. Note the public URL, e.g. `https://collab-api.onrender.com`.
6. (One-time) From a local terminal, seed the cloud database:
   ```bash
   cd backend
   MONGODB_URI="<your atlas uri>" npm run seed
   ```

### B. Deploy the frontend on Vercel

1. Push the repo to GitHub (if not already).
2. On <https://vercel.com> → **Add New Project** → import the repo.
3. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add environment variables (Project Settings → Environment Variables):
   - `VITE_API_BASE` = your backend URL (e.g. `https://collab-api.onrender.com`)
5. Deploy.

After the first frontend deploy, copy its URL and update the backend's `CORS_ORIGIN` env var to that URL, then redeploy the backend.

---

## Security notes

- Passwords are bcrypt-hashed.
- Refresh tokens are stored hashed and individually revocable.
- WebSocket auth is checked on every connection; viewers cannot send updates.
- HTML is sanitized server-side before being saved.
- `.env` files are in `.gitignore` — secrets never leave your machine.
- Use long random strings for `JWT_SECRET` and `JWT_REFRESH_SECRET` in production.

---

## Troubleshooting

- **`MONGODB_URI is not set`** → create `backend/.env` from `.env.example` and set the URI.
- **Cannot connect to Mongo** → check Atlas IP allow-list and that the user/password are correct.
- **CORS error in browser** → set `CORS_ORIGIN` in the backend to the exact frontend origin.
- **WebSocket fails on Vercel** → expected. Host the backend on Render/Railway/Fly and point `VITE_API_BASE` to that URL.
- **Render: “Exited with status 254”** → the service root is probably the repo root (no `package.json` there). In Render → **Settings** → **Root Directory**, set **`backend`**, save, and **Manual Deploy**. Or use the repo’s **`render.yaml`** Blueprint so Render always builds from `backend/`.
