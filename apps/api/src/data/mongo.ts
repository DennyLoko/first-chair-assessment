import { MongoClient, ObjectId } from 'mongodb';

export interface ProductDoc {
  _id: { toString(): string };
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  price?: number;
  width?: number;
  height?: number;
  depth?: number;
}

let client: MongoClient | null = null;
let connected = false;

function getClient(): MongoClient {
  if (!client) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI env var is not set');
    client = new MongoClient(uri, {
      maxPoolSize: 8,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      readPreference: 'secondaryPreferred',
    });
  }
  return client;
}

export async function connectMongo(): Promise<void> {
  if (!connected) {
    await getClient().connect();
    connected = true;
  }
}

export async function closeMongo(): Promise<void> {
  if (connected && client) {
    await client.close();
    connected = false;
    client = null;
  }
}

export function getDb() {
  return getClient().db();
}

export async function fetchProductsByIds(ids: string[]): Promise<ProductDoc[]> {
  const db = getDb();
  const objectIds = ids.map((id) => new ObjectId(id));
  return db.collection('products').find({ _id: { $in: objectIds } }).toArray() as Promise<ProductDoc[]>;
}

export async function fetchAllProducts(): Promise<ProductDoc[]> {
  return getDb().collection('products').find({}).toArray() as Promise<ProductDoc[]>;
}

export async function streamAllProducts(
  onDoc: (doc: ProductDoc) => void
): Promise<void> {
  const cursor = getDb().collection('products').find({});
  for await (const doc of cursor) {
    onDoc(doc as unknown as ProductDoc);
  }
}
