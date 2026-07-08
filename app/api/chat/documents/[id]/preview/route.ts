import { auth } from "@/auth";
import {
  createDocumentSignedUrl,
  DOCUMENT_UPLOADS_BUCKET,
} from "@/lib/ingest/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type DocumentMetadata = {
  file_name?: unknown;
  seed?: unknown;
};

type PreviewChunk = {
  chunk_index: number;
  page_number: number | null;
  content: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: documentId } = await context.params;
  const { searchParams } = new URL(request.url);
  const chunkIndex = Number(searchParams.get("chunkIndex"));

  if (!documentId) {
    return Response.json({ error: "Missing document id." }, { status: 400 });
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return Response.json({ error: "Missing chunk index." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, name, source_type, source_url, storage_path, metadata, status")
    .eq("id", documentId)
    .eq("status", "ready")
    .single();

  if (documentError || !document) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const { data: chunk, error: chunkError } = await supabase
    .from("chunks")
    .select("chunk_index, page_number, content")
    .eq("document_id", documentId)
    .eq("chunk_index", chunkIndex)
    .single();

  if (chunkError || !chunk) {
    return Response.json({ error: "Chunk not found." }, { status: 404 });
  }

  const { data: nearbyChunks, error: nearbyError } = await supabase
    .from("chunks")
    .select("chunk_index, page_number, content")
    .eq("document_id", documentId)
    .gte("chunk_index", Math.max(0, chunkIndex - 1))
    .lte("chunk_index", chunkIndex + 1)
    .order("chunk_index", { ascending: true });

  if (nearbyError) {
    return Response.json({ error: nearbyError.message }, { status: 500 });
  }

  const metadata = (document.metadata ?? {}) as DocumentMetadata;
  const previewUrl = await buildPreviewUrl({
    storagePath: document.storage_path,
    sourceUrl: document.source_url,
    metadata,
    pageNumber: chunk.page_number,
  });

  return Response.json({
    document: {
      id: document.id,
      name: document.name,
      source_type: document.source_type,
      source_url: document.source_url,
      storage_path: document.storage_path,
      metadata: document.metadata,
      preview_url: previewUrl,
    },
    selected_chunk: chunk,
    nearby_chunks: (nearbyChunks ?? []) as PreviewChunk[],
  });
}

async function buildPreviewUrl({
  storagePath,
  sourceUrl,
  metadata,
  pageNumber,
}: {
  storagePath: string | null;
  sourceUrl: string | null;
  metadata: DocumentMetadata;
  pageNumber: number | null;
}) {
  const hash = pageNumber ? `#page=${pageNumber}` : "";

  if (storagePath) {
    try {
      const signedUrl = await createDocumentSignedUrl(
        DOCUMENT_UPLOADS_BUCKET,
        storagePath
      );

      return `${signedUrl}${hash}`;
    } catch (error) {
      console.error("Failed to create signed document preview URL", error);
    }
  }

  if (sourceUrl && isPreviewableUrl(sourceUrl)) {
    return `${sourceUrl}${hash}`;
  }

  if (metadata.seed === true && typeof metadata.file_name === "string") {
    return `/document/${encodeURIComponent(metadata.file_name)}${hash}`;
  }

  return null;
}

function isPreviewableUrl(value: string) {
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://");
}
