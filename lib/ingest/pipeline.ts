import "server-only";

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_PROVIDER,
  EMBEDDING_MODEL,
  embedTexts,
} from "@/lib/ai/embeddings";
import { chunkTextPages } from "@/lib/ingest/chunk-text";
import type { IngestionJob } from "@/lib/ingest/jobs";
import { parsePdfToPages } from "@/lib/ingest/pdf";
import { downloadDocumentFile } from "@/lib/ingest/storage";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK_SIZE = 180;
const CHUNK_OVERLAP = 40;
const INSERT_BATCH_SIZE = 100;

type ProcessPdfDocumentInput = {
  documentId: string;
  fileName: string;
  fileBuffer: Buffer;
  markFailedOnError?: boolean;
};

export async function processPdfDocument({
  documentId,
  fileName,
  fileBuffer,
  markFailedOnError = true,
}: ProcessPdfDocumentInput) {
  const supabase = createAdminClient();

  try {
    await updateDocumentStatus(documentId, "processing");

    const pages = await parsePdfToPages(fileBuffer);
    const chunks = chunkTextPages(pages, {
      chunkSize: CHUNK_SIZE,
      overlap: CHUNK_OVERLAP,
    });

    if (chunks.length === 0) {
      throw new Error("PDF does not contain extractable text.");
    }

    const embeddings = await embedTexts(
      chunks.map((chunk) => chunk.content),
      32,
      "passage"
    );

    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count does not match chunk count.");
    }

    await supabase.from("chunks").delete().eq("document_id", documentId);

    for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(start, start + INSERT_BATCH_SIZE);

      const rows = batch.map((chunk, batchIndex) => {
        const embedding = embeddings[start + batchIndex];

        return {
          document_id: documentId,
          content: chunk.content,
          embedding: formatVector(embedding),
          page_number: chunk.pageNumber,
          chunk_index: chunk.chunkIndex,
          token_count: chunk.tokenCount,
          metadata: {
            file_name: fileName,
            embedding_provider: EMBEDDING_PROVIDER,
            embedding_model: EMBEDDING_MODEL,
            embedding_dimensions: EMBEDDING_DIMENSIONS,
          },
        };
      });

      const { error } = await supabase.from("chunks").insert(rows);

      if (error) {
        throw error;
      }
    }

    const { error } = await supabase
      .from("documents")
      .update({
        status: "ready",
        error_message: null,
        metadata: {
          file_name: fileName,
          page_count: pages.length,
          chunk_count: chunks.length,
          chunk_size: CHUNK_SIZE,
          chunk_overlap: CHUNK_OVERLAP,
          embedding_provider: EMBEDDING_PROVIDER,
          embedding_model: EMBEDDING_MODEL,
          embedding_dimensions: EMBEDDING_DIMENSIONS,
        },
      })
      .eq("id", documentId);

    if (error) {
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error.";

    if (markFailedOnError) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message: message,
          metadata: {
            file_name: fileName,
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", documentId);
    }

    throw error;
  }
}

export async function processPdfDocumentFromStorage(job: IngestionJob) {
  const fileBuffer = await downloadDocumentFile(
    job.storage_bucket,
    job.storage_path
  );

  await processPdfDocument({
    documentId: job.document_id,
    fileName: job.file_name,
    fileBuffer,
    markFailedOnError: false,
  });
}

async function updateDocumentStatus(
  documentId: string,
  status: "processing" | "ready" | "failed"
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("documents")
    .update({ status })
    .eq("id", documentId);

  if (error) {
    throw error;
  }
}

function formatVector(values: number[]) {
  return `[${values.join(",")}]`;
}
