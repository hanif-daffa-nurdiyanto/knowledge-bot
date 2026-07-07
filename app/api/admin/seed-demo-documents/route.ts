import { readFile } from "node:fs/promises";
import path from "node:path";

import { requireAdminApiSession } from "@/lib/auth/admin";
import { createIngestionJob } from "@/lib/ingest/jobs";
import { deleteDocumentFile, uploadDocumentFile } from "@/lib/ingest/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const demoDocuments = [
  {
    fileName: "SOP_Operasional_Harian.pdf",
    title: "SOP Operasional Harian",
  },
  {
    fileName: "Dokumen_HR.pdf",
    title: "HR Document",
  },
  {
    fileName: "Prosedur_IT_Perusahaan.pdf",
    title: "Prosedur IT Perusahaan",
  },
];

export async function POST() {
  const { session, response } = await requireAdminApiSession();

  if (response) {
    return response;
  }

  const supabase = createAdminClient();
  const seeded: Array<{ id: string; name: string; status: string }> = [];
  const skipped: string[] = [];

  for (const demoDocument of demoDocuments) {
    const { data: existing, error: existingError } = await supabase
      .from("documents")
      .select("id")
      .in("name", [demoDocument.title, demoDocument.fileName])
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      skipped.push(demoDocument.title);
      continue;
    }

    const filePath = path.join(
      process.cwd(),
      "public",
      "document",
      demoDocument.fileName
    );
    let fileBuffer: Buffer;

    try {
      fileBuffer = await readFile(filePath);
    } catch {
      return Response.json(
        { error: `Demo PDF not found: ${demoDocument.fileName}` },
        { status: 500 }
      );
    }

    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        name: demoDocument.title,
        source_type: "pdf",
        status: "queued",
        metadata: {
          file_name: demoDocument.fileName,
          seed: true,
          uploaded_by_email: session.user?.email,
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
        fileName: demoDocument.fileName,
        fileBuffer,
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
        fileName: demoDocument.fileName,
      });

      seeded.push(document);
    } catch (error) {
      if (uploadedFile) {
        await deleteDocumentFile(
          uploadedFile.storageBucket,
          uploadedFile.storagePath
        ).catch((deleteError) => {
          console.error("Failed to clean up queued demo upload", deleteError);
        });
      }

      await supabase.from("documents").delete().eq("id", document.id);

      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : `Failed to queue demo document: ${demoDocument.fileName}`,
        },
        { status: 500 }
      );
    }
  }

  return Response.json(
    {
      seeded,
      skipped,
    },
    { status: 202 }
  );
}
