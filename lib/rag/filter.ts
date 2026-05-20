import "server-only";

import { generateText } from "ai";

import { getChatModel } from "@/lib/ai/chat-model";
import type { SourceChunk } from "@/lib/rag/search";

const MIN_RELEVANCE_SCORE = 0.6;
const MAX_CHUNK_CHARS = 2400;

type FilterLlmMode = "ON" | "OFF";

type RelevanceResult = {
  id: string;
  relevant: boolean;
  score: number;
};

type RelevanceResponse = {
  results: RelevanceResult[];
};

export const FILTER_LLM = getFilterLlmMode();
export const FILTER_LLM_ENABLED = FILTER_LLM === "ON";

export function getRagCandidateCount(matchCount: number) {
  if (!FILTER_LLM_ENABLED) {
    return matchCount;
  }

  return Math.max(matchCount * 3, 12);
}

export async function filterChunksWithLlm(query: string, chunks: SourceChunk[]) {
  if (!FILTER_LLM_ENABLED || chunks.length === 0) {
    return chunks;
  }

  const { text } = await generateText({
    model: getChatModel(),
    system: [
      "You are a strict relevance judge for a RAG system.",
      "Decide if each document chunk contains information useful to answer the user question.",
      "Return JSON only. Do not answer the user question.",
    ].join("\n"),
    prompt: buildFilterPrompt(query, chunks),
    temperature: 0,
  });

  const response = parseRelevanceResponse(text);
  if (!response) {
    return chunks;
  }

  const verdicts = new Map(
    response.results.map((result) => [
      result.id,
      {
        relevant: result.relevant,
        score: normalizeScore(result.score),
      },
    ])
  );

  return chunks.filter((chunk) => {
    const verdict = verdicts.get(chunk.id);

    return Boolean(
      verdict?.relevant && verdict.score >= MIN_RELEVANCE_SCORE
    );
  });
}

function buildFilterPrompt(query: string, chunks: SourceChunk[]) {
  const formattedChunks = chunks
    .map((chunk, index) =>
      [
        `ID: ${chunk.id}`,
        `Candidate: C${index + 1}`,
        `Document: ${chunk.document_name}`,
        `Page: ${chunk.page_number ?? "unknown"}`,
        `Chunk: ${chunk.chunk_index}`,
        `Similarity: ${chunk.similarity.toFixed(3)}`,
        "Content:",
        truncateChunk(chunk.content),
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return [
    `User question: ${query}`,
    "",
    "For each candidate, return whether it is relevant to answering the question.",
    "Use score 0 to 1, where 1 means directly useful and 0 means unrelated.",
    "Return exactly this JSON shape:",
    '{"results":[{"id":"chunk-id","relevant":true,"score":0.92}]}',
    "",
    "Candidates:",
    formattedChunks,
  ].join("\n");
}

function parseRelevanceResponse(text: string): RelevanceResponse | null {
  const jsonText = extractJson(text);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as RelevanceResponse;

    if (!Array.isArray(parsed.results)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return trimmed.slice(start, end + 1);
}

function truncateChunk(content: string) {
  if (content.length <= MAX_CHUNK_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_CHUNK_CHARS)}...`;
}

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(score, 0), 1);
}

function getFilterLlmMode(): FilterLlmMode {
  const mode = process.env.FILTER_LLM ?? "OFF";

  if (mode !== "ON" && mode !== "OFF") {
    throw new Error("FILTER_LLM must be ON or OFF.");
  }

  return mode;
}
