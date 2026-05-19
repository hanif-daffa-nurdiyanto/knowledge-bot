import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CreateConversationBody = {
  title?: string;
};

export async function GET() {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: conversations, error: conversationError } = await supabase
    .from("chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_email", userEmail)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (conversationError) {
    return Response.json({ error: conversationError.message }, { status: 500 });
  }

  const conversationIds = (conversations ?? []).map(
    (conversation) => conversation.id
  );

  const { data: messages, error: messageError } =
    conversationIds.length > 0
      ? await supabase
          .from("chat_messages")
          .select("id, conversation_id, role, content, sources, status, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

  if (messageError) {
    return Response.json({ error: messageError.message }, { status: 500 });
  }

  const messagesByConversation = new Map<string, typeof messages>();

  for (const message of messages ?? []) {
    const current = messagesByConversation.get(message.conversation_id) ?? [];
    current.push(message);
    messagesByConversation.set(message.conversation_id, current);
  }

  return Response.json({
    conversations: (conversations ?? []).map((conversation) => ({
      ...conversation,
      messages: messagesByConversation.get(conversation.id) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();

  if (!userEmail) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateConversationBody;
  const title = body.title?.trim() || "New chat";
  const supabase = createAdminClient();
  const { data: conversation, error } = await supabase
    .from("chat_conversations")
    .insert({
      user_email: userEmail,
      title,
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ conversation }, { status: 201 });
}
