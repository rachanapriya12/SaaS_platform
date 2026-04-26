import mongoose from 'mongoose';
import dns from 'dns';

// Force public DNS so mongodb+srv lookups work on restricted networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  /* noop */
}

let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your .env or environment.');
  }
  mongoose.set('strictQuery', true);

  connecting = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 15_000,
    })
    .then((m) => {
      console.log('[mongo] connected');
      return m;
    })
    .catch((err) => {
      connecting = null;
      console.error('[mongo] connection failed:', err.message);
      throw err;
    });
  return connecting;
}

export function isConnected() {
  return mongoose.connection.readyState === 1;
}
