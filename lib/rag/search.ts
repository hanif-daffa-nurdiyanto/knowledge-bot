import "server-only";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
  embedTexts,
} from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_MATCH_COUNT = getDefaultMatchCount();
export const DEFAULT_MATCH_THRESHOLD = getDefaultMatchThreshold();

export type SourceChunk = {
  id: string;
  document_id: string;
  document_name: string;
  content: string;
  page_number: number | null;
  chunk_index: number;
  similarity: number;
  metadata: Record<string, unknown>;
};

export async function searchSimilarChunks(
  query: string,
  options: {
    matchCount?: number;
    threshold?: number;
    documentId?: string;
  } = {}
) {
  const matchCount = options.matchCount ?? DEFAULT_MATCH_COUNT;
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const documentId = options.documentId ?? null;
  const [queryEmbedding] = await embedTexts([query], 1, "query");
  const supabase = createAdminClient();

  const { data, error } = await searchChunksWithRpc({
    supabase,
    queryEmbedding,
    matchCount,
    threshold,
    documentId,
  });

  console.info("[rag:similarity-search:query]", {
    embeddingProvider: EMBEDDING_PROVIDER,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    queryEmbeddingDimensions: queryEmbedding.length,
    queryEmbeddingNorm: Number(vectorNorm(queryEmbedding).toFixed(6)),
    queryEmbeddingPreview: queryEmbedding
      .slice(0, 5)
      .map((value) => Number(value.toFixed(6))),
    matchCount,
    threshold,
    documentId,
    query: truncate(query, 160),
    data: JSON.stringify(data),
  });

  if (error) {
    console.error("[rag:similarity-search:error]", {
      query: truncate(query, 160),
      embeddingProvider: EMBEDDING_PROVIDER,
      embeddingModel: EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      matchCount,
      threshold,
      documentId,
      message: error.message,
    });
    throw error;
  }

  const chunks = (data ?? []) as SourceChunk[];

  if (chunks.length === 0) {
    await logRelaxedSimilaritySearch({
      supabase,
      query,
      queryEmbedding,
      matchCount,
      threshold,
      documentId,
    });
  }

  console.info("[rag:similarity-search:result]", {
    query: truncate(query, 160),
    embeddingProvider: EMBEDDING_PROVIDER,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    matchCount,
    threshold,
    documentId,
    resultCount: chunks.length,
    results: chunks.map((chunk, index) => ({
      rank: index + 1,
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      similarity: Number(chunk.similarity.toFixed(4)),
      preview: truncate(chunk.content.replace(/\s+/g, " "), 180),
    })),
  });

  return chunks;
}

async function logRelaxedSimilaritySearch({
  supabase,
  query,
  queryEmbedding,
  matchCount,
  threshold,
  documentId,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  query: string;
  queryEmbedding: number[];
  matchCount: number;
  threshold: number;
  documentId: string | null;
}) {
  const { data, error } = await searchChunksWithRpc({
    supabase,
    queryEmbedding,
    matchCount,
    threshold: -1,
    documentId,
  });

  if (error) {
    console.error("[rag:similarity-search:relaxed-error]", {
      query: truncate(query, 160),
      threshold,
      relaxedThreshold: -1,
      documentId,
      message: error.message,
    });
    return;
  }

  const chunks = (data ?? []) as SourceChunk[];

  console.info("[rag:similarity-search:relaxed-result]", {
    query: truncate(query, 160),
    threshold,
    relaxedThreshold: -1,
    documentId,
    resultCount: chunks.length,
    results: chunks.map((chunk, index) => ({
      rank: index + 1,
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      similarity: Number(chunk.similarity.toFixed(4)),
      passesConfiguredThreshold: chunk.similarity >= threshold,
      preview: truncate(chunk.content.replace(/\s+/g, " "), 180),
    })),
  });
}

async function searchChunksWithRpc({
  supabase,
  queryEmbedding,
  matchCount,
  threshold,
  documentId,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  queryEmbedding: number[];
  matchCount: number;
  threshold: number;
  documentId: string | null;
}) {
  const baseArgs = {
    query_embedding: formatVector(queryEmbedding),
    match_count: matchCount,
    match_threshold: threshold,
  };

  if (!documentId) {
    return supabase.rpc("match_document_chunks", baseArgs);
  }

  const result = await supabase.rpc("match_document_chunks", {
    ...baseArgs,
    document_id_filter: documentId,
  });

  if (!isMissingDocumentFilterRpcError(result.error)) {
    return result;
  }

  console.error(
    "Focused document search requires the document focus RPC migration. Apply supabase/migrations/202607070003_document_focus_search.sql and reload the Supabase schema cache."
  );

  return result;
}

function isMissingDocumentFilterRpcError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("document_id_filter") &&
      error.message.includes("match_document_chunks")
  );
}

function formatVector(values: number[]) {
  return `[${values.join(",")}]`;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function vectorNorm(values: number[]) {
  return Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0)
  );
}

function getDefaultMatchCount() {
  const configuredMatchCount = Number(process.env.MATCH_COUNT);

  if (
    Number.isInteger(configuredMatchCount) &&
    configuredMatchCount > 0
  ) {
    return configuredMatchCount;
  }

  return 5;
}

function getDefaultMatchThreshold() {
  const configuredThreshold = Number(process.env.RAG_MATCH_THRESHOLD);

  if (Number.isFinite(configuredThreshold)) {
    return configuredThreshold;
  }

  return EMBEDDING_PROVIDER === "ollama" ? 0.55 : 0.75;
}
