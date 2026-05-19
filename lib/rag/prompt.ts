import "server-only";

import type { SourceChunk } from "@/lib/rag/search";

export function buildRagSystemPrompt() {
  return [
    "Kamu adalah asisten internal perusahaan.",
    "Jawab pertanyaan karyawan hanya dari context dokumen yang diberikan.",
    "Jangan mengarang di luar context.",
    "Jika context tidak cukup, katakan dengan jelas bahwa informasi tidak ditemukan di knowledge base.",
    "Jawab dalam bahasa yang sama dengan pertanyaan user.",
    "Jawaban harus singkat, langsung ke poin, dan menyertakan source attribution.",
    "Gunakan format sumber seperti [S1], [S2] di kalimat yang relevan.",
    "Akhiri jawaban dengan bagian 'Sources:' berisi daftar source yang dipakai.",
  ].join("\n");
}

export function buildRagUserPrompt(query: string, chunks: SourceChunk[]) {
  return [
    "Context dari knowledge base:",
    formatChunks(chunks),
    "---",
    `Pertanyaan: ${query}`,
    "Jawab:",
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
