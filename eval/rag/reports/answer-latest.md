# RAG Answer Evaluation Report

Generated at: 2026-07-07T04:31:53.456Z
Retrieval report: `eval/rag/reports/retrieval-latest.json`
Config: matchCount=2, threshold=0.25
Chat: groq / llama-3.1-8b-instant

## Summary

- Cases: 3
- Source marker rate: 100%
- Sources section rate: 100%
- Negative refusal rate: n/a
- Average latency: 766ms

## Cases

### hr-001

Question: Berapa lama masa probation karyawan?

Expected: Masa probation berlangsung selama 3 bulan.

Answer:

```txt
Masa probation karyawan berlangsung selama 3 bulan [S1].

Sources:
[S1] HR Document, page 1, chunk 0
```

Sources: S1 HR Document p1 c0, S2 SOP Operasional Harian p1 c0

### hr-002

Question: Berapa jumlah cuti tahunan karyawan?

Expected: Karyawan mendapat cuti tahunan 12 hari kerja.

Answer:

```txt
Karyawan memiliki cuti tahunan sebesar 12 hari kerja [S1].

Sources:
[S1] Dokumen HR (Human Resource), Nomor Dokumen: HR-EMP-002, A. Cuti.
```

Sources: S1 HR Document p1 c0, S2 SOP Operasional Harian p1 c0

### hr-003

Question: Kapan pengajuan cuti paling lambat dilakukan?

Expected: Pengajuan cuti dilakukan minimal H-3.

Answer:

```txt
Pengajuan cuti minimal dilakukan H-3 (3 hari sebelumnya) [S1].

Sources:
[S1] Dokumen HR (Human Resource), page 1, chunk 0
```

Sources: S1 HR Document p1 c0, S2 Prosedur IT Perusahaan p2 c1

