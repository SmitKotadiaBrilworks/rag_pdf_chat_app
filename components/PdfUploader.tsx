"use client";

import { useRef, useState, type ChangeEvent } from "react";

type IndexedDoc = {
  namespace: string;
  fileName: string;
  pages: number;
  chunks: number;
};

type Status = "idle" | "uploading" | "indexing" | "ready" | "error";

export function PdfUploader({ onIndexed }: { onIndexed: (doc: IndexedDoc) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [doc, setDoc] = useState<IndexedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setDoc(null);
    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setStatus("indexing");
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to process the PDF");
      }

      const indexed: IndexedDoc = {
        namespace: data.namespace,
        fileName: file.name,
        pages: data.pages,
        chunks: data.chunks,
      };
      setDoc(indexed);
      setStatus("ready");
      onIndexed(indexed);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">1. Upload a PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          The file is chunked, embedded with Gemini, and stored in Pinecone — nothing is saved to disk.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-sm text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={status === "uploading" || status === "indexing"}
        />
        {status === "uploading" || status === "indexing" ? (
          <span>Indexing your PDF — chunking, embedding, and upserting to Pinecone…</span>
        ) : (
          <span>Click to choose a PDF file</span>
        )}
      </label>

      {status === "ready" && doc && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ <span className="font-medium">{doc.fileName}</span> indexed — {doc.pages} page
          {doc.pages === 1 ? "" : "s"} split into {doc.chunks} chunk{doc.chunks === 1 ? "" : "s"}.
          Ask away on the right.
        </p>
      )}

      {status === "error" && error && (
        <p className="text-sm text-red-600 dark:text-red-400">✗ {error}</p>
      )}
    </div>
  );
}
