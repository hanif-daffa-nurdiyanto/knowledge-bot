-- Paste this in Supabase SQL Editor only when switching embeddings to
-- NVIDIA NIM `nvidia/nv-embedqa-e5-v5` (1024 dimensions).
--
-- This clears existing chunks because old 768-dimensional Ollama embeddings
-- cannot be searched with 1024-dimensional NVIDIA embeddings.

drop index if exists public.chunks_embedding_cosine_idx;
drop function if exists public.match_document_chunks(extensions.vector, integer, double precision);

truncate table public.chunks;

alter table public.chunks
  alter column embedding type extensions.vector(1024)
  using null;

update public.documents
set
  status = 'processing',
  error_message = 'Re-ingest required after switching embedding dimensions to NVIDIA NIM 1024.',
  metadata = metadata || jsonb_build_object(
    'embedding_provider', 'nvidia',
    'embedding_model', 'nvidia/nv-embedqa-e5-v5',
    'embedding_dimensions', 1024,
    'reingest_required', true
  );

create index if not exists chunks_embedding_cosine_idx
  on public.chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1024),
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
