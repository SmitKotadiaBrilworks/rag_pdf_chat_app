import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Embeddings } from "@langchain/core/embeddings";

/**
 * `text-embedding-004` (this app's original embedding model) has been
 * retired by Google. Its replacement, `gemini-embedding-001`, outputs
 * 3072-dim vectors by default but supports Matryoshka truncation via
 * `outputDimensionality` — we ask for 768 so the vectors still match the
 * Pinecone index's configured dimension.
 */
export const EMBEDDING_DIMENSION = 768;
const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * LangChain's `GoogleGenerativeAIEmbeddings` doesn't expose
 * `outputDimensionality`, so we call the REST API directly to get
 * 768-dim vectors out of `gemini-embedding-001`.
 */
class GeminiEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  private async embed(text: string): Promise<number[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSION,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Gemini embedding request failed (${response.status}): ${await response.text()}`);
    }
    const { embedding } = (await response.json()) as { embedding: { values: number[] } };
    return embedding.values;
  }

  embedQuery(document: string) {
    return this.caller.call(this.embed.bind(this), document);
  }

  embedDocuments(documents: string[]) {
    return Promise.all(documents.map((document) => this.embedQuery(document)));
  }
}

export function getEmbeddings() {
  return new GeminiEmbeddings();
}

export function getChatModel() {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash",
    temperature: 0.2,
    streaming: true,
  });
}
