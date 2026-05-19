# Day 4 - RAG Chat UI

## Scope

- TASK-17 Layout utama + sidebar riwayat percakapan
- TASK-18 Chat bubble + streaming + markdown rendering
- TASK-19 Source card component di bawah bot message
- TASK-20 Input area + keyboard shortcuts
- TASK-21 Mobile responsiveness

## Implementation

- `/chat` renders the main RAG chat surface.
- Conversation history is stored in client state for now, not persisted to Supabase.
- Chat responses stream from `POST /api/chat` with a plain text reader.
- Assistant messages render markdown using `react-markdown`.
- Source cards are built from `x-rag-sources` response metadata and displayed under assistant messages.
- Keyboard shortcuts:
  - `Enter` sends the message.
  - `Shift+Enter` inserts a new line.
  - `Ctrl/Cmd+K` starts a new chat.

## Notes

- Notion integration remains on hold.
- Persisted chat history can be added later with `conversations` and `messages` tables if needed.
