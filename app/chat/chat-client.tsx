"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  Bot,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Square,
  UserRound,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { MarkdownMessage } from "@/components/chat/markdown-message";
import {
  SourceCard,
  type SourceCardData,
} from "@/components/chat/source-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type ChatClientProps = {
  userName: string;
  userEmail: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceCardData[];
  status?: "streaming" | "done" | "error";
};

type Conversation = {
  id: string;
  title: string;
  createdAtLabel: string;
  messages: ChatMessage[];
};

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Halo. Tanya apa pun dari dokumen internal yang sudah di-ingest ke knowledge base.",
  sources: [],
  status: "done",
};

export function ChatClient({ userName, userEmail }: ChatClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(() => [
    createConversation("initial"),
  ]);
  const [activeConversationId, setActiveConversationId] = useState(
    () => conversations[0]?.id ?? ""
  );
  const [input, setInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ) ?? conversations[0],
    [activeConversationId, conversations]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activeConversation?.messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        startNewConversation();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function startNewConversation() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setInput("");
    setIsSidebarOpen(false);
  }

  function updateConversation(
    conversationId: string,
    updater: (conversation: Conversation) => Conversation
  ) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation
      )
    );
  }

  async function submitMessage() {
    const text = input.trim();
    const conversationId = activeConversation?.id;

    if (!text || isStreaming || !conversationId) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      sources: [],
      status: "done",
    };
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      sources: [],
      status: "streaming",
    };

    setInput("");
    setIsStreaming(true);
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title:
        conversation.title === "New chat"
          ? createTitle(text)
          : conversation.title,
      messages: [...conversation.messages, userMessage, assistantMessage],
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await readError(response);
        throw new Error(error);
      }

      const sources = parseSources(response.headers.get("x-rag-sources"));
      updateAssistant(conversationId, assistantMessageId, {
        sources,
      });

      if (!response.body) {
        throw new Error("Chat response stream is empty.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        updateAssistant(conversationId, assistantMessageId, {
          appendContent: chunk,
        });
      }

      const finalText = decoder.decode();
      if (finalText) {
        updateAssistant(conversationId, assistantMessageId, {
          appendContent: finalText,
        });
      }

      updateAssistant(conversationId, assistantMessageId, { status: "done" });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "\n\nStreaming dihentikan."
          : `Gagal mengambil jawaban: ${error instanceof Error ? error.message : "Unknown error"
          }`;

      updateAssistant(conversationId, assistantMessageId, {
        appendContent: message,
        status:
          error instanceof DOMException && error.name === "AbortError"
            ? "done"
            : "error",
      });
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function updateAssistant(
    conversationId: string,
    messageId: string,
    patch: {
      appendContent?: string;
      sources?: SourceCardData[];
      status?: ChatMessage["status"];
    }
  ) {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId
          ? {
            ...message,
            content: `${message.content}${patch.appendContent ?? ""}`,
            sources: patch.sources ?? message.sources,
            status: patch.status ?? message.status,
          }
          : message
      ),
    }));
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          {!isDesktopSidebarOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              onClick={() => setIsDesktopSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          ) : null}
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenText className="size-5" aria-hidden="true" />
            </div>
            <span className="truncate font-semibold">KnowledgeBot</span>
          </Link>
        </div>


        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden w-72 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col",
            !isDesktopSidebarOpen && "md:hidden"
          )}
        >
          <SidebarContent
            activeConversationId={activeConversationId}
            conversations={conversations}
            onCloseSidebar={() => setIsDesktopSidebarOpen(false)}
            onNewConversation={startNewConversation}
            onSelectConversation={(id) => setActiveConversationId(id)}
          />
        </aside>

        {isSidebarOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close sidebar"
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <aside className="relative flex h-full w-80 max-w-[86vw] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="flex h-14 items-center justify-end px-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <SidebarContent
                activeConversationId={activeConversationId}
                conversations={conversations}
                onCloseSidebar={() => setIsSidebarOpen(false)}
                onNewConversation={startNewConversation}
                onSelectConversation={(id) => {
                  setActiveConversationId(id);
                  setIsSidebarOpen(false);
                }}
              />
            </aside>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {activeConversation?.messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div className="border-t bg-background px-4 py-3 md:px-8">
              <div className="mx-auto max-w-3xl">
                <div className="rounded-lg border bg-card p-2 shadow-xs">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitMessage();
                      }
                    }}
                    rows={3}
                    placeholder="Tanya kebijakan, SOP, atau isi dokumen internal..."
                    className="max-h-40 min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                    disabled={isStreaming}
                  />
                  <div className="flex items-center justify-between gap-3 px-2 pb-1">
                    <p className="text-xs text-muted-foreground">
                      Enter kirim, Shift+Enter baris baru, Ctrl/Cmd+K chat baru
                    </p>
                    {isStreaming ? (
                      <Button type="button" variant="outline" onClick={stopStreaming}>
                        <Square className="size-4 fill-current" aria-hidden="true" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={submitMessage}
                        disabled={!input.trim()}
                      >
                        <Send className="size-4" aria-hidden="true" />
                        Send
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SidebarContent({
  activeConversationId,
  conversations,
  onCloseSidebar,
  onNewConversation,
  onSelectConversation,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  onCloseSidebar: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
}) {
  return (
    <>
      <div className="border-b px-4 py-4">
        <h2 className="text-sm font-semibold">Riwayat Chat</h2>
        <Button
          type="button"
          className="mt-4 w-full justify-start"
          onClick={onNewConversation}
        >
          <Plus className="size-4" aria-hidden="true" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase text-muted-foreground">
          <span>Riwayat</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onCloseSidebar}
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <div className="space-y-1">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelectConversation(conversation.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                conversation.id === activeConversationId &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <MessageSquareText
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {conversation.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {conversation.createdAtLabel}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? (
          <UserRound className="size-4" aria-hidden="true" />
        ) : (
          <Bot className="size-4" aria-hidden="true" />
        )}
      </div>
      <div
        className={cn(
          "min-w-0 max-w-[calc(100%-3rem)]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-lg px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground"
              : "border bg-card text-card-foreground"
          )}
        >
          {message.content ? (
            isUser ? (
              <p className="whitespace-pre-wrap text-sm leading-6">
                {message.content}
              </p>
            ) : (
              <MarkdownMessage content={message.content} />
            )
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching knowledge base...
            </div>
          )}
        </div>

        {message.role === "assistant" && message.sources.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {message.sources.map((source) => (
              <SourceCard key={source.id} source={source} compact />
            ))}
          </div>
        ) : null}

        {message.status === "error" ? (
          <p className="mt-2 text-xs text-destructive">Response failed.</p>
        ) : null}
      </div>
    </div>
  );
}

function createConversation(id = crypto.randomUUID()): Conversation {
  return {
    id,
    title: "New chat",
    createdAtLabel: id === "initial" ? "Today" : formatDate(new Date()),
    messages: [welcomeMessage],
  };
}

function createTitle(text: string) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

function parseSources(value: string | null): SourceCardData[] {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(decodeURIComponent(value)) as SourceCardData[];
  } catch {
    return [];
  }
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
