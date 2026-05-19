# Day 5 - Admin Documents

## Scope

- TASK-22 Admin route guard with role check
- TASK-23 Upload UI with drag-drop PDF and Notion URL input
- TASK-24 Document list with status polling
- TASK-25 Delete document with cascade to chunks

## Admin Guard

Admin access is checked in the app layer because authentication currently uses NextAuth Google.

Required env:

```env
ADMIN_EMAILS=admin@example.com,owner@example.com
ADMIN_EMAIL_DOMAIN=example.com
```

`ADMIN_EMAILS` takes priority. If it is empty, `ADMIN_EMAIL_DOMAIN` is used.

## Routes

- `/admin` - admin document management page.
- `GET /api/admin/documents` - list recent documents with chunk counts.
- `DELETE /api/admin/documents/:id` - delete a document. Chunks are deleted by the existing `chunks.document_id references documents(id) on delete cascade` constraint.
- `POST /api/ingest` - now requires admin access.

## Notes

- Notion URL input is present in the UI, but Notion ingestion remains on hold.
- Document polling runs every 3 seconds only while at least one document has `processing` status.
