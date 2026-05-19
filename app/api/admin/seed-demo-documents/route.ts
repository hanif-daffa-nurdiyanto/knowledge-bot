import { readFile } from "node:fs/promises";
import path from "node:path";

import { after } from "next/server";

import { requireAdminApiSession } from "@/lib/auth/admin";
import { processPdfDocument } from "@/lib/ingest/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const demoDocuments = [
  {
    fileName: "SOP_Operasional_Harian_Dummy.pdf",
    title: "SOP Operasional Harian Dummy",
  },
  {
    fileName: "Dokumen_HR_Dummy.pdf",
    title: "Dokumen HR Dummy",
  },
  {
    fileName: "Prosedur_IT_Perusahaan_Dummy.pdf",
    title: "Prosedur IT Perusahaan Dummy",
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
        status: "processing",
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

    seeded.push(document);

    after(async () => {
      try {
        await processPdfDocument({
          documentId: document.id,
          fileName: demoDocument.fileName,
          fileBuffer,
        });
      } catch (error) {
        console.error("Demo document seed failed", error);
      }
    });
  }

  return Response.json(
    {
      seeded,
      skipped,
    },
    { status: 202 }
  );
}
