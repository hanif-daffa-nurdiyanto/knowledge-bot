import Link from "next/link";
import { ArrowLeft, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TestUploadForm } from "./test-upload-form";

export default function TestUploadPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <UploadCloud className="size-4 text-muted-foreground" aria-hidden="true" />
            Test upload
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-4xl gap-8 px-6 py-12 md:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Ingest pipeline
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Upload PDF untuk test chunking dan embedding
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            File akan dikirim ke <code>/api/ingest</code>. Response awal hanya
            mengembalikan status <code>processing</code>; proses parse,
            chunking, embedding, dan insert berjalan async.
          </p>
        </div>

        <TestUploadForm />
      </section>
    </main>
  );
}
