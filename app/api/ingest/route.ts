import { after } from "next/server";

import { requireAdminApiSession } from "@/lib/auth/admin";
import { processPdfDocument } from "@/lib/ingest/pipeline";
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
      status: "processing",
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

  after(async () => {
    try {
      await processPdfDocument({
        documentId: document.id,
        fileName: file.name,
        fileBuffer,
      });
    } catch (error) {
      console.error("PDF ingestion failed", error);
    }
  });

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
