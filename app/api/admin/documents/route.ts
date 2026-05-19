import { requireAdminApiSession } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireAdminApiSession();

  if (response) {
    return response;
  }

  const supabase = createAdminClient();
  const { data: documents, error } = await supabase
    .from("documents")
    .select(
      "id, name, source_type, status, source_url, metadata, error_message, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const documentIds = (documents ?? []).map((document) => document.id);
  const { counts: chunkCounts, error: chunkCountError } =
    await getChunkCounts(documentIds);

  if (chunkCountError) {
    return Response.json({ error: chunkCountError }, { status: 500 });
  }

  return Response.json({
    documents: (documents ?? []).map((document) => ({
      ...document,
      chunk_count: chunkCounts.get(document.id) ?? 0,
    })),
  });
}

async function getChunkCounts(documentIds: string[]) {
  const counts = new Map<string, number>();

  if (documentIds.length === 0) {
    return { counts, error: null };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chunks")
    .select("document_id")
    .in("document_id", documentIds);

  if (error) {
    return { counts, error: error.message };
  }

  for (const chunk of data ?? []) {
    counts.set(chunk.document_id, (counts.get(chunk.document_id) ?? 0) + 1);
  }

  return { counts, error: null };
}
