-- Day 1 foundation: Supabase schema for Internal Knowledge Base Bot.
-- Embeddings use Ollama nomic-embed-text, which returns 768 dimensions.

create schema if not exists extensions;

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('pdf', 'notion')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  uploaded_by uuid references public.users(id) on delete set null,
  source_url text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chunks (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding extensions.vector(768),
  page_number integer,
  chunk_index integer not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists documents_status_idx on public.documents (status);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);
create index if not exists chunks_document_id_idx on public.chunks (document_id);
create index if not exists chunks_document_chunk_index_idx on public.chunks (document_id, chunk_index);

create index if not exists chunks_embedding_cosine_idx
  on public.chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_count integer default 5,
  match_threshold double precision default 0.75
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  content text,
  page_number integer,
  chunk_index integer,
  similarity double precision,
  metadata jsonb
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    d.name as document_name,
    c.content,
    c.page_number,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity,
    jsonb_build_object(
      'document', d.metadata,
      'chunk', c.metadata,
      'source_type', d.source_type,
      'source_url', d.source_url,
      'storage_path', d.storage_path
    ) as metadata
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where
    c.embedding is not null
    and d.status = 'ready'
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_document_chunks(extensions.vector, integer, double precision) to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;

drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
  on public.users
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Admins can read all users" on public.users;
create policy "Admins can read all users"
  on public.users
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can read ready documents" on public.documents;
create policy "Authenticated users can read ready documents"
  on public.documents
  for select
  to authenticated
  using (status = 'ready');

drop policy if exists "Admins can manage documents" on public.documents;
create policy "Admins can manage documents"
  on public.documents
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated users can read chunks from ready documents" on public.chunks;
create policy "Authenticated users can read chunks from ready documents"
  on public.chunks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = chunks.document_id
        and d.status = 'ready'
    )
  );

drop policy if exists "Admins can manage chunks" on public.chunks;
create policy "Admins can manage chunks"
  on public.chunks
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
