# How this RAG app works

This doc walks through Retrieval-Augmented Generation (RAG) concept by concept,
pointing at the exact code in this repo that implements each one. Read it alongside
`app/api/upload/route.ts` and `app/api/chat/route.ts` — those two files are the entire
pipeline; everything else is plumbing (UI, env, clients).

## 1. Why RAG instead of "just paste the PDF into the prompt"

You could, in theory, paste a whole PDF into a prompt and ask a question. Three problems:

- **Context limits**: long documents won't fit (and even when they do, quality degrades —
  models attend less reliably to text buried in the middle of a huge prompt).
- **Cost & latency**: re-sending the entire document on every question is slow and wasteful.
- **Hallucination**: without grounding, a model answers from training data, not your document —
  it may confidently invent things that aren't in the PDF at all.

RAG fixes this by **retrieving only the passages relevant to the current question** and
handing just those to the model as context. The model still generates the answer in natural
language — but it's now "open book," reading from your document instead of guessing.

The pipeline has two phases:

```
INDEXING (once per upload)            QUERYING (once per question)
─────────────────────────             ────────────────────────────
PDF                                    Question
 │ load                                 │ embed (same model as indexing!)
 ▼                                      ▼
Pages (Documents)                     Question vector
 │ split                                │ similarity search
 ▼                                      ▼
Chunks                                Top-k relevant chunks
 │ embed                                │ splice into prompt
 ▼                                      ▼
Vectors ──► upsert ──► Pinecone       "Answer using only this context: ..."
                          │                    │ send to Gemini
                          │                    ▼
                          └──────────────►  Streamed answer
```

## 2. Loading & chunking — `app/api/upload/route.ts`

**Loading**: `PDFLoader` (from LangChain, backed by `pdf-parse`) reads the uploaded `Blob`
directly — no temp file is written to disk, which keeps the route serverless-friendly (the
filesystem on platforms like Vercel is read-only/ephemeral at request time). It returns one
LangChain `Document` per page, each with `pageContent` (the extracted text) and `metadata`
(e.g. page number).

**Chunking**: `RecursiveCharacterTextSplitter` then splits those pages into smaller, overlapping
windows:

```ts
new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 })
```

Why split at all? Two reasons:

1. **Embedding quality**: embedding models compress text into a fixed-size vector. Embed an
   entire 10-page document and the vector becomes a blurry average of everything in it — a
   question about page 7 won't match it well. Embed a focused 1000-character passage and the
   vector captures *that passage's* meaning much more precisely, so similarity search can find
   the right needle in the haystack.
2. **Prompt budget**: smaller chunks mean retrieval can return several *relevant* passages
   instead of one *huge, mostly-irrelevant* one — better signal-to-noise for the model.

`chunkOverlap` matters too: if a sentence straddles the boundary between chunk N and chunk N+1,
a hard cut could leave both halves meaningless on their own. A 150-character overlap means that
sentence appears intact in at least one of the two chunks. `1000`/`150` is a common, easy-to-reason-about
starting point — bigger chunks retain more surrounding context per match but reduce precision;
smaller chunks are more precise but may lose context. Tune based on your documents.

## 3. Embeddings — what's actually being compared

An embedding model turns text into a vector — an array of numbers — such that texts with
similar *meaning* end up with similar vectors (measured by, e.g., cosine similarity — see §4).
This is what makes "search by meaning" possible instead of "search by exact keyword match":
a question phrased completely differently from the document's wording can still retrieve the
right passage, because the model captures semantic similarity, not lexical overlap.

This app uses Gemini's `text-embedding-004` (`lib/gemini.ts` → `getEmbeddings()`), which produces
**768-dimensional** vectors. That number isn't arbitrary — it's baked into the model, and it's
why the Pinecone index must be created with `dimension: 768` (see the README setup steps): the
index needs to know the shape of the vectors it will store and compare.

**Critical invariant**: the *same* embedding model must be used to embed document chunks at
index time (`app/api/upload/route.ts`) and to embed the user's question at query time
(`app/api/chat/route.ts`). Different models produce vectors in different "spaces" — comparing
a vector from model A against vectors from model B is meaningless, like comparing GPS
coordinates to map-grid references. Both routes call the same `getEmbeddings()` factory for
exactly this reason.

## 4. Vector storage & search — Pinecone

Once each chunk is a vector, "find the passages relevant to this question" becomes "find the
stored vectors closest to the question's vector." Doing that by brute force (compare the query
against every vector in the database) works for a few hundred chunks but doesn't scale — a
**vector database** like Pinecone exists to do this search efficiently (via approximate nearest-
neighbor indexing) across millions of vectors, while also handling persistence, metadata
filtering, and multi-tenancy.

Two Pinecone concepts used here:

- **Index**: a named collection of vectors, all of the same dimension and similarity metric
  (we use `cosine`, which measures the angle between two vectors — a natural fit for embeddings,
  where direction encodes meaning more than magnitude). One index (`PINECONE_INDEX`) is reused
  for every upload.
