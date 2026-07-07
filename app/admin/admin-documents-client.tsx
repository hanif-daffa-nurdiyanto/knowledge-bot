"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Clock3,
  FileText,
  LinkIcon,
  Loader2,
  LogOut,
  RefreshCcw,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { ToastViewport, useToasts } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import Link from "next/link";

type AdminDocumentsClientProps = {
  userName: string;
  userEmail: string;
};

type DocumentStatus = "queued" | "processing" | "ready" | "failed";

type KnowledgeDocument = {
  id: string;
  name: string;
  source_type: "pdf" | "notion";
  status: DocumentStatus;
  source_url: string | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  chunk_count: number;
};

type DocumentsResponse = {
  documents?: KnowledgeDocument[];
  error?: string;
};

type UploadResponse = {
  document_id?: string;
  name?: string;
  status?: string;
  error?: string;
};

const maxFileSizeBytes = 25 * 1024 * 1024;

export function AdminDocumentsClient({
  userEmail,
  userName,
}: AdminDocumentsClientProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [notionUrl, setNotionUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const { addToast, dismissToast, toasts } = useToasts();

  const hasActiveIngestionDocument = useMemo(
    () =>
      documents.some((document) =>
        document.status === "queued" || document.status === "processing"
      ),
    [documents]
  );

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);

    try {
      const response = await fetch("/api/admin/documents", {
        cache: "no-store",
      });
      const data = (await response.json()) as DocumentsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load documents.");
      }

      setDocuments(data.documents ?? []);
    } catch (error) {
      addToast({
        type: "error",
        title: "Failed to load documents",
        description:
          error instanceof Error ? error.message : "Failed to load documents.",
      });
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to load documents.",
      });
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [addToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (!hasActiveIngestionDocument) {
      return;
    }

    const interval = window.setInterval(loadDocuments, 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveIngestionDocument, loadDocuments]);

  function selectFile(nextFile: File | null) {
    setNotice(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isPdf(nextFile)) {
      addToast({
        type: "error",
        title: "File rejected",
        description: "File must be a PDF.",
      });
      setNotice({ type: "error", message: "File must be a PDF." });
      return;
    }

    if (nextFile.size > maxFileSizeBytes) {
      addToast({
        type: "error",
        title: "File too large",
        description: "Maximum PDF size is 25MB.",
      });
      setNotice({ type: "error", message: "Maximum PDF size is 25MB." });
      return;
    }

    setFile(nextFile);
    addToast({
      type: "info",
      title: "PDF ready to upload",
      description: `${nextFile.name} (${formatFileSize(nextFile.size)})`,
    });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      addToast({
        type: "error",
        title: "No PDF selected",
        description: "Select or drag a PDF first.",
      });
      setNotice({ type: "error", message: "Select or drag a PDF first." });
      return;
    }

    setIsUploading(true);
    setNotice(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed.");
      }

      // setNotice({
      //   type: "success",
      //   message: `${data.name ?? file.name} was accepted and is being processed.`,
      // });
      addToast({
        type: "success",
        title: "Upload accepted",
        description: `${data.name ?? file.name} is being processed.`,
      });
      setFile(null);
      await loadDocuments();
    } catch (error) {
      addToast({
        type: "error",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Upload failed.",
      });
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleNotionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    addToast({
      type: "info",
      title: "Notion is not active yet",
      description: "The URL input exists, but Notion ingestion is still on hold.",
    });
    setNotice({
      type: "info",
      message:
        "The Notion URL input is prepared. Notion ingestion is still on hold based on the previous decision.",
    });
  }

  async function seedDemoDocuments() {
    setIsSeeding(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/seed-demo-documents", {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        seeded?: Array<{ name: string }>;
        skipped?: string[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to seed demo documents.");
      }

      const seededCount = data.seeded?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      const message = `${seededCount} documents created, ${skippedCount} skipped.`;

      // setNotice({
      //   type: "success",
      //   message: `Demo document seed started. ${message}`,
      // });
      addToast({
        type: "success",
        title: "Demo seed started",
        description: message,
      });
      await loadDocuments();
    } catch (error) {
      addToast({
        type: "error",
        title: "Seed failed",
        description:
          error instanceof Error ? error.message : "Failed to seed demo documents.",
      });
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to seed demo documents.",
      });
    } finally {
      setIsSeeding(false);
    }
  }

  async function deleteDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    const confirmed = window.confirm(
      `Delete "${document?.name ?? "document"}" and all of its chunks?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingDocumentId(documentId);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed.");
      }

      setDocuments((current) =>
        current.filter((document) => document.id !== documentId)
      );
      // setNotice({
      //   type: "success",
      //   message: "Document deleted. Chunks were deleted by cascade.",
      // });
      addToast({
        type: "success",
        title: "Document deleted",
        description: "Chunks were deleted by cascade.",
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Delete failed.",
      });
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Delete failed.",
      });
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <ToastViewport dismissToast={dismissToast} toasts={toasts} />
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenText className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">KnowledgeBot Admin</p>
              <p className="truncate text-xs text-muted-foreground">
                Document ingestion
              </p>
            </div>
          </Link>

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
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <form
            onSubmit={handleUpload}
            className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
          >
            <div className="mb-4">
              <h1 className="text-lg font-semibold">Upload PDF</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Drag and drop or select a PDF. Status will appear in the
                document list.
              </p>
            </div>

            <label
              htmlFor="admin-pdf-file"
              onDragEnter={(event) => handleDrag(event, setIsDragging)}
              onDragOver={(event) => handleDrag(event, setIsDragging)}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                selectFile(event.dataTransfer.files.item(0));
              }}
              className={cn(
                "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-background px-6 py-8 text-center transition-colors",
                isDragging
                  ? "border-primary bg-muted"
                  : "hover:border-primary/60 hover:bg-muted/50"
              )}
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted">
                {file ? (
                  <FileText
                    className="size-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <UploadCloud
                    className="size-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span className="text-sm font-medium">
                {file ? file.name : "Drop PDF here"}
              </span>
              <span className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                {file ? formatFileSize(file.size) : "PDF only, max 25MB"}
              </span>
            </label>
            <input
              id="admin-pdf-file"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                selectFile(event.target.files?.[0] ?? null)
              }
            />

            <div className="mt-4 flex gap-3">
              <Button
                type="submit"
                disabled={!file || isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UploadCloud className="size-4" aria-hidden="true" />
                )}
                {isUploading ? "Uploading" : "Upload"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!file || isUploading}
                onClick={() => selectFile(null)}
              >
                <X className="size-4" aria-hidden="true" />
                Clear
              </Button>
            </div>
          </form>

          {/* <form
            onSubmit={handleNotionSubmit}
            className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Notion URL</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Field prepared for TASK-23. The Notion pipeline is still on hold.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <LinkIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="url"
                value={notionUrl}
                onChange={(event) => setNotionUrl(event.target.value)}
                placeholder="https://www.notion.so/..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!notionUrl.trim()}
              className="mt-4 w-full"
            >
              Save Notion URL
            </Button>
          </form> */}

          {notice ? <Notice type={notice.type} message={notice.message} /> : null}

          <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Seed Demo</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Add the dummy SOP, HR, and IT procedure documents from{" "}
                <code>public/document</code>.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={seedDemoDocuments}
              disabled={isSeeding}
            >
              {isSeeding ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="size-4" aria-hidden="true" />
              )}
              {isSeeding ? "Seeding" : "Seed 3 demo documents"}
            </Button>
          </div>
        </div>

        <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Documents</h2>
              <p className="text-sm text-muted-foreground">
                Polling is active while any document is queued or processing.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={loadDocuments}
              disabled={isLoadingDocuments}
            >
              <RefreshCcw
                className={cn(
                  "size-4",
                  isLoadingDocuments && "animate-spin"
                )}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>

          <div className="divide-y">
            {isLoadingDocuments && documents.length === 0 ? (
              <>
                <DocumentSkeleton />
                <DocumentSkeleton />
                <DocumentSkeleton />
              </>
            ) : null}

            {documents.length === 0 && !isLoadingDocuments ? (
              <div className="px-5 py-12 text-center">
                <FileText
                  className="mx-auto mb-3 size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium">No documents yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload the first PDF to start ingestion.
                </p>
              </div>
            ) : null}

            {documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                isDeleting={deletingDocumentId === document.id}
                onDelete={() => deleteDocument(document.id)}
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function DocumentSkeleton() {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="size-4 rounded-sm bg-muted" />
        <div className="h-4 w-52 rounded-sm bg-muted" />
        <div className="h-5 w-20 rounded-sm bg-muted" />
      </div>
      <div className="mt-3 flex gap-3">
        <div className="h-3 w-16 rounded-sm bg-muted" />
        <div className="h-3 w-20 rounded-sm bg-muted" />
        <div className="h-3 w-28 rounded-sm bg-muted" />
      </div>
    </div>
  );
}

function DocumentRow({
  document,
  isDeleting,
  onDelete,
}: {
  document: KnowledgeDocument;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium">{document.name}</p>
          <StatusBadge status={document.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{document.source_type.toUpperCase()}</span>
          <span>{document.chunk_count} chunks</span>
          <span>{formatDate(document.created_at)}</span>
          {document.error_message ? (
            <span className="text-destructive">{document.error_message}</span>
          ) : null}
        </div>
      </div>

      <Button
        type="button"
        variant="destructive"
        onClick={onDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-4" aria-hidden="true" />
        )}
        Delete
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = {
    queued: {
      className: "border-border bg-muted text-muted-foreground",
      icon: Clock3,
      label: "Queued",
    },
    processing: {
      className: "border-border bg-muted text-muted-foreground",
      icon: Loader2,
      label: "Processing",
    },
    ready: {
      className: "border-border bg-muted text-foreground",
      icon: CheckCircle2,
      label: "Ready",
    },
    failed: {
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: XCircle,
      label: "Failed",
    },
  }[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      <Icon
        className={cn("size-3", status === "processing" && "animate-spin")}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

function Notice({
  message,
  type,
}: {
  message: string;
  type: "success" | "error" | "info";
}) {
  const Icon =
    type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : LinkIcon;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        type === "error"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "bg-card text-card-foreground"
      )}
    >
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="leading-6">{message}</p>
      </div>
    </div>
  );
}

function handleDrag(
  event: DragEvent<HTMLLabelElement>,
  setIsDragging: (value: boolean) => void
) {
  event.preventDefault();
  setIsDragging(true);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
