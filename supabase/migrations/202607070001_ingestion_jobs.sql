-- Durable ingestion jobs for production PDF processing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-uploads',
  'document-uploads',
  false,
  26214400,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
  check (status in ('queued', 'processing', 'ready', 'failed'));

create table if not exists public.ingestion_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  source_type text not null default 'pdf'
    check (source_type in ('pdf')),
  storage_bucket text not null default 'document-uploads',
  storage_path text not null,
  file_name text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingestion_jobs_pending_idx
  on public.ingestion_jobs (status, run_after, created_at);

create index if not exists ingestion_jobs_document_id_idx
  on public.ingestion_jobs (document_id);

drop trigger if exists set_ingestion_jobs_updated_at on public.ingestion_jobs;
create trigger set_ingestion_jobs_updated_at
  before update on public.ingestion_jobs
  for each row
  execute function public.set_updated_at();

alter table public.ingestion_jobs enable row level security;

create or replace function public.claim_ingestion_jobs(
  worker_id text,
  job_limit integer default 1
)
returns setof public.ingestion_jobs
language sql
set search_path = public
as $$
  with candidates as (
    select id
    from public.ingestion_jobs
    where
      attempts < max_attempts
      and run_after <= now()
      and (
        status = 'queued'
        or (
          status = 'running'
          and locked_at < now() - interval '15 minutes'
        )
      )
    order by created_at
    limit greatest(job_limit, 1)
    for update skip locked
  )
  update public.ingestion_jobs jobs
  set
    status = 'running',
    locked_at = now(),
    locked_by = worker_id,
    attempts = attempts + 1,
    last_error = null,
    updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
$$;

revoke all on function public.claim_ingestion_jobs(text, integer) from public;
grant execute on function public.claim_ingestion_jobs(text, integer) to service_role;
