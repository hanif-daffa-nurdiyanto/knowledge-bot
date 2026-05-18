"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type UploadResult = {
  document_id?: string;
  name?: string;
  status?: string;
  error?: string;
};

export function TestUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const fileSummary = useMemo(() => {
    if (!file) {
      return "PDF only, max 25MB";
    }

    return `${file.name} - ${formatFileSize(file.size)}`;
  }, [file]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setResult({ error: "Pilih file PDF terlebih dahulu." });
      return;
    }

    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as UploadResult;

      if (!response.ok) {
        setResult({ error: data.error ?? "Upload gagal." });
        return;
      }

      setResult(data);
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Upload gagal.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
    >
      <label
        htmlFor="pdf-file"
        className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-background px-6 py-8 text-center transition-colors hover:bg-muted/50"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted">
          {file ? (
            <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <span className="text-sm font-medium">
          {file ? "File selected" : "Choose PDF file"}
        </span>
        <span className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          {fileSummary}
        </span>
      </label>

      <input
        id="pdf-file"
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setResult(null);
        }}
      />

      <div className="mt-5 flex gap-3">
        <Button type="submit" disabled={!file || isUploading} className="flex-1">
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-4" aria-hidden="true" />
          )}
          {isUploading ? "Uploading" : "Upload PDF"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isUploading || !file}
          onClick={() => {
            setFile(null);
            setResult(null);
          }}
        >
          Clear
        </Button>
      </div>

      {result ? (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm ${
            result.error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-muted text-foreground"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.error ? (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                {result.error ? "Upload failed" : "Upload accepted"}
              </p>
              {result.error ? (
                <p className="mt-1 leading-6">{result.error}</p>
              ) : (
                <dl className="mt-2 grid gap-1 text-muted-foreground">
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <dt>Name</dt>
                    <dd className="truncate">{result.name}</dd>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <dt>Status</dt>
                    <dd>{result.status}</dd>
                  </div>
                  <div className="grid grid-cols-[88px_1fr] gap-2">
                    <dt>Document ID</dt>
                    <dd className="break-all">{result.document_id}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
