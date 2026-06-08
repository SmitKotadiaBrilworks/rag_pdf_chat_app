import { Pinecone } from "@pinecone-database/pinecone";

let client: Pinecone | undefined;

function getClient() {
  if (!client) {
    client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return client;
}

export function getPineconeIndex() {
  const indexName = process.env.PINECONE_INDEX;
  if (!indexName) {
    throw new Error("PINECONE_INDEX is not set in the environment");
  }
  return getClient().index(indexName);
}
