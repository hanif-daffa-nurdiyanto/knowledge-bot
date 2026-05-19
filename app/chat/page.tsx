import { auth } from "@/auth";

import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const session = await auth();

  return (
    <ChatClient
      userName={session?.user?.name ?? session?.user?.email ?? "User"}
      userEmail={session?.user?.email ?? ""}
    />
  );
}
