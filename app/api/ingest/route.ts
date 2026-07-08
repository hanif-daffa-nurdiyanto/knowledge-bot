import { after } from "next/server";

import { requireAdminApiSession } from "@/lib/auth/admin";
import { createIngestionJob } from "@/lib/ingest/jobs";
import { deleteDocumentFile, uploadDocumentFile } from "@/lib/ingest/storage";
import { triggerIngestionWorker } from "@/lib/ingest/worker-trigger";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const { session, response } = await requireAdminApiSession();

  if (response) {
    return response;
  }

  const uploadedByEmail = session.user?.email;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { error: 'Expected multipart form-data with a "file" field.' },
      { status: 400 }
    );
  }

  if (!isPdf(file)) {
    return Response.json(
      { error: "Only PDF files are supported for this endpoint." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: "PDF is too large. Maximum size is 25MB." },
      { status: 413 }
    );
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const supabase = createAdminClient();

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      name: file.name,
      source_type: "pdf",
      status: "queued",
      metadata: {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || "application/pdf",
        uploaded_by_email: uploadedByEmail,
      },
    })
    .select("id, name, status")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let uploadedFile:
    | { storageBucket: string; storagePath: string }
    | null = null;

  try {
    const { storageBucket, storagePath } = await uploadDocumentFile({
      documentId: document.id,
      fileName: file.name,
      fileBuffer,
      contentType: file.type || "application/pdf",
    });
    uploadedFile = { storageBucket, storagePath };

    const { error: documentUpdateError } = await supabase
      .from("documents")
      .update({ storage_path: storagePath })
      .eq("id", document.id);

    if (documentUpdateError) {
      throw documentUpdateError;
    }

    await createIngestionJob({
      documentId: document.id,
      storageBucket,
      storagePath,
      fileName: file.name,
    });

    const origin = new URL(request.url).origin;
    after(() => triggerIngestionWorker({ origin, limit: 1 }));
  } catch (error) {
    if (uploadedFile) {
      await deleteDocumentFile(
        uploadedFile.storageBucket,
        uploadedFile.storagePath
      ).catch((deleteError) => {
        console.error("Failed to clean up queued upload", deleteError);
      });
    }

    await supabase.from("documents").delete().eq("id", document.id);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to queue PDF ingestion.",
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      document_id: document.id,
      name: document.name,
      status: document.status,
    },
    { status: 202 }
  );
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