- **Namespace**: a partition *within* an index. `app/api/upload/route.ts` generates a fresh
  `crypto.randomUUID()` namespace per upload (`PineconeStore.fromDocuments(..., { namespace })`),
  so each PDF's chunks live in their own isolated slice — questions about PDF A never
  accidentally retrieve passages from PDF B. The client receives this namespace and sends it
  back with every chat request (`app/api/chat/route.ts` → `PineconeStore.fromExistingIndex`).
  This is the standard multi-tenant pattern real RAG products use (substitute "namespace" for
  "user ID" or "document ID" and you have the production version).

## 5. Retrieval — `similaritySearch`

```ts
const relevantChunks = await vectorStore.similaritySearch(question, 4);
```

This embeds `question` (with the same `text-embedding-004` model — see §3), asks Pinecone for
the **top-k** (here, `k = 4`) stored vectors with the highest cosine similarity to it, and
returns their original chunk text + metadata. `k` is a tuning knob: too small and you might miss
a relevant passage that scored just outside the cutoff; too large and you dilute the prompt with
marginally-relevant text (which costs tokens and can distract the model). `4` is a reasonable
default for short, focused chunks like ours.

## 6. Prompt augmentation — `app/api/chat/route.ts`

This is the step that gives RAG its name: the retrieved passages are spliced into the prompt
*before* it's sent to the model.

```ts
const augmentedMessages = [
  new SystemMessage(SYSTEM_PROMPT),
  new HumanMessage(`Context from the document:\n\n${context}\n\nQuestion: ${question}`),
];
```

`SYSTEM_PROMPT` explicitly instructs the model to answer *only* from the supplied context and
to admit when it can't find the answer there — this is what keeps the model "grounded" and
measurably reduces hallucination compared to an unconstrained prompt. The `context` string
concatenates the four retrieved passages (each labeled `[Passage N]` so the model can
distinguish — and optionally cite — them).

This hand-built template *is* "prompt engineering" in its simplest, most transparent form:
no frameworks or magic — just string concatenation that puts the right information in front of
the model at the right time.

## 7. Generation & streaming

`getChatModel()` (`lib/gemini.ts`) wraps Gemini's `gemini-1.5-flash` via LangChain's
`ChatGoogleGenerativeAI`. `.stream(augmentedMessages)` returns an async-iterable of response
chunks as the model generates them — rather than waiting for the full answer before sending
anything back.

```
LangChain stream  →  toUIMessageStream()  →  createUIMessageStreamResponse()  →  useChat (client)
 (token chunks)        (Vercel AI SDK adapter — converts LangChain's stream format
                        into the AI SDK's UI-message-stream protocol)
```

`@ai-sdk/langchain`'s `toUIMessageStream` adapts a LangChain stream into the format the
Vercel AI SDK's `useChat` hook (used in `components/ChatPanel.tsx`) expects, so the frontend
gets typed message parts and progressive updates "for free" — this adapter-between-frameworks
pattern is exactly how production Next.js apps wire a LangChain backend to an AI-SDK frontend.
Streaming matters for UX: the user sees the answer forming token-by-token instead of staring at
a spinner for several seconds.

## 8. End-to-end trace for one question

1. User uploads `report.pdf` → `/api/upload`:
   - `PDFLoader` extracts 12 pages of text
   - `RecursiveCharacterTextSplitter` produces, say, 47 chunks (~1000 chars each, 150 overlap)
   - `text-embedding-004` turns each chunk into a 768-dim vector
   - `PineconeStore.fromDocuments` upserts all 47 vectors into namespace `f3a1...` (a fresh UUID)
   - The client stores `{ namespace: "f3a1...", fileName: "report.pdf", chunks: 47, pages: 12 }`
2. User asks "What were Q3's headline numbers?" → `/api/chat` (with `namespace: "f3a1..."`):
   - The question is embedded with the same `text-embedding-004` model
   - Pinecone returns the 4 chunks (within namespace `f3a1...`) whose vectors are closest by
     cosine similarity — likely the chunks that literally contain the Q3 figures
   - Those 4 chunks are concatenated into `context` and spliced into the augmented prompt
   - `gemini-1.5-flash` streams back an answer grounded in that context
   - The frontend renders the answer token-by-token as it arrives

## 9. Ideas to extend this PoC

- **Multi-turn memory**: currently each question is answered independently — only the latest
  user message is used for retrieval. A real chat app would also feed prior turns to the model
  (and possibly rewrite follow-up questions like "what about page 2?" into standalone queries
  before embedding them).
- **Source citations**: `similaritySearch` returns `metadata` (e.g. page numbers) alongside
  each chunk — surface that in the UI so users can verify answers against the original PDF.
- **Multi-document chat**: store a document registry (e.g. in a small DB) mapping friendly names
  to namespaces, and let users query across several PDFs at once via a metadata filter.
- **Re-ranking**: run a second, more expensive model over the top-k retrieved chunks to reorder
  them by true relevance — `similaritySearch`'s vector-distance ranking is fast but approximate.
- **Hybrid search**: combine vector similarity with traditional keyword search (e.g. BM25) —
  useful when a question contains exact terms (names, codes, numbers) that embeddings can blur.
