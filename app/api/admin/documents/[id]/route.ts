import { requireAdminApiSession } from "@/lib/auth/admin";
import {
  deleteDocumentFile,
  DOCUMENT_UPLOADS_BUCKET,
} from "@/lib/ingest/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdminApiSession();

  if (response) {
    return response;
  }

  const { id } = await context.params;

  if (!id) {
    return Response.json({ error: "Missing document id." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: document } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (document?.storage_path) {
    await deleteDocumentFile(DOCUMENT_UPLOADS_BUCKET, document.storage_path).catch(
      (deleteError) => {
        console.error("Failed to delete document upload", deleteError);
      }
    );
  }

  return Response.json({
    ok: true,
    document_id: id,
    cascade: "chunks, ingestion_jobs",
  });
}
