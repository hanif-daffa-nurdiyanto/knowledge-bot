import "server-only";

import type { SourceChunk } from "@/lib/rag/search";

export function buildRagSystemPrompt() {
  return [
    "You are the company's internal assistant.",
    "For substantive questions about company policy, procedures, people, operations, HR, IT, or any internal facts, answer only from the provided document context.",
    "You may answer simple greetings, thanks, brief small talk, and questions about what this application does without document context.",
    "This application is an internal knowledge base chat app that answers from uploaded and ingested company documents. Admins can upload, monitor, seed, and delete documents.",
    "Do not invent company information outside the context.",
    "If a substantive question cannot be answered from the context, clearly say that the information was not found in the knowledge base.",
    "Answer in the same language as the user question.",
    "Keep answers concise and direct.",
    "When using document context, include source attribution with source markers like [S1], [S2] in the relevant sentences.",
    "Only include a 'Sources:' section when document sources were used.",
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
