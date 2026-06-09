"use client";

import { useRef, useState, type ChangeEvent } from "react";

type IndexedDoc = {
  namespace: string;
  fileName: string;
  pages: number;
  chunks: number;
};

type Status = "idle" | "uploading" | "indexing" | "ready" | "error";

export function PdfUploader({
  docs,
  onIndexed,
  onRemove,
}: {
  docs: IndexedDoc[];
  onIndexed: (doc: IndexedDoc) => void;
  onRemove: (namespace: string) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploading = status === "uploading" || status === "indexing";

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
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

      onIndexed({
        namespace: data.namespace,
        fileName: file.name,
        pages: data.pages,
        chunks: data.chunks,
      });
      setStatus("ready");
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
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">1. Upload PDFs</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Files are chunked, embedded with Gemini, and stored in Pinecone — nothing is saved to disk.
        </p>
      </div>

      {docs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {docs.map((doc) => (
            <li
              key={doc.namespace}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                ✓ <span className="font-medium text-zinc-900 dark:text-zinc-50">{doc.fileName}</span>
                <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                  — {doc.pages} page{doc.pages === 1 ? "" : "s"}, {doc.chunks} chunk{doc.chunks === 1 ? "" : "s"}
                </span>
              </span>
              <button
                onClick={() => onRemove(doc.namespace)}
                className="ml-4 text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-sm text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        {isUploading ? (
          <span>Indexing your PDF — chunking, embedding, and upserting to Pinecone…</span>
        ) : docs.length > 0 ? (
          <span>+ Add another PDF</span>
        ) : (
          <span>Click to choose a PDF file</span>
        )}
      </label>

      {status === "error" && error && (
        <p className="text-sm text-red-600 dark:text-red-400">✗ {error}</p>
      )}
    </div>
  );
}
