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
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  message?: string;
  messages?: UIMessage[];
  matchCount?: number;
  threshold?: number;
  documentId?: string | null;
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

  const safeGeneralAnswer = getSafeGeneralAnswer(query);

  if (safeGeneralAnswer) {
    return createTextStreamResponse(safeGeneralAnswer, {
      headers: {
        "x-rag-source-count": "0",
        "x-rag-sources": encodeURIComponent(JSON.stringify([])),
        "x-rag-threshold": String(body.threshold ?? DEFAULT_MATCH_THRESHOLD),
        "x-rag-candidate-count": "0",
        "x-rag-filter-llm": FILTER_LLM,
        "x-rag-chat-provider": CHAT_PROVIDER,
        "x-rag-chat-model": CHAT_MODEL,
      },
    });
  }

  const threshold = body.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const matchCount = body.matchCount ?? DEFAULT_MATCH_COUNT;
  const documentId = normalizeDocumentId(body.documentId);
  const selectedDocument = documentId
    ? await getReadyDocument(documentId)
    : null;

  if (documentId && !selectedDocument) {
    return Response.json(
      { error: "Selected document is not available for chat." },
      { status: 404 }
    );
  }

  const candidateCount = getRagCandidateCount(matchCount);
  const candidateChunks = await searchSimilarChunks(query, {
    matchCount: candidateCount,
    threshold,
    documentId: selectedDocument?.id,
  });
  const filteredChunks = await filterChunksWithLlm(query, candidateChunks);
  const chunks = (
    filteredChunks.length > 0 ? filteredChunks : candidateChunks
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
    "x-rag-document-id": selectedDocument?.id ?? "",
    "x-rag-document-name": encodeURIComponent(selectedDocument?.name ?? ""),
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

function normalizeDocumentId(documentId: ChatRequestBody["documentId"]) {
  const trimmed = documentId?.trim();

  return trimmed || null;
}

async function getReadyDocument(documentId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, name")
    .eq("id", documentId)
    .eq("status", "ready")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function getSafeGeneralAnswer(query: string) {
  const normalized = normalizeQuery(query);

  if (isGreeting(normalized)) {
    return [
      "Halo! Saya KnowledgeBot, asisten internal untuk membantu menjawab pertanyaan dari dokumen perusahaan yang sudah diunggah.",
      "",
      "Silakan tanya tentang kebijakan, SOP, HR, IT, atau dokumen internal lain yang tersedia.",
    ].join("\n");
  }

  if (isThanks(normalized)) {
    return "Sama-sama. Ada pertanyaan lain tentang dokumen internal yang bisa saya bantu?";
  }

  if (isAppQuestion(normalized)) {
    return [
      "KnowledgeBot adalah aplikasi knowledge base internal.",
      "",
      "Saya bisa membantu menjawab pertanyaan berdasarkan dokumen perusahaan yang sudah diunggah dan diproses. Admin juga bisa mengunggah, memantau status pemrosesan, menambahkan dokumen demo, dan menghapus dokumen dari halaman admin.",
      "",
      "Untuk pertanyaan tentang kebijakan, prosedur, HR, IT, atau informasi internal lain, saya tetap akan merujuk ke dokumen yang tersedia.",
    ].join("\n");
  }

  return "";
}

function normalizeQuery(query: string) {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreeting(normalized: string) {
  return /^(halo|hai|hi|hello|hey|pagi|selamat pagi|siang|selamat siang|sore|selamat sore|malam|selamat malam|assalamualaikum|assalamu alaikum)$/.test(
    normalized
  );
}

function isThanks(normalized: string) {
  return /^(terima kasih|makasih|thanks|thank you|thx|ok thanks|oke thanks|sip thanks)$/.test(
    normalized
  );
}

function isAppQuestion(normalized: string) {
  return (
    /^(kamu siapa|siapa kamu|anda siapa|ini aplikasi apa|aplikasi ini apa|apa ini|knowledgebot itu apa)$/.test(
      normalized
    ) ||
    /\b(aplikasi ini|knowledgebot|knowledge bot|chatbot ini|bot ini)\b/.test(
      normalized
    ) ||
    /\b(apa yang bisa kamu bantu|kamu bisa apa|bisa bantu apa|cara pakai|bagaimana cara pakai|fitur aplikasi|fitur knowledgebot|fitur bot)\b/.test(
      normalized
    )
  );
}
