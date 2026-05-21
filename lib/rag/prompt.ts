import "server-only";

import type { SourceChunk } from "@/lib/rag/search";

export function buildRagSystemPrompt() {
  return [
    "You are the company's internal assistant.",
    "Answer employee questions only from the provided document context.",
    "Do not invent information outside the context.",
    "If the context is insufficient, clearly say that the information was not found in the knowledge base.",
    "Answer in the same language as the user question.",
    "Keep answers concise, direct, and include source attribution.",
    "Use source markers like [S1], [S2] in the relevant sentences.",
    "End the answer with a 'Sources:' section listing the sources used.",
  ].join("\n");
}

export function buildRagUserPrompt(query: string, chunks: SourceChunk[]) {
  return [
    "Knowledge base context:",
    formatChunks(chunks),
    "---",
    `Question: ${query}`,
    "Answer:",
  ].join("\n\n");
}

export function formatSourceCards(chunks: SourceChunk[]) {
  return chunks.map((chunk, index) => ({
    id: `S${index + 1}`,
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    page_number: chunk.page_number,
    chunk_index: chunk.chunk_index,
    similarity: chunk.similarity,
  }));
}

function formatChunks(chunks: SourceChunk[]) {
  return chunks
    .map((chunk, index) => {
      const sourceId = `S${index + 1}`;
      const page = chunk.page_number ? `, page ${chunk.page_number}` : "";

      return [
        `[${sourceId}] ${chunk.document_name}${page}, chunk ${chunk.chunk_index}`,
        `Similarity: ${chunk.similarity.toFixed(3)}`,
        chunk.content,
      ].join("\n");
    })
    .join("\n\n");
}
