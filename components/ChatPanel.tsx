"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

type IndexedDoc = {
  namespace: string;
  fileName: string;
  pages: number;
  chunks: number;
};

function messageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function ChatPanel({ docs }: { docs: IndexedDoc[] }) {
  const [input, setInput] = useState("");

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { docs: docs.map(({ namespace, fileName }) => ({ namespace, fileName })) },
      }),
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasDoc = docs.length > 0;
  const ready = status === "ready" || status === "error";
  const canSend = hasDoc && ready && input.trim().length > 0;

  const docLabel =
    docs.length === 0
      ? null
      : docs.length === 1
        ? `"${docs[0].fileName}"`
        : `${docs.length} documents`;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    sendMessage({ text: input.trim() });
    setInput("");
  }

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">2. Ask questions</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {docLabel
            ? `Answers are grounded in ${docLabel} — retrieved passages are sent to Gemini as context.`
            : "Upload a PDF first — the chat is grounded in its content."}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No messages yet.</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              message.role === "user"
                ? "ml-auto bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
            }`}
          >
            {messageText(message.parts) || (message.role === "assistant" ? "…" : "")}
          </div>
        ))}
        {error && <p className="text-sm text-red-600 dark:text-red-400">✗ {error.message}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={hasDoc ? "Ask something about the document…" : "Upload a PDF to get started"}
          disabled={!hasDoc}
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {status === "streaming" || status === "submitted" ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
