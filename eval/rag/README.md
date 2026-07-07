# RAG Evaluation Dataset

This folder contains the initial evaluation dataset and generated reports for KnowledgeBot retrieval quality.

## Files

- `questions.jsonl`: JSONL test cases for retrieval and answer evaluation.
- `reports/`: generated JSON and Markdown reports from eval scripts.

## Run Retrieval Eval

```bash
npm run eval:rag:retrieval
```

Default output:

```txt
eval/rag/reports/retrieval-latest.json
eval/rag/reports/retrieval-latest.md
```

Custom config:

```bash
npm run eval:rag:retrieval -- \
  --match-counts 2,3,5 \
  --thresholds 0.20,0.25,0.30
```

The script uses `.env.local`, embeds each question with the configured embedding provider, calls `match_document_chunks`, and reports hit rates against expected documents/sources.

## Run Answer Eval

Generate answer samples from a retrieval report:

```bash
npm run eval:rag:answer
```

Default input/output:

```txt
eval/rag/reports/retrieval-latest.json
eval/rag/reports/answer-latest.json
eval/rag/reports/answer-latest.md
```

Limit cases during development:

```bash
npm run eval:rag:answer -- --limit 5
```

The answer runner creates review artifacts and lightweight heuristic metrics such as source marker rate, sources section rate, and negative refusal rate. Correctness and groundedness still need human review or a future LLM judge.

Run with the optional LLM judge:

```bash
npm run eval:rag:answer -- --limit 5 --judge
```

The judge asks the active chat model to score correctness, groundedness, completeness, source attribution, and refusal behavior. Treat judge scores as review assistance, not a replacement for human evaluation.
