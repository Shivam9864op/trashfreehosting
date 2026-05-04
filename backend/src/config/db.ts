import { MongoClient, Db } from 'mongodb';
import { env } from './env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb() {
  if (!env.MONGODB_URI || !env.MONGODB_DB) {
    throw Object.assign(
      new Error('MongoDB unavailable: configure MONGODB_URI and MONGODB_DB to enable admin metrics and event logging.'),
      { status: 503 },
    );
  }
  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
    db = client.db(env.MONGODB_DB);
  }
  return db as Db;
}
