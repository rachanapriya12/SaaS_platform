import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from './db/mongoose';

async function main() {
  await connectMongo();
  const collections = [
    'tenants',
    'users',
    'members',
    'documents',
    'permissions',
    'versions',
    'yjsupdates',
    'auditlogs',
    'refreshtokens',
  ];
  const dropped: string[] = [];
  for (const name of collections) {
    try {
      await mongoose.connection.db!.dropCollection(name);
      dropped.push(name);
    } catch (e: any) {
      // Collection didn't exist; ignore.
      if (e?.codeName !== 'NamespaceNotFound') {
        console.warn(`[reset] could not drop ${name}:`, e?.message || e);
      }
    }
  }
  console.log('Reset complete. Dropped collections:', dropped.length ? dropped.join(', ') : '(none)');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect();
  process.exit(1);
});
