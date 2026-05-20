import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type UpdateConversationBody = {
  title?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateConversationBody;
  const title = body.title?.trim();

  if (!title) {
    return Response.json({ error: "Title is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: conversation, error } = await supabase
    .from("chat_conversations")
    .update({ title })
    .eq("id", conversationId)
    .eq("user_email", userEmail)
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  return Response.json({ conversation });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const supabase = createAdminClient();
  const { data: conversation, error: findError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_email", userEmail)
    .single();

  if (findError || !conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_email", userEmail);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
