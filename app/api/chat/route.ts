import { NextResponse } from "next/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { PineconeStore } from "@langchain/pinecone";
import { getChatModel, getEmbeddings } from "@/lib/gemini";
import { getPineconeIndex } from "@/lib/pinecone";

const SYSTEM_PROMPT = `You are an assistant that answers questions about a PDF the user has uploaded.
Answer ONLY using the context passages below — they were retrieved from the document because
they're the closest semantic match to the question. If the answer isn't contained in the
context, say you couldn't find it in the document. Don't make anything up.`;

function lastUserMessageText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUserMessage) return "";
  return lastUserMessage.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export async function POST(request: Request) {
  const { messages, namespace } = (await request.json()) as {
    messages: UIMessage[];
    namespace?: string;
  };

  if (!namespace) {
    return NextResponse.json({ error: "Missing namespace — upload a PDF first" }, { status: 400 });
  }

  const question = lastUserMessageText(messages);

  // Retrieval: embed the question with the *same* embedding model used at
  // index time, then ask Pinecone for the chunks whose vectors are closest
  // (cosine similarity) to the question's vector.
  const vectorStore = await PineconeStore.fromExistingIndex(getEmbeddings(), {
    pineconeIndex: getPineconeIndex(),
    namespace,
  });
  const relevantChunks = await vectorStore.similaritySearch(question, 4);

  // Prompt augmentation: splice the retrieved passages into the prompt so
  // the model answers from the document's actual content instead of relying
  // on (and possibly hallucinating from) what it remembers from training.
  const context = relevantChunks
    .map((doc, i) => `[Passage ${i + 1}]\n${doc.pageContent}`)
    .join("\n\n");

  const augmentedMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`Context from the document:\n\n${context}\n\nQuestion: ${question}`),
  ];

  const stream = await getChatModel().stream(augmentedMessages);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
