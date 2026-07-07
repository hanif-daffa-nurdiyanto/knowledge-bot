import {
  claimIngestionJobs,
  markIngestionJobFailed,
  markIngestionJobSucceeded,
} from "@/lib/ingest/jobs";
import { processPdfDocumentFromStorage } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_JOB_LIMIT = 1;
const MAX_JOB_LIMIT = 3;

type JobResult = {
  job_id: string;
  document_id: string;
  status: "succeeded" | "retrying" | "failed";
  error?: string;
};

export async function POST(request: Request) {
  const workerSecret = process.env.INGEST_WORKER_SECRET;

  if (!workerSecret) {
    return Response.json(
      { error: "Missing INGEST_WORKER_SECRET." },
      { status: 500 }
    );
  }

  if (!isAuthorized(request, workerSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `next-worker-${crypto.randomUUID()}`;
  const jobLimit = getJobLimit(request);
  const jobs = await claimIngestionJobs(workerId, jobLimit);
  const results: JobResult[] = [];

  for (const job of jobs) {
    try {
      await processPdfDocumentFromStorage(job);
      await markIngestionJobSucceeded(job.id);
      results.push({
        job_id: job.id,
        document_id: job.document_id,
        status: "succeeded",
      });
    } catch (error) {
      await markIngestionJobFailed(job, error);
      results.push({
        job_id: job.id,
        document_id: job.document_id,
        status: job.attempts < job.max_attempts ? "retrying" : "failed",
        error:
          error instanceof Error ? error.message : "Unknown ingestion error.",
      });
    }
  }

  return Response.json({
    worker_id: workerId,
    claimed: jobs.length,
    results,
  });
}

function isAuthorized(request: Request, workerSecret: string) {
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${workerSecret}`;
}

function getJobLimit(request: Request) {
  const url = new URL(request.url);
  const configuredLimit = Number(url.searchParams.get("limit"));

  if (!Number.isInteger(configuredLimit) || configuredLimit <= 0) {
    return DEFAULT_JOB_LIMIT;
  }

  return Math.min(configuredLimit, MAX_JOB_LIMIT);
}
