"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  Bot,
  Check,
  ExternalLink,
  FileSearch,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Pencil,
  Plus,
  Send,
  Square,
  Trash2,
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

type DocumentPreview = {
  document: {
    id: string;
    name: string;
    source_type: "pdf" | "notion";
    source_url: string | null;
    storage_path: string | null;
    metadata: Record<string, unknown>;
    preview_url: string | null;
  };
  selected_chunk: PreviewChunk;
  nearby_chunks: PreviewChunk[];
};

type PreviewChunk = {
  chunk_index: number;
  page_number: number | null;
  content: string;
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
  const [selectedSource, setSelectedSource] = useState<SourceCardData | null>(
    null
  );
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(
    null
  );
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionScrollIdRef = useRef<string | null>(null);
  const questionAnchorMessageIdRef = useRef<string | null>(null);
  const { addToast, dismissToast, toasts } = useToasts();

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId
      ) ?? conversations[0],
    [activeConversationId, conversations]
  );

  const activeSelectedSource = useMemo(() => {
    if (!selectedSource || !activeConversation) {
      return null;
    }

    const selectedKey = sourceKey(selectedSource);
    const hasSource = activeConversation.messages.some((message) =>
      message.sources.some((source) => sourceKey(source) === selectedKey)
    );

    return hasSource ? selectedSource : null;
  }, [activeConversation, selectedSource]);

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
    const pendingMessageId = pendingQuestionScrollIdRef.current;
    const messageId = pendingMessageId ?? questionAnchorMessageIdRef.current;

    if (!messageId) {
      return;
    }

    scrollMessageToTop(messageId, pendingMessageId ? "smooth" : "auto");

    if (pendingMessageId) {
      pendingQuestionScrollIdRef.current = null;
    }
  }, [activeConversation?.messages, isStreaming]);

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
    questionAnchorMessageIdRef.current = userMessage.id;
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
      questionAnchorMessageIdRef.current = null;
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
        const targetTop =
          scrollArea.scrollTop + messageTop - scrollAreaTop - topPadding;
        const maxTop = scrollArea.scrollHeight - scrollArea.clientHeight;

        scrollArea.scrollTo({
          top: Math.min(Math.max(targetTop, 0), Math.max(maxTop, 0)),
          behavior,
        });
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

  async function renameConversation(conversationId: string, title: string) {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    const previousConversations = conversations;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title: nextTitle }
          : conversation
      )
    );

    if (conversationId.startsWith("local-")) {
      return;
    }

    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });

      if (!response.ok) {
        const error = await readError(response);
        throw new Error(error);
      }
    } catch (error) {
      setConversations(previousConversations);
      addToast({
        type: "error",
        title: "Gagal mengubah nama history",
        description:
          error instanceof Error ? error.message : "Failed to rename history.",
      });
    }
  }

  async function deleteConversation(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);

    if (!conversation) {
      return;
    }

    if (isStreaming && activeConversationId === conversationId) {
      addToast({
        type: "info",
        title: "Streaming masih berjalan",
        description: "Stop streaming sebelum menghapus history aktif.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Hapus history "${conversation.title}" beserta semua pesannya?`
    );

    if (!confirmed) {
      return;
    }

    try {
      if (!conversationId.startsWith("local-")) {
        const response = await fetch(`/api/chat/conversations/${conversationId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await readError(response);
          throw new Error(error);
        }
      }

      const remaining = conversations.filter((item) => item.id !== conversationId);
      const nextConversations =
        remaining.length > 0 ? remaining : [createConversation()];

      setConversations(nextConversations);

      if (activeConversationId === conversationId) {
        setActiveConversationId(nextConversations[0].id);
      }
    } catch (error) {
      addToast({
        type: "error",
        title: "Gagal menghapus history",
        description:
          error instanceof Error ? error.message : "Failed to delete history.",
      });
    }
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

  async function selectSource(source: SourceCardData) {
    setSelectedSource(source);
    setDocumentPreview(null);
    setIsLoadingPreview(true);

    try {
      const params = new URLSearchParams({
        chunkIndex: String(source.chunk_index),
      });
      const response = await fetch(
        `/api/chat/documents/${source.document_id}/preview?${params}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as DocumentPreview & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load document preview.");
      }

      setDocumentPreview(data);
    } catch (error) {
      addToast({
        type: "error",
        title: "Gagal memuat preview",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load document preview.",
      });
    } finally {
      setIsLoadingPreview(false);
    }
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
              onDeleteConversation={deleteConversation}
              onNewConversation={startNewConversation}
              onRenameConversation={renameConversation}
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
                  onDeleteConversation={deleteConversation}
                  onNewConversation={startNewConversation}
                  onRenameConversation={renameConversation}
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
                  <ChatBubble
                    key={message.id}
                    message={message}
                    selectedSource={activeSelectedSource}
                    onSelectSource={selectSource}
                  />
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
                    placeholder="Ask about policies, SOPs, and other internal regulations..."
                    className="max-h-40 min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                    disabled={isStreaming}
                  />
                  <div className="flex items-center justify-between gap-3 px-2 pb-1">
                    <p className="text-xs text-muted-foreground">
                      Press Enter to send, Shift+Enter for a new line, Ctrl/Cmd+K for a new chat
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

          {activeSelectedSource ? (
            <DocumentPreviewPanel
              isLoading={isLoadingPreview}
              preview={documentPreview}
              source={activeSelectedSource}
              onClose={() => {
                setSelectedSource(null);
                setDocumentPreview(null);
              }}
            />
          ) : null}
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
  onDeleteConversation,
  onNewConversation,
  onRenameConversation,
  onSelectConversation,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  isLoadingHistory: boolean;
  onCloseSidebar: () => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onSelectConversation: (id: string) => void;
}) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(
    null
  );
  const [editingTitle, setEditingTitle] = useState("");

  function startEditing(conversation: Conversation) {
    setEditingConversationId(conversation.id);
    setEditingTitle(conversation.title);
  }

  function cancelEditing() {
    setEditingConversationId(null);
    setEditingTitle("");
  }

  function submitEditing() {
    if (!editingConversationId) {
      return;
    }

    onRenameConversation(editingConversationId, editingTitle);
    cancelEditing();
  }

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
              <div
                key={conversation.id}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  conversation.id === activeConversationId &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <MessageSquareText
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {editingConversationId === conversation.id ? (
                  <form
                    className="min-w-0 flex-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitEditing();
                    }}
                  >
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          cancelEditing();
                        }
                      }}
                      className="h-7 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Save history name"
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={cancelEditing}
                        aria-label="Cancel rename"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate font-medium">
                        {conversation.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {conversation.createdAtLabel}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startEditing(conversation)}
                        aria-label="Rename history"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onDeleteConversation(conversation.id)}
                        aria-label="Delete history"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        }
      </div>
    </>
  );
}

