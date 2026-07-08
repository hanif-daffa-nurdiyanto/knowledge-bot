# Document Focus Selector Plan

## Goal

Add a document selector in the chat header so users can focus retrieval on one ready document. The default option remains `All documents`.

## Behavior

- Show a selector in the top chat area.
- Default selection: `All documents`.
- List only documents with `status = ready`.
- When a document is selected, send its `documentId` with the chat request.
- Restrict vector retrieval to the selected document.
- Keep source cards and preview behavior unchanged.
- If the selected document is deleted or no longer ready, gracefully fall back to `All documents` in the UI after reloading document options.

## Backend Changes

- Add `GET /api/chat/documents` for authenticated users.
- Return ready document IDs and names.
- Add optional `documentId` to `POST /api/chat`.
- Validate the selected document is ready before querying.
- Update `searchSimilarChunks()` to pass an optional document filter to the Supabase RPC.
- Update `match_document_chunks()` with an optional `document_id_filter`.

## Frontend Changes

- Load ready documents when `ChatClient` mounts.
- Add a compact native select in the header.
- Use `All documents` as the empty/default value.
- Disable the selector while streaming.
- Include `documentId` in chat request body only when a specific document is selected.

## Verification

- Run lint and TypeScript checks.
- Manually test:
  - default `All documents` search still works,
  - focused document search only returns sources from the selected document,
  - selector handles no ready documents.
