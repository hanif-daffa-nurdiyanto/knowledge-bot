# Day 2 Ingestion Pipeline

## Scope

- TASK-07: PDF parser + chunking, 500 tokens with 50 token overlap.
- TASK-08: Embedding pipeline to Supabase pgvector.
- TASK-09: `POST /api/ingest` async ingestion endpoint.
- TASK-10: Notion integration via Notion API.
- TASK-11: Test with a 50+ page document.

## Implemented Now

### TASK-07 PDF Parser + Chunking

Files:

- `lib/ingest/pdf.ts`
- `lib/ingest/chunk-text.ts`

Behavior:

- Reads PDF bytes with `pdf-parse`.
- Extracts text per page.
- Splits page text using `cl100k_base` token encoding.
- Uses `chunkSize = 500` and `overlap = 50`.
- Preserves `page_number`, `chunk_index`, and `token_count` for source attribution.

### TASK-08 Embedding Pipeline

Files:

- `lib/ai/embeddings.ts`
- `lib/ingest/pipeline.ts`

Behavior:

- Uses provider from `EMBEDDING_PROVIDER`.
- Dev default: Ollama `nomic-embed-text`.
- Production option: OpenAI `text-embedding-3-small`.
- Calls Ollama `POST /api/embed`.
- Stores embeddings in `public.chunks.embedding` as `vector(768)`.
- Updates `documents.status` from `processing` to `ready`.
- Marks document as `failed` and stores `error_message` when parsing, embedding, or insert fails.

Required local setup:

```bash
ollama pull nomic-embed-text
ollama serve
```

Required env:

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIMENSIONS=768
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
```

Important: the current Supabase schema is `vector(768)` for Ollama. If `EMBEDDING_PROVIDER=openai`, use a Supabase database/migration with `vector(1536)` and re-ingest documents.

### TASK-09 API Route

File:

- `app/api/ingest/route.ts`

Endpoint:

```http
POST /api/ingest
Content-Type: multipart/form-data
```

Field:

- `file`: PDF file, max 25MB.

Response:

```json
{
  "document_id": "...",
  "name": "handbook.pdf",
  "status": "processing"
}
```

The endpoint creates the `documents` row immediately and schedules PDF processing with Next.js `after()`, so the request returns `202 Accepted` before embedding is complete.

Example:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -F "file=@/path/to/document.pdf"
```

This route requires an authenticated NextAuth session.

## TASK-10 Notion Integration Plan

Required env:

- `NOTION_API_KEY`

Planned behavior:

- Accept `notion_url` in `/api/ingest`.
- Validate authenticated user.
- Fetch page/block content with Notion API.
- Normalize text blocks into page-like sections.
- Reuse the same chunking, embedding, and Supabase insert pipeline.

Recommended package:

```bash
bun add @notionhq/client
```

## TASK-11 50+ Page Test Plan

Use a PDF with at least 50 pages and verify:

- `documents.status` becomes `ready`.
- `documents.metadata.page_count >= 50`.
- `documents.metadata.chunk_count > 0`.
- `chunks` rows contain `page_number`, `chunk_index`, `token_count`, `content`, and `embedding`.
- Similarity RPC returns source chunks:

```sql
select *
from public.match_document_chunks(
  '<768-dim-query-vector>'::extensions.vector,
  5,
  0.75
);
```

## Required Before Testing

- Supabase migration from Day 1 has been applied.
- `.env.local` includes:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OLLAMA_BASE_URL`
  - `OLLAMA_EMBEDDING_MODEL`
  - `OLLAMA_EMBEDDING_DIMENSIONS`
  - `OPENAI_API_KEY` if `EMBEDDING_PROVIDER=openai`
  - NextAuth Google env values
- Ollama is running locally and `nomic-embed-text` has been pulled.
- User is logged in before calling `/api/ingest`.

## Security Note

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_SECRET`, or `NEXTAUTH_SECRET` in client code or public docs. If any of these secrets were shared outside your local machine, rotate them.
