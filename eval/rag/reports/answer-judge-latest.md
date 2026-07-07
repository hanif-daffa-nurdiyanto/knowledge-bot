# RAG Answer Evaluation Report

Generated at: 2026-07-07T07:23:52.204Z
Retrieval report: `eval/rag/reports/retrieval-latest.json`
Config: matchCount=2, threshold=0.25
Chat: groq / llama-3.1-8b-instant
Judge enabled: yes

## Summary

- Cases: 2
- Source marker rate: 100%
- Sources section rate: 100%
- Negative refusal rate: n/a
- Judged cases: 2
- Average judge score: 2 / 2
- Judge correctness average: 2 / 2
- Judge groundedness average: 2 / 2
- Judge completeness average: 2 / 2
- Average latency: 2182ms

## Cases

### hr-001

Question: Berapa lama masa probation karyawan?

Expected: Masa probation berlangsung selama 3 bulan.

Answer:

```txt
Masa probation karyawan berlangsung selama 3 bulan [S1].

Sources:
[S1] HR Document, page 1, chunk 0, B. Masa Percobaan, 1. Masa probation berlangsung selama 3 bulan.
```

Sources: S1 HR Document p1 c0

Judge:

```json
{
  "correctness": 2,
  "groundedness": 2,
  "completeness": 2,
  "refusal_ok": false,
  "source_attribution_ok": true,
  "notes": "Answer matches the expected answer and is fully attributed to the source."
}
```

### hr-002

Question: Berapa jumlah cuti tahunan karyawan?

Expected: Karyawan mendapat cuti tahunan 12 hari kerja.

Answer:

```txt
Karyawan mendapatkan 12 hari kerja sebagai cuti tahunan [S1].

Sources:
[S1] HR Document, page 1, chunk 0, B. Masa Percobaan
```

Sources: S1 HR Document p1 c0

Judge:

```json
{
  "correctness": 2,
  "groundedness": 2,
  "completeness": 2,
  "refusal_ok": false,
  "source_attribution_ok": true,
  "notes": "Answer is accurate and complete, and source is correctly attributed."
}
```

