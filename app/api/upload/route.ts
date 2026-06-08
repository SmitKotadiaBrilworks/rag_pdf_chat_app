import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PineconeStore } from "@langchain/pinecone";
import { getEmbeddings } from "@/lib/gemini";
import { getPineconeIndex } from "@/lib/pinecone";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No PDF file was provided" }, { status: 400 });
  }

  // 1. Load: extract text from the PDF, one Document per page.
  const loader = new PDFLoader(file);
  const pages = await loader.load();

  if (pages.length === 0 || pages.every((page) => !page.pageContent.trim())) {
    return NextResponse.json(
      { error: "Could not extract any text from this PDF (it may be scanned/image-only)" },
      { status: 422 },
    );
  }

  // 2. Chunk: split each page into overlapping windows so retrieval can return
  // focused passages instead of whole pages. Overlap keeps sentences that
  // straddle a chunk boundary intact in at least one chunk.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });
  const chunks = await splitter.splitDocuments(pages);

  // 3. Embed + store: each chunk gets turned into a 768-dim vector
  // (text-embedding-004) and upserted into its own Pinecone namespace, so
  // this PDF's chunks never mix with another upload's chunks.
  const namespace = randomUUID();
  await PineconeStore.fromDocuments(chunks, getEmbeddings(), {
    pineconeIndex: getPineconeIndex(),
    namespace,
  });

  return NextResponse.json({
    namespace,
    pages: pages.length,
    chunks: chunks.length,
  });
}
