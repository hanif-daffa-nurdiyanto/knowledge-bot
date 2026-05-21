import { streamText, type UIMessage } from "ai";

import { auth } from "@/auth";
import { CHAT_MODEL, CHAT_PROVIDER, getChatModel } from "@/lib/ai/chat-model";
import {
  DEFAULT_MATCH_COUNT,
  DEFAULT_MATCH_THRESHOLD,
  searchSimilarChunks,
} from "@/lib/rag/search";
import {
  FILTER_LLM,
  filterChunksWithLlm,
  getRagCandidateCount,
} from "@/lib/rag/filter";
import {
  buildRagSystemPrompt,
  buildRagUserPrompt,
  formatSourceCards,
} from "@/lib/rag/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  message?: string;
  messages?: UIMessage[];
  matchCount?: number;
  threshold?: number;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const query = extractQuery(body);

  if (!query) {
    return Response.json(
      { error: 'Expected "message" or non-empty "messages".' },
      { status: 400 }
    );
  }

  const threshold = body.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const matchCount = body.matchCount ?? DEFAULT_MATCH_COUNT;
  const candidateCount = getRagCandidateCount(matchCount);
  const candidateChunks = await searchSimilarChunks(query, {
    matchCount: candidateCount,
    threshold,
  });
  const chunks = (
    await filterChunksWithLlm(query, candidateChunks)
  ).slice(0, matchCount);
  const sourceCards = formatSourceCards(chunks);
  const headers = {
    "x-rag-source-count": String(sourceCards.length),
    "x-rag-sources": encodeURIComponent(JSON.stringify(sourceCards)),
    "x-rag-threshold": String(threshold),
    "x-rag-candidate-count": String(candidateChunks.length),
    "x-rag-filter-llm": FILTER_LLM,
    "x-rag-chat-provider": CHAT_PROVIDER,
    "x-rag-chat-model": CHAT_MODEL,
  };

  if (chunks.length === 0) {
    return createTextStreamResponse(
      [
        "I could not find enough information in the knowledge base to answer that question.",
        "",
        "Please contact HR/IT or upload the relevant document to the knowledge base.",
      ].join("\n"),
      { headers }
    );
  }

  const result = streamText({
    model: getChatModel(),
    system: buildRagSystemPrompt(),
    prompt: buildRagUserPrompt(query, chunks),
    temperature: 0.2,
  });

  return result.toTextStreamResponse({ headers });
}

function extractQuery(body: ChatRequestBody) {
  if (body.message?.trim()) {
    return body.message.trim();
  }

  const lastUserMessage = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");

  if (!lastUserMessage) {
    return "";
  }

  return lastUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function createTextStreamResponse(text: string, init?: ResponseInit) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      ...init,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        ...Object.fromEntries(new Headers(init?.headers).entries()),
      },
    }
  );
}
