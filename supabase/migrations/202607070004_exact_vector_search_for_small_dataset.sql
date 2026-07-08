-- Use exact vector search while the knowledge base is small.
-- ivfflat with many lists can return no candidates when the table has very few rows.

drop index if exists public.chunks_embedding_cosine_idx;

drop function if exists public.match_document_chunks(extensions.vector, integer, double precision);
drop function if exists public.match_document_chunks(extensions.vector, integer, double precision, uuid);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1024),
  match_count integer default 5,
  match_threshold double precision default 0.75,
  document_id_filter uuid default null
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
    and (document_id_filter is null or d.id = document_id_filter)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by 1 - (c.embedding <=> query_embedding) desc
  limit match_count;
$$;

grant execute on function public.match_document_chunks(extensions.vector, integer, double precision, uuid) to authenticated;
grant execute on function public.match_document_chunks(extensions.vector, integer, double precision, uuid) to service_role;

notify pgrst, 'reload schema';
