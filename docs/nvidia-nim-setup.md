# NVIDIA NIM Setup

This project supports NVIDIA NIM through OpenAI-compatible endpoints.

## Environment

```env
CHAT_PROVIDER=nvidia
EMBEDDING_PROVIDER=nvidia
NVIDIA_NIM_API_KEY=your_nvidia_api_key
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_CHAT_MODEL=nvidia/llama-3.1-nemotron-ultra-253b-v1
NVIDIA_NIM_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5
NVIDIA_NIM_EMBEDDING_DIMENSIONS=1024
RAG_MATCH_THRESHOLD=0.75
```

For self-hosted NIM, set `NVIDIA_NIM_BASE_URL` to your NIM `/v1` base URL.

## Database Dimension Change

The default NVIDIA embedding model `nvidia/nv-embedqa-e5-v5` returns 1024-dimensional vectors. The existing Ollama setup uses 768 dimensions.

Before using NVIDIA embeddings, run:

```sql
-- docs/use-nvidia-nim.sql
```

Then re-seed or re-upload documents so chunks are embedded with NVIDIA NIM.

## Notes

- Chat uses NVIDIA NIM's OpenAI-compatible `/v1/chat/completions`.
- Embeddings use `/v1/embeddings`.
- The embedding pipeline sends `input_type=passage` for document chunks and `input_type=query` for user questions.
