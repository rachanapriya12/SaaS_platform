import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { connectMongo } from './db/mongoose';
import { attachCollabWebsocket } from './ws/collab';

import authRoutes from './routes/auth';
import orgRoutes from './routes/organizations';
import userRoutes from './routes/users';
import documentRoutes from './routes/documents';
import sharingRoutes from './routes/sharing';
import versionRoutes from './routes/versions';
import auditRoutes from './routes/audit';
import statsRoutes from './routes/stats';

const app = express();
const server = http.createServer(app);

const corsOriginRaw = process.env.CORS_ORIGIN?.trim();
/* Reflect request Origin when unset or * — fixes Vercel preview URLs without redeploying Render */
const corsReflectAll =
  !corsOriginRaw || corsOriginRaw === '*' || corsOriginRaw.toLowerCase() === 'true';
const corsOriginList = corsReflectAll
  ? null
  : corsOriginRaw.split(',').map((s) => s.trim());

app.use(helmet());
app.use(
  cors({
    ...(corsReflectAll
      ? { origin: true }
      : { origin: corsOriginList as string[] }),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/auth', authLimiter, authRoutes);
app.use('/organizations', orgRoutes);
app.use('/organizations/:tenantId/users', userRoutes);
app.use('/documents', documentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/documents', sharingRoutes);
app.use('/documents', versionRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/stats', statsRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.name === 'MongoServerError' && err?.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const wss = new WebSocketServer({ noServer: true });
attachCollabWebsocket(wss);

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/collaboration/')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[backend] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[backend] uncaughtException:', err);
});

const PORT = parseInt(process.env.PORT || '4000', 10);

(async () => {
  try {
    await connectMongo();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[backend] listening on port ${PORT}`);
      console.log(`[backend] websocket path: /collaboration/:tenantId/:documentId`);
    });
  } catch (err) {
    console.error('[backend] failed to start:', err);
    process.exit(1);
  }
})();
