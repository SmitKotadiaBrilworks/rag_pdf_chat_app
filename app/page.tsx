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
  const [docs, setDocs] = useState<IndexedDoc[]>([]);

  function handleIndexed(doc: IndexedDoc) {
    setDocs((prev) => [...prev, doc]);
  }

  function handleRemove(namespace: string) {
    setDocs((prev) => prev.filter((d) => d.namespace !== namespace));
  }

  // Re-mount ChatPanel (resetting conversation) whenever the document set changes.
  const chatKey = docs.map((d) => d.namespace).join(",") || "no-docs";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 px-8 py-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">PDF Chat — RAG learning PoC</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Upload one or more PDFs, then ask questions grounded in their content. See{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">EXPLANATION.md</code> for how the
          chunking → embedding → vector search → prompt augmentation pipeline works.
        </p>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 p-8 lg:grid-cols-2">
        <PdfUploader docs={docs} onIndexed={handleIndexed} onRemove={handleRemove} />
        <ChatPanel key={chatKey} docs={docs} />
      </main>
    </div>
  );
}
