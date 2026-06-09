import { NextResponse } from "next/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { PineconeStore } from "@langchain/pinecone";
import { getChatModel, getEmbeddings } from "@/lib/gemini";
import { getPineconeIndex } from "@/lib/pinecone";

const SYSTEM_PROMPT = `You are an assistant that answers questions about PDF documents the user has uploaded.
Answer ONLY using the context passages below — they were retrieved from the documents because
they're the closest semantic match to the question. If the answer isn't contained in the
context, say you couldn't find it in the documents. Don't make anything up.`;

function extractText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

// Build LangChain message history from prior turns (everything before the last user message).
// This gives the model conversation memory so follow-up questions like "tell me more" work.
function buildHistory(messages: UIMessage[]): (HumanMessage | AIMessage)[] {
  return messages.slice(0, -1).map((msg) => {
    const text = extractText(msg);
    return msg.role === "user" ? new HumanMessage(text) : new AIMessage(text);
  });
}

// For retrieval, concatenate the last two user questions so that follow-up queries
// like "what about page 2?" embed with enough context to find relevant chunks.
function buildRetrievalQuery(messages: UIMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .slice(-2)
    .map(extractText)
    .join(" ");
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages: UIMessage[];
    docs?: { namespace: string; fileName: string }[];
    namespace?: string;
  };

  const { messages } = body;
  // Support legacy single-namespace format alongside the new multi-doc format.
  const docs: { namespace: string; fileName: string }[] =
    body.docs ?? (body.namespace ? [{ namespace: body.namespace, fileName: "Document" }] : []);

  if (docs.length === 0) {
    return NextResponse.json({ error: "Missing namespace — upload a PDF first" }, { status: 400 });
  }

  const question = extractText(messages[messages.length - 1]);
  const retrievalQuery = buildRetrievalQuery(messages);
  const history = buildHistory(messages);

  // Retrieve the top-3 chunks from each namespace in parallel, then merge
  // all results by cosine similarity score and keep the best 5 overall.
  const index = getPineconeIndex();
  const perDocResults = await Promise.all(
    docs.map(async ({ namespace, fileName }) => {
      const store = await PineconeStore.fromExistingIndex(getEmbeddings(), {
        pineconeIndex: index,
        namespace,
      });
      const hits = await store.similaritySearchWithScore(retrievalQuery, 3);
      return hits.map(([doc, score]) => ({ doc, score, fileName }));
    }),
  );

  const topChunks = perDocResults
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const multiDoc = docs.length > 1;
  const context = topChunks
    .map(({ doc, fileName }, i) =>
      multiDoc
        ? `[Passage ${i + 1} from "${fileName}"]\n${doc.pageContent}`
        : `[Passage ${i + 1}]\n${doc.pageContent}`,
    )
    .join("\n\n");

  // System message carries retrieved context; history provides conversation
  // memory; the final HumanMessage is the current question.
  const augmentedMessages = [
    new SystemMessage(
      `${SYSTEM_PROMPT}\n\nContext from the document${multiDoc ? "s" : ""}:\n\n${context}`,
    ),
    ...history,
    new HumanMessage(question),
  ];

  const stream = await getChatModel().stream(augmentedMessages);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
