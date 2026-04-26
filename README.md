# CollabDocs - Multi-Tenant Document Collaboration Platform

CollabDocs is a cloud-based SaaS platform for business document collaboration. It supports multiple organizations on one shared platform while keeping each tenant's users, documents, permissions, and audit logs isolated.

The platform is designed for real-time document editing, role-based access control, version history, restore flow, secure sharing, audit visibility, and scalable deployment.

---

## Recommended Architecture Stack

This is the recommended stack from the final design document:

| Layer | Recommended Technology | Purpose |
|---|---|---|
| Frontend | React | Dashboards, admin screens, collaboration screens, and document workflows |
| Backend | Node.js / Python | APIs, business logic, integrations, scheduled jobs, and workflow automation |
| Database | MongoDB | Organizations, users, document metadata, permissions, tickets, and audit logs |
| Storage | AWS S3 / Azure Blob Storage | Document files, uploads, exports, and backup storage |
| Backend Hosting | Render.com | Backend APIs and persistent WebSocket collaboration service |
| Frontend Hosting | Vercel / AWS Amplify | Frontend deployment; Vercel is used for the POC |
| Development Tools | VS Code / Visual Studio / Postman | Coding, debugging, and API testing |

Render.com is used for the backend because the collaboration service needs long-lived WebSocket connections. Vercel is used for the frontend because it works well for React/Vite deployments.

---

## POC Implementation Stack

For the working proof of concept, this repository uses the following implementation stack:

### Frontend

- React 18 + TypeScript + Vite
- Tailwind CSS
- TipTap / ProseMirror editor
- Yjs CRDT with WebSocket provider
- Responsive UI for desktop, tablet, and mobile

### Backend

- Node.js + Express + TypeScript
- WebSocket using `ws` for real-time document sync
- MongoDB + Mongoose
- JWT authentication + bcrypt password hashing
- HTML sanitization, Helmet, CORS, and rate limiting

---

## Main Features

- Multi-tenant SaaS structure with isolated organizations.
- Super Admin can manage organizations, admins, users, and documents.
- Organization Admin can manage users and documents inside one tenant.
- Document-level roles: Owner, Editor, and Viewer.
- Real-time collaborative rich-text editing.
- Two users under the same tenant can edit the same shared document.
- Document create, rename, edit, delete, restore, and version history.
- Per-user document sharing.
- Append-only audit logs for important actions.
- Secure session handling and tenant-based access checks.

---

## Repository Structure

```text
LogiQuad_assignment/
├── backend/        # Express API + WebSocket server + MongoDB models
└── frontend/       # React + Vite frontend application
```

---

## Local Setup

Requires Node.js 18+.

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Update MONGODB_URI and secrets in .env

npm run seed
npm run dev
```

Backend runs at:

```text
http://localhost:4000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_BASE=http://localhost:4000

npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

---

## Environment Variables

### Backend `.env`

```env
PORT=4000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/collabdocs
JWT_SECRET=change-this-to-a-long-random-secret
JWT_REFRESH_SECRET=change-this-to-a-different-long-random-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CORS_ORIGIN=http://localhost:5173
```

### Frontend `.env`

```env
VITE_API_BASE=http://localhost:4000
```

Never commit real `.env` files. Only commit `.env.example` files.

---

## Demo Accounts

After running `npm run seed`, use these sample accounts:

| Role | Email | Password |
|---|---|---|
| Platform Super Admin | `super@platform.com` | `Super@123` |
| ABC Admin | `abc-admin@example.com` | `Admin@123` |
| ABC Editor | `abc-editor@example.com` | `Editor@123` |
| ABC Viewer | `abc-viewer@example.com` | `Viewer@123` |
| XYZ Admin | `xyz-admin@example.com` | `Admin@123` |
| XYZ Editor | `xyz-editor@example.com` | `Editor@123` |

The seeded data includes two organizations: ABC Company and XYZ Company. Sample documents are shared only with users inside the same tenant.

---

## Deploy Backend on Render.com

The backend should be deployed on Render because it supports persistent WebSocket connections.

1. Push the repository to GitHub.
2. Go to Render and create a new Web Service.
3. Connect the GitHub repository.
4. Set the root directory:

```text
backend
```

5. Set the build command:

```bash
npm install && npm run build
```

6. Set the start command:

```bash
npm start
```

7. Add backend environment variables:

```env
MONGODB_URI=<your MongoDB Atlas URI>
JWT_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CORS_ORIGIN=<your Vercel frontend URL>
```

8. Deploy and copy the Render backend URL.

Example:

```text
https://collabdocs-api.onrender.com
```

---

## Deploy Frontend on Vercel

1. Push the repository to GitHub.
2. Go to Vercel and import the repository.
3. Set the root directory:

```text
frontend
```

4. Set the framework preset to Vite.
5. Set the build command:

```bash
npm run build
```

6. Set the output directory:

```text
dist
```

7. Add the frontend environment variable:

```env
VITE_API_BASE=<your Render backend URL>
```

8. Deploy the frontend.
9. Copy the Vercel URL and update `CORS_ORIGIN` in Render with the exact Vercel URL.
10. Redeploy the backend after updating CORS.

---

## GitHub Push Commands

```bash
git init
git add .
git commit -m "Initial commit: CollabDocs POC"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

---

## Security Notes

- Passwords are hashed using bcrypt.
- JWT access tokens are short-lived.
- Refresh tokens should be stored securely and rotated.
- WebSocket connections are authenticated before joining document rooms.
- Viewers cannot send document updates.
- Rich-text HTML is sanitized before saving or rendering.
- API and WebSocket events should enforce tenant-level access checks.
- CORS must allow only the deployed frontend URL.
- Secrets must be stored in Render and Vercel environment variables, not in GitHub.

---

## Troubleshooting

### WebSocket fails on Vercel

This is expected if the backend is deployed as Vercel serverless functions. Deploy the backend on Render.com and set `VITE_API_BASE` to the Render backend URL.

### CORS error

Set `CORS_ORIGIN` in Render to the exact Vercel frontend URL and redeploy the backend.

### MongoDB connection fails

Check the MongoDB Atlas connection string, username, password, and IP allowlist.

### Frontend still calls localhost

Update `VITE_API_BASE` in Vercel environment variables and redeploy the frontend.

---

## Final Deployment Flow

```text
GitHub Repository
   ├── backend  -> Render.com  -> Node.js API + WebSocket server
   └── frontend -> Vercel      -> React/Vite user interface

MongoDB Atlas -> Stores tenants, users, documents, permissions, versions, and audit logs
```

---

## Summary

This POC demonstrates the core concept of the assignment: a multi-tenant document collaboration platform where users under the same tenant can securely share and edit documents in real time. The final architecture uses Render.com for the backend WebSocket service and Vercel for the frontend deployment.
