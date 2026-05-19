import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateMessageBody = {
  role?: "user" | "assistant";
  content?: string;
  sources?: unknown[];
  status?: "streaming" | "done" | "error";
  title?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const body = (await request.json()) as CreateMessageBody;

  if (body.role !== "user" && body.role !== "assistant") {
    return Response.json({ error: "Invalid message role." }, { status: 400 });
  }

  const content = body.content?.trim();

  if (!content) {
    return Response.json({ error: "Message content is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_email", userEmail)
    .single();

  if (conversationError || !conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data: message, error: messageError } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role: body.role,
      content,
      sources: body.sources ?? [],
      status: body.status ?? "done",
    })
    .select("id, conversation_id, role, content, sources, status, created_at")
    .single();

  if (messageError) {
    return Response.json({ error: messageError.message }, { status: 500 });
  }

  const conversationUpdate: { updated_at: string; title?: string } = {
    updated_at: new Date().toISOString(),
  };

  if (body.role === "user" && body.title?.trim()) {
    conversationUpdate.title = body.title.trim();
  }

  await supabase
    .from("chat_conversations")
    .update(conversationUpdate)
    .eq("id", conversationId);

  return Response.json({ message }, { status: 201 });
}
