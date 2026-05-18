-- Run this in Supabase SQL Editor if ingestion fails with:
-- "expected 1536 dimensions, not 768"
--
-- This switches the live database to Ollama nomic-embed-text embeddings.
-- Existing chunk embeddings are deleted because 1536-dim OpenAI vectors
-- cannot be reused as 768-dim Ollama vectors.

drop function if exists public.match_document_chunks(extensions.vector, integer, double precision);
drop function if exists public.match_document_chunks(extensions.vector(1536), integer, double precision);
drop function if exists public.match_document_chunks(extensions.vector(768), integer, double precision);

drop index if exists public.chunks_embedding_cosine_idx;

delete from public.chunks;

update public.documents
set
  status = 'processing',
  error_message = 'Re-ingest required after switching embedding model to Ollama nomic-embed-text.',
  metadata = metadata || jsonb_build_object(
    'embedding_provider', 'ollama',
    'embedding_model', 'nomic-embed-text',
    'embedding_dimensions', 768,
    'requires_reingest', true
  )
where status = 'ready';

alter table public.chunks
  alter column embedding type extensions.vector(768);

create index if not exists chunks_embedding_cosine_idx
  on public.chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

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

select
  table_name,
  column_name,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chunks'
  and column_name = 'embedding';
