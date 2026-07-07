import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type IngestionJob = {
  id: string;
  document_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  source_type: "pdf";
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
};

type CreateIngestionJobInput = {
  documentId: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
};

export async function createIngestionJob({
  documentId,
  storageBucket,
  storagePath,
  fileName,
}: CreateIngestionJobInput) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingestion_jobs")
    .insert({
      document_id: documentId,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      file_name: fileName,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as IngestionJob;
}

export async function claimIngestionJobs(workerId: string, jobLimit: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_ingestion_jobs", {
    worker_id: workerId,
    job_limit: jobLimit,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as IngestionJob[];
}

export async function markIngestionJobSucceeded(jobId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ingestion_jobs")
    .update({
      status: "succeeded",
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq("id", jobId);

  if (error) {
    throw error;
  }
}

export async function markIngestionJobFailed(job: IngestionJob, error: unknown) {
  const supabase = createAdminClient();
  const message = error instanceof Error ? error.message : "Unknown ingestion error.";
  const hasAttemptsLeft = job.attempts < job.max_attempts;

  const { error: jobError } = await supabase
    .from("ingestion_jobs")
    .update({
      status: hasAttemptsLeft ? "queued" : "failed",
      locked_at: null,
      locked_by: null,
      last_error: message,
      run_after: hasAttemptsLeft
        ? new Date(Date.now() + getRetryDelayMs(job.attempts)).toISOString()
        : new Date().toISOString(),
    })
    .eq("id", job.id);

  if (jobError) {
    throw jobError;
  }

  if (hasAttemptsLeft) {
    const { error: documentError } = await supabase
      .from("documents")
      .update({
        status: "queued",
        error_message: message,
      })
      .eq("id", job.document_id);

    if (documentError) {
      throw documentError;
    }
  }

  if (!hasAttemptsLeft) {
    const { error: documentError } = await supabase
      .from("documents")
      .update({
        status: "failed",
        error_message: message,
        metadata: {
          failed_at: new Date().toISOString(),
          failed_job_id: job.id,
          file_name: job.file_name,
        },
      })
      .eq("id", job.document_id);

    if (documentError) {
      throw documentError;
    }
  }
}

function getRetryDelayMs(attempts: number) {
  return Math.min(5 * 60 * 1000 * Math.max(attempts, 1), 30 * 60 * 1000);
}
