"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ToastViewport, useToasts } from "@/components/ui/toast";
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

type PersistedConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    sources: SourceCardData[];
    status: "streaming" | "done" | "error";
    created_at: string;
  }>;
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionScrollIdRef = useRef<string | null>(null);
  const { addToast, dismissToast, toasts } = useToasts();

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ) ?? conversations[0],
    [activeConversationId, conversations]
  );

  const loadConversations = useCallback(async () => {
    setIsLoadingHistory(true);

    try {
      const response = await fetch("/api/chat/conversations", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        conversations?: PersistedConversation[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load chat history.");
      }

      const loadedConversations = (data.conversations ?? []).map(
        mapPersistedConversation
      );

      if (loadedConversations.length === 0) {
        const conversation = createConversation();
        setConversations([conversation]);
        setActiveConversationId(conversation.id);
        return;
      }

      setConversations(loadedConversations);
      setActiveConversationId(loadedConversations[0].id);
    } catch (error) {
      addToast({
        type: "error",
        title: "Gagal memuat riwayat",
        description:
          error instanceof Error ? error.message : "Failed to load chat history.",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [addToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [activeConversationId]);

  useEffect(() => {
    const messageId = pendingQuestionScrollIdRef.current;

    if (!messageId) {
      return;
    }

    scrollMessageToTop(messageId, "smooth");
    pendingQuestionScrollIdRef.current = null;
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
    const currentConversation = activeConversation;

    if (!text || isStreaming || !currentConversation) {
      return;
    }

    const title =
      currentConversation.title === "New chat"
        ? createTitle(text)
        : currentConversation.title;
    let conversationId = currentConversation.id;

    try {
      conversationId = await ensurePersistedConversation(
        currentConversation,
        title
      );
    } catch (error) {
      addToast({
        type: "error",
        title: "Gagal membuat history",
        description:
          error instanceof Error ? error.message : "Failed to create history.",
      });
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
    pendingQuestionScrollIdRef.current = userMessage.id;
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title,
      messages: [...conversation.messages, userMessage, assistantMessage],
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantContent = "";

    await saveMessage(conversationId, {
      role: "user",
      content: text,
      sources: [],
      status: "done",
      title,
    });

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
        assistantContent += chunk;
        updateAssistant(conversationId, assistantMessageId, {
          appendContent: chunk,
        });
      }

      const finalText = decoder.decode();
      if (finalText) {
        assistantContent += finalText;
        updateAssistant(conversationId, assistantMessageId, {
          appendContent: finalText,
        });
      }

      updateAssistant(conversationId, assistantMessageId, { status: "done" });
      await saveMessage(conversationId, {
        role: "assistant",
        content: assistantContent,
        sources,
        status: "done",
      });
    } catch (error) {
      const isAbortError =
        error instanceof DOMException && error.name === "AbortError";
      const description =
        error instanceof Error ? error.message : "Unknown error";
      const message = isAbortError
        ? "\n\nStreaming dihentikan."
        : `Gagal mengambil jawaban: ${description}`;

      addToast({
        type: isAbortError ? "info" : "error",
        title: isAbortError ? "Streaming dihentikan" : "Chat gagal",
        description: isAbortError
          ? "Response terakhir disimpan sampai titik penghentian."
          : description,
      });

      updateAssistant(conversationId, assistantMessageId, {
        appendContent: message,
        status: isAbortError ? "done" : "error",
      });
      await saveMessage(conversationId, {
        role: "assistant",
        content: `${assistantContent}${message}`,
        sources: [],
        status: isAbortError ? "done" : "error",
      });
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    window.requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;

      if (scrollArea) {
        scrollArea.scrollTo({
          top: scrollArea.scrollHeight,
          behavior,
        });
        return;
      }

      endRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }

  function scrollMessageToTop(
    messageId: string,
    behavior: ScrollBehavior = "smooth"
  ) {
    window.requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;
      const messageElement = scrollArea?.querySelector<HTMLElement>(
        `[data-message-id="${messageId}"]`
      );

      if (!scrollArea || !messageElement) {
        return;
      }

      const scrollAreaTop = scrollArea.getBoundingClientRect().top;
      const messageTop = messageElement.getBoundingClientRect().top;
      const topPadding = 24;

      scrollArea.scrollTo({
        top: scrollArea.scrollTop + messageTop - scrollAreaTop - topPadding,
        behavior,
      });
    });
  }

  async function ensurePersistedConversation(
    conversation: Conversation,
    title: string
  ) {
    if (!conversation.id.startsWith("local-")) {
      return conversation.id;
    }

    const response = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = (await response.json()) as {
      conversation?: {
        id: string;
        title: string;
        created_at: string;
        updated_at: string;
      };
      error?: string;
    };

    if (!response.ok || !data.conversation) {
      throw new Error(data.error ?? "Failed to create conversation.");
    }

    const persistedConversation = data.conversation;
    setConversations((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? {
            ...item,
            id: persistedConversation.id,
            title: persistedConversation.title,
            createdAtLabel: formatDate(
              new Date(persistedConversation.created_at)
            ),
          }
          : item
      )
    );
    setActiveConversationId(persistedConversation.id);

    return persistedConversation.id;
  }

  async function saveMessage(
    conversationId: string,
    message: {
      role: "user" | "assistant";
      content: string;
      sources: SourceCardData[];
      status: "done" | "error";
      title?: string;
    }
  ) {
    const response = await fetch(
      `/api/chat/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      }
    );

    if (!response.ok) {
      const error = await readError(response);
      addToast({
        type: "error",
        title: "Gagal menyimpan history",
        description: error,
      });
    }
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
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      <ToastViewport dismissToast={dismissToast} toasts={toasts} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                <PanelLeftOpen className="size-5" aria-hidden="true" />
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
              <p className="truncate text-xs text-muted-foreground">
                {userEmail}
              </p>
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

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <aside
            className={cn(
              "hidden w-72 shrink-0 border-r bg-sidebar text-sidebar-foreground md:flex md:flex-col",
              !isDesktopSidebarOpen && "md:hidden"
            )}
          >
            <SidebarContent
              activeConversationId={activeConversationId}
              conversations={conversations}
              isLoadingHistory={isLoadingHistory}
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
                  isLoadingHistory={isLoadingHistory}
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

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              ref={scrollAreaRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {activeConversation?.messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-4 py-3 md:px-8">
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
          </section>
        </div>
      </div>
    </main>
  );
}

function SidebarContent({
  activeConversationId,
  conversations,
  isLoadingHistory,
  onCloseSidebar,
  onNewConversation,
  onSelectConversation,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  isLoadingHistory: boolean;
  onCloseSidebar: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
}) {
  return (
    <>
      <div className="border-b px-4 py-4">
        <Button
          type="button"
          className="w-full justify-start"
          onClick={onNewConversation}
        >
          <Plus className="size-4" aria-hidden="true" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase text-muted-foreground">
          <span>History</span>
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
        {isLoadingHistory ? (
          <div className="space-y-2 px-3 py-2">
            <div className="h-9 rounded-md bg-muted" />
            <div className="h-9 rounded-md bg-muted" />
            <div className="h-9 rounded-md bg-muted" />
          </div>
        ) :
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
        }
      </div>
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      data-message-id={message.id}
      className={cn("scroll-mt-6 flex gap-3", isUser && "flex-row-reverse")}
    >
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
    id: id.startsWith("local-") ? id : `local-${id}`,
    title: "New chat",
    createdAtLabel: id === "initial" ? "Today" : formatDate(new Date()),
    messages: [welcomeMessage],
  };
}

function mapPersistedConversation(
  conversation: PersistedConversation
): Conversation {
  const messages = conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    sources: Array.isArray(message.sources) ? message.sources : [],
    status: message.status === "streaming" ? "done" : message.status,
  }));

  return {
    id: conversation.id,
    title: conversation.title,
    createdAtLabel: formatDate(new Date(conversation.created_at)),
    messages: messages.length > 0 ? messages : [welcomeMessage],
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
