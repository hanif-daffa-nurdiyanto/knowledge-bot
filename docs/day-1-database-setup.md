# Day 1 Database Setup

## What This Adds

- Enables `pgvector` for Supabase vector search.
- Creates `users`, `documents`, and `chunks`.
- Stores `text-embedding-3-small` embeddings as `vector(1536)`.
- Adds cosine IVFFlat index for similarity search.
- Adds `match_document_chunks()` RPC for RAG retrieval.
- Enables basic RLS policies for authenticated users and admins.

## How To Apply

Run the SQL in:

```text
supabase/migrations/202605180001_init_knowledge_base.sql
```

Recommended options:

```bash
supabase db push
```

Or paste the migration into the Supabase SQL Editor and run it once.

## Required From You

Provide these before continuing to the next tasks:

- Supabase project URL: `NEXT_PUBLIC_SUPABASE_URL`
- Supabase publishable anon key: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Supabase service role key: `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI API key for embeddings: `OPENAI_API_KEY`
- Anthropic API key for Claude responses: `ANTHROPIC_API_KEY`
- Google OAuth client ID and secret: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Allowed company email domain, for example `company.com`: `ALLOWED_EMAIL_DOMAIN`
- App URL for auth callbacks: `NEXTAUTH_URL`
- Random auth secret: `NEXTAUTH_SECRET`

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or OAuth secrets to client components.

## First Admin User

After the first login exists in Supabase Auth, insert or update the matching profile:

```sql
insert into public.users (auth_user_id, email, name, role)
values ('<auth.users.id>', '<your-email>', '<your-name>', 'admin')
on conflict (email)
do update set
  auth_user_id = excluded.auth_user_id,
  name = excluded.name,
  role = 'admin';
```

## Notes

- `documents.status` supports `processing`, `ready`, and `failed`.
- `documents.source_type` supports `pdf` and `notion`.
- `chunks.embedding` is nullable so chunks can be created before embeddings finish.
- The retrieval threshold defaults to `0.75`, matching the PRD no-answer rule.
