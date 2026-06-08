# PDF Chat — RAG learning PoC

Upload a PDF, ask questions about it, get answers grounded in its content. A small,
deliberately-readable Retrieval-Augmented-Generation (RAG) app for learning the core
pipeline: **chunking → embedding → vector search → prompt augmentation → generation**.

Read **[EXPLANATION.md](./EXPLANATION.md)** for a concept-by-concept walkthrough mapped to
the actual code — that's the main point of this repo.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind
- [LangChain.js](https://js.langchain.com) for the RAG pipeline (loading, chunking, vector store)
- [Gemini](https://ai.google.dev) (`text-embedding-004` for embeddings, `gemini-1.5-flash` for
  chat) — both on Google's free tier
- [Pinecone](https://www.pinecone.io) (free "Starter" tier) as the vector database
- [Vercel AI SDK](https://ai-sdk.dev) (`useChat` + `@ai-sdk/langchain`) for streaming the
  answer into the UI token-by-token

## Setup

### 1. Get a Gemini API key

Create one at [Google AI Studio](https://aistudio.google.com/apikey) (free tier).

> ⚠️ If you've ever pasted an API key into a chat, doc, or commit, **rotate it** — treat it as
> compromised and generate a fresh one. Never commit real keys; `.env.local` is gitignored.

### 2. Create a Pinecone index

Sign up at [app.pinecone.io](https://app.pinecone.io) (free, no credit card for the Starter
tier) and create an index with:

- **Dimension: `768`** — this must match `text-embedding-004`'s output size, or every
  upsert/query will fail with a dimension-mismatch error
- **Metric: `cosine`**

Grab your API key and the index name.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
GOOGLE_API_KEY=your-gemini-key
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX=your-index-name
```

### 4. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload a PDF, and start asking questions.

## How it works

See **[EXPLANATION.md](./EXPLANATION.md)** for the full walkthrough. In short:

1. **Upload** (`app/api/upload/route.ts`): the PDF is loaded, split into overlapping ~1000-char
   chunks, embedded with `text-embedding-004`, and upserted into a fresh Pinecone namespace
   (one per upload, so documents never mix).
2. **Chat** (`app/api/chat/route.ts`): your question is embedded with the same model, Pinecone
   returns the most similar chunks, those chunks are spliced into a prompt that instructs
   Gemini to answer *only* from that context, and the streamed answer is sent back to the UI.

## Project layout

```
app/
  page.tsx              — main UI (upload + chat, two-pane layout)
  api/upload/route.ts   — PDF → chunks → embeddings → Pinecone
  api/chat/route.ts     — question → retrieval → augmented prompt → streamed answer
components/
  PdfUploader.tsx       — file picker, indexing status
  ChatPanel.tsx         — streaming chat UI (wraps `useChat`)
lib/
  gemini.ts             — Gemini embeddings/chat model factories
  pinecone.ts           — Pinecone client/index getter
EXPLANATION.md          — concept-by-concept RAG walkthrough
```
