-- Supabase Cron trigger for the external Next.js ingestion worker.
-- Configure the URL and secret with private.configure_ingestion_worker_cron().

create schema if not exists private;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists private.ingestion_worker_cron_config (
  id boolean primary key default true check (id),
  worker_url text not null,
  worker_secret text not null,
  schedule text not null default '*/5 * * * *',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function private.run_ingestion_worker()
returns void
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  config private.ingestion_worker_cron_config;
begin
  select *
  into config
  from private.ingestion_worker_cron_config
  where id = true
    and enabled = true;

  if not found then
    return;
  end if;

  perform net.http_post(
    url := config.worker_url,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || config.worker_secret,
      'Content-Type',
      'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

create or replace function private.configure_ingestion_worker_cron(
  worker_url text,
  worker_secret text,
  schedule text default '*/5 * * * *',
  enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if worker_url is null or worker_url !~ '^https?://' then
    raise exception 'worker_url must be an absolute http(s) URL';
  end if;

  if worker_secret is null or length(worker_secret) < 16 then
    raise exception 'worker_secret must be at least 16 characters';
  end if;

  insert into private.ingestion_worker_cron_config (
    id,
    worker_url,
    worker_secret,
    schedule,
    enabled
  )
  values (
    true,
    configure_ingestion_worker_cron.worker_url,
    configure_ingestion_worker_cron.worker_secret,
    configure_ingestion_worker_cron.schedule,
    configure_ingestion_worker_cron.enabled
  )
  on conflict (id) do update
  set
    worker_url = excluded.worker_url,
    worker_secret = excluded.worker_secret,
    schedule = excluded.schedule,
    enabled = excluded.enabled,
    updated_at = now();

  if exists (
    select 1
    from cron.job
    where jobname = 'ingestion-worker-every-5-minutes'
  ) then
    perform cron.unschedule('ingestion-worker-every-5-minutes');
  end if;

  if enabled then
    perform cron.schedule(
      'ingestion-worker-every-5-minutes',
      schedule,
      $job$select private.run_ingestion_worker();$job$
    );
  end if;
end;
$$;

revoke all on schema private from public;
revoke all on table private.ingestion_worker_cron_config from public;
revoke all on function private.run_ingestion_worker() from public;
revoke all on function private.configure_ingestion_worker_cron(text, text, text, boolean) from public;
