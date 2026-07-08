import "server-only";

type TriggerIngestionWorkerInput = {
  origin: string;
  limit?: number;
};

export async function triggerIngestionWorker({
  origin,
  limit,
}: TriggerIngestionWorkerInput) {
  const workerSecret = process.env.INGEST_WORKER_SECRET;

  if (!workerSecret) {
    console.error("Skipping ingestion worker trigger: missing INGEST_WORKER_SECRET.");
    return;
  }

  const url = new URL("/api/admin/ingest-jobs/run", origin);

  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
      },
    });

    if (!response.ok) {
      console.error(
        `Ingestion worker trigger failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.error("Ingestion worker trigger failed", error);
  }
}