function ChatBubble({
  message,
  selectedSource,
  onSelectSource,
}: {
  message: ChatMessage;
  selectedSource: SourceCardData | null;
  onSelectSource: (source: SourceCardData) => void;
}) {
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
              <SourceCard
                key={source.id}
                source={source}
                compact
                isActive={sourceKey(source) === sourceKey(selectedSource)}
                onClick={onSelectSource}
              />
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

function DocumentPreviewPanel({
  isLoading,
  preview,
  source,
  onClose,
}: {
  isLoading: boolean;
  preview: DocumentPreview | null;
  source: SourceCardData;
  onClose: () => void;
}) {
  const previewUrl = preview?.document.preview_url ?? null;
  const chunks = preview?.nearby_chunks ?? [];

  return (
    <>
      <button
        type="button"
        aria-label="Close document preview"
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <aside className="fixed inset-x-3 bottom-4 top-20 z-50 flex flex-col overflow-hidden rounded-lg border bg-background shadow-xl md:relative md:inset-auto md:z-auto md:w-[28rem] md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0 md:shadow-none">
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileSearch className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {preview?.document.name ?? source.document_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {source.page_number ? `Page ${source.page_number}` : "No page"} -
              Chunk {source.chunk_index}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close document preview"
        >
          <PanelRightClose className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading preview...
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            {previewUrl ? (
              <div className="h-[42dvh] min-h-56 border-b bg-muted md:h-[52dvh] md:min-h-80">
                <iframe
                  title={`Preview ${preview?.document.name ?? source.document_name}`}
                  src={previewUrl}
                  className="h-full w-full"
                />
              </div>
            ) : (
              null
            )}

            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Source Context</h2>
                {previewUrl ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      Open
                    </a>
                  </Button>
                ) : null}
              </div>

              {chunks.length > 0 ? (
                <div className="space-y-3">
                  {chunks.map((chunk) => (
                    <div
                      key={chunk.chunk_index}
                      className={cn(
                        "rounded-md border p-3",
                        chunk.chunk_index === source.chunk_index
                          ? "border-primary bg-primary/5"
                          : "bg-card"
                      )}
                    >
                      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                        <span>Chunk {chunk.chunk_index}</span>
                        <span>
                          {chunk.page_number
                            ? `Page ${chunk.page_number}`
                            : "No page"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tidak ada teks preview untuk source ini.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}

function sourceKey(source: SourceCardData | null) {
  if (!source) {
    return "";
  }

  return `${source.document_id}:${source.chunk_index}`;
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
