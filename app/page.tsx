"use client";

import { useState } from "react";
import { PdfUploader } from "@/components/PdfUploader";
import { ChatPanel } from "@/components/ChatPanel";

type IndexedDoc = {
  namespace: string;
  fileName: string;
  pages: number;
  chunks: number;
};

export default function Home() {
  const [doc, setDoc] = useState<IndexedDoc | null>(null);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 px-8 py-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">PDF Chat — RAG learning PoC</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Upload a PDF, then ask questions grounded in its content. See{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">EXPLANATION.md</code> for how the
          chunking → embedding → vector search → prompt augmentation pipeline works.
        </p>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 p-8 lg:grid-cols-2">
        <PdfUploader onIndexed={setDoc} />
        <ChatPanel key={doc?.namespace ?? "no-doc"} namespace={doc?.namespace ?? null} fileName={doc?.fileName ?? null} />
      </main>
    </div>
  );
}
