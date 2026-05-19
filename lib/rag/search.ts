import "server-only";

import { embedTexts } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_MATCH_COUNT = 5;
export const DEFAULT_MATCH_THRESHOLD = 0.75;

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
  } = {}
) {
  const matchCount = options.matchCount ?? DEFAULT_MATCH_COUNT;
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const [queryEmbedding] = await embedTexts([query], 1);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: formatVector(queryEmbedding),
    match_count: matchCount,
    match_threshold: threshold,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as SourceChunk[];
}

function formatVector(values: number[]) {
  return `[${values.join(",")}]`;
}
