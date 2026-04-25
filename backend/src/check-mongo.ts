import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from './db/mongoose';

async function main() {
  console.log('[check] connecting to Atlas (15s timeout, public DNS forced)…');
  try {
    await connectMongo();
    console.log('[check] OK — connected');
    const dbs = await mongoose.connection.db!.admin().listDatabases();
    console.log('[check] databases:', dbs.databases.map((d: any) => d.name).join(', '));
    await mongoose.disconnect();
    process.exit(0);
  } catch (e: any) {
    console.error('[check] FAILED:', e?.message || e);
    process.exit(1);
  }
}
main();
