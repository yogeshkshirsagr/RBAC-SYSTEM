import "server-only";

import { MongoClient, type Db } from "mongodb";

type MongoGlobal = typeof globalThis & {
  rbacMongoClientPromise?: Promise<MongoClient>;
};

const mongoGlobal = globalThis as MongoGlobal;

/** Return the application's MongoDB database, reusing the process connection. */
export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!mongoGlobal.rbacMongoClientPromise) {
    const client = new MongoClient(uri);
    mongoGlobal.rbacMongoClientPromise = client.connect().catch((error: unknown) => {
      mongoGlobal.rbacMongoClientPromise = undefined;
      throw new Error("Could not connect to MongoDB.", { cause: error });
    });
  }

  const client = await mongoGlobal.rbacMongoClientPromise;
  return client.db("rbac_system");
}

/** Close and clear the cached connection, primarily for one-off local scripts. */
export async function closeMongoConnection(): Promise<void> {
  const clientPromise = mongoGlobal.rbacMongoClientPromise;
  mongoGlobal.rbacMongoClientPromise = undefined;

  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
  }
}
