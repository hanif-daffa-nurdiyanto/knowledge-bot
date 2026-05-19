import { requireAdminApiSession } from "@/lib/auth/admin";
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
  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    document_id: id,
    cascade: "chunks",
  });
}
