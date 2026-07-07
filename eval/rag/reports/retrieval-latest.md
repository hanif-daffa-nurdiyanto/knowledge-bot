# RAG Retrieval Evaluation Report

Generated at: 2026-07-07T04:31:17.803Z

## Environment

- Embedding provider: `nvidia`
- Embedding model: `nvidia/nv-embedqa-e5-v5`
- Embedding dimensions: `1024`
- Dataset: `eval/rag/questions.jsonl`

## Summary

| matchCount | threshold | doc hit | source hit | doc MRR | source MRR | negative FP | avg ms | avg retrieved |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.25 | 100% | 100% | 0.958 | 0.917 | 100% | 739 | 2 |

## Top Failures

### matchCount=2, threshold=0.25

- `neg-001`: Berapa nominal tunjangan makan harian karyawan?
  - top result: HR Document p1 c0 (0.476)
- `neg-002`: Apakah perusahaan menyediakan kebijakan kerja remote permanen?
  - top result: SOP Operasional Harian p1 c0 (0.447)
- `neg-003`: Apa nama vendor asuransi kesehatan perusahaan?
  - top result: Prosedur IT Perusahaan p2 c1 (0.366)

