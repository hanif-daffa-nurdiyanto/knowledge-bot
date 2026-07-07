# RAG Retrieval Evaluation Report

Generated at: 2026-07-07T04:22:58.873Z

## Environment

- Embedding provider: `nvidia`
- Embedding model: `nvidia/nv-embedqa-e5-v5`
- Embedding dimensions: `1024`
- Dataset: `eval/rag/questions.jsonl`

## Summary

| matchCount | threshold | doc hit | source hit | doc MRR | source MRR | negative FP | avg ms | avg retrieved |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.25 | 100% | 100% | 0.958 | 0.917 | 100% | 640 | 2 |
| 2 | 0.55 | 8.3% | 8.3% | 0.083 | 0.083 | 0% | 552 | 0.07 |
| 2 | 0.75 | 0% | 0% | 0 | 0 | 0% | 568 | 0 |
| 3 | 0.25 | 100% | 100% | 0.958 | 0.917 | 100% | 776 | 3 |
| 3 | 0.55 | 8.3% | 8.3% | 0.083 | 0.083 | 0% | 526 | 0.07 |
| 3 | 0.75 | 0% | 0% | 0 | 0 | 0% | 545 | 0 |
| 5 | 0.25 | 100% | 100% | 0.958 | 0.917 | 100% | 578 | 5 |
| 5 | 0.55 | 8.3% | 8.3% | 0.083 | 0.083 | 0% | 596 | 0.07 |
| 5 | 0.75 | 0% | 0% | 0 | 0 | 0% | 588 | 0 |

## Top Failures

### matchCount=2, threshold=0.25

- `neg-001`: Berapa nominal tunjangan makan harian karyawan?
  - top result: HR Document p1 c0 (0.476)
- `neg-002`: Apakah perusahaan menyediakan kebijakan kerja remote permanen?
  - top result: SOP Operasional Harian p1 c0 (0.447)
- `neg-003`: Apa nama vendor asuransi kesehatan perusahaan?
  - top result: Prosedur IT Perusahaan p2 c1 (0.366)

### matchCount=2, threshold=0.55

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

### matchCount=2, threshold=0.75

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

### matchCount=3, threshold=0.25

- `neg-001`: Berapa nominal tunjangan makan harian karyawan?
  - top result: HR Document p1 c0 (0.476)
- `neg-002`: Apakah perusahaan menyediakan kebijakan kerja remote permanen?
  - top result: SOP Operasional Harian p1 c0 (0.447)
- `neg-003`: Apa nama vendor asuransi kesehatan perusahaan?
  - top result: Prosedur IT Perusahaan p2 c1 (0.366)

### matchCount=3, threshold=0.55

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

### matchCount=3, threshold=0.75

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

### matchCount=5, threshold=0.25

- `neg-001`: Berapa nominal tunjangan makan harian karyawan?
  - top result: HR Document p1 c0 (0.476)
- `neg-002`: Apakah perusahaan menyediakan kebijakan kerja remote permanen?
  - top result: SOP Operasional Harian p1 c0 (0.447)
- `neg-003`: Apa nama vendor asuransi kesehatan perusahaan?
  - top result: Prosedur IT Perusahaan p2 c1 (0.366)

### matchCount=5, threshold=0.55

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

### matchCount=5, threshold=0.75

- `hr-001`: Berapa lama masa probation karyawan?
  - top result: none
- `hr-002`: Berapa jumlah cuti tahunan karyawan?
  - top result: none
- `hr-003`: Kapan pengajuan cuti paling lambat dilakukan?
  - top result: none
- `hr-004`: Apa saja dasar penilaian kinerja karyawan?
  - top result: none
- `it-001`: Seberapa sering password wajib diganti?
  - top result: none
- `it-002`: Jam berapa backup data otomatis dilakukan?
  - top result: none
- `it-003`: Bagaimana prosedur melaporkan insiden IT?
  - top result: none
- `it-004`: Di mana data perusahaan wajib disimpan?
  - top result: none
- `ops-001`: Jam operasional perusahaan hari Senin sampai Jumat pukul berapa?
  - top result: none
- `ops-002`: Berapa lama keterlambatan yang wajib diberi alasan ke atasan?
  - top result: none

