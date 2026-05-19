# Day 3 RAG Core + Chat API

## Scope

- TASK-12: Supabase RPC function for similarity search.
- TASK-13: Chat API route with streaming using Vercel AI SDK.
- TASK-14: Source attribution in response.
- TASK-15: No-result handling when threshold is below `0.75`.
- TASK-16: RAG accuracy test with 10+ questions.

Notion integration remains on hold.

## Implemented

### TASK-12 Similarity Search

The RPC function is `public.match_document_chunks`.

Current dev schema expects Ollama `nomic-embed-text` vectors:

```sql
query_embedding extensions.vector(768)
```

The app wrapper is:

```text
lib/rag/search.ts
```

It embeds the user query, calls `match_document_chunks`, and returns the top matching chunks with metadata.

### TASK-13 Streaming Chat API

Endpoint:

```http
POST /api/chat
Content-Type: application/json
```

Body options:

```json
{
  "message": "Berapa cuti tahunan?"
}
```

or:

```json
{
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "Berapa cuti tahunan?" }]
    }
  ]
}
```

The route uses Vercel AI SDK `streamText()` and returns a text stream.

Files:

- `app/api/chat/route.ts`
- `lib/ai/chat-model.ts`
- `lib/rag/search.ts`
- `lib/rag/prompt.ts`

### TASK-14 Source Attribution

Retrieved chunks are injected into the prompt as labeled sources:

```text
[S1] Handbook.pdf, page 3, chunk 8
[S2] SOP.pdf, page 1, chunk 2
```

The model is instructed to cite relevant sentences with `[S1]`, `[S2]`, and end with a `Sources:` section.

The response also includes headers:

- `x-rag-source-count`
- `x-rag-threshold`
- `x-rag-chat-provider`
- `x-rag-chat-model`

### TASK-15 No-Result Handling

Default threshold:

```text
0.75
```

If no chunks meet the threshold, the API does not call the LLM. It streams a fixed no-answer response:

```text
Saya tidak menemukan informasi yang cukup di knowledge base untuk menjawab pertanyaan itu.

Silakan hubungi HR/IT atau upload dokumen yang relevan ke knowledge base.
```

### Chat Provider Config

Dev default:

```env
CHAT_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
```

Production option:

```env
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Embedding provider is separate from chat provider.

## Manual Test

Make sure:

- Day 1 migrations are applied.
- If using Ollama embeddings, the live DB is `vector(768)`.
- At least one PDF has been ingested successfully and `documents.status = 'ready'`.
- `ollama serve` is running if `EMBEDDING_PROVIDER=ollama`.
- `nomic-embed-text` has been pulled.
- `GROQ_API_KEY` exists if `CHAT_PROVIDER=groq`.

Example:

```bash
curl -N http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Berapa cuti tahunan?"}'
```

## TASK-16 RAG Accuracy Test Set

Use at least 10 questions after demo documents are ingested:

1. Berapa jatah cuti tahunan karyawan?
2. Bagaimana prosedur reimburse?
3. Dokumen apa saja yang dibutuhkan untuk reimbursement?
4. Berapa lama proses approval reimbursement?
5. Bagaimana cara meminta akses software baru?
6. Siapa yang harus dihubungi untuk masalah laptop?
7. Apa aturan kerja remote?
8. Bagaimana proses onboarding karyawan baru?
9. Apa yang harus dilakukan jika lupa password?
10. Bagaimana prosedur pengajuan izin sakit?
11. Apakah ada batas nominal reimbursement?
12. Apa langkah pertama ketika ada insiden keamanan?

For each question, record:

- Expected answer.
- Actual answer.
- Sources shown.
- Whether every claim is supported by a source.
- Whether no-answer behavior triggers correctly for unknown questions.

Acceptance target:

- At least 9 of 10 answerable questions cite the correct source.
- Unknown questions return no-answer behavior instead of fabricated answers.
- Response starts streaming within 5 seconds on local dev data.
