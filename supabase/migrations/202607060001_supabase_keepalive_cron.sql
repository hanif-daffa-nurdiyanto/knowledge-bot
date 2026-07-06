-- Keep the Supabase project active by touching a tiny heartbeat row every 5 days.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.supabase_keepalive (
  id boolean primary key default true check (id),
  last_ping_at timestamptz not null default now(),
  ping_count bigint not null default 0
);

insert into public.supabase_keepalive (id)
values (true)
on conflict (id) do nothing;

alter table public.supabase_keepalive enable row level security;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'supabase-keepalive-every-5-days'
  ) then
    perform cron.unschedule('supabase-keepalive-every-5-days');
  end if;
end;
$$;

select cron.schedule(
  'supabase-keepalive-every-5-days',
  '0 0 */5 * *',
  $$
    update public.supabase_keepalive
    set
      last_ping_at = now(),
      ping_count = ping_count + 1
    where id = true;
  $$
);
