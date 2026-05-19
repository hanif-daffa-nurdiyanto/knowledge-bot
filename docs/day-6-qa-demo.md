# Day 6 - Polish, Demo Seed, QA Questions

## Scope

- TASK-26 Error handling, loading states, toast notifications
- TASK-27 Seed 3 demo dokumen
- TASK-28 Siapkan 10 contoh pertanyaan + jawaban expected

TASK-29 production QA dan TASK-30 video walkthrough belum dikerjakan.

## TASK-26

Implemented:

- Toast notification component in `components/ui/toast.tsx`.
- Admin upload, seed, delete, document-load errors, Notion hold notice, and PDF validation now show toasts.
- Chat streaming stop and chat failures now show toasts.
- Admin document list has skeleton loading rows while initial document data is fetched.
- Upload/delete/seed buttons show disabled and spinner states while requests are running.

## TASK-27

Demo PDFs are already available in `public/document/`:

- `SOP_Operasional_Harian_Dummy.pdf`
- `Dokumen_HR_Dummy.pdf`
- `Prosedur_IT_Perusahaan_Dummy.pdf`

Seed endpoint:

- `POST /api/admin/seed-demo-documents`
- Requires admin session.
- Reads the 3 PDFs from `public/document/`.
- Inserts them into `documents` with `processing` status.
- Runs the same PDF parse, chunking, embedding, and Supabase insert pipeline used by `/api/ingest`.
- Skips documents when an existing document has the same display title or file name.

Admin UI:

- Open `/admin`.
- Click `Seed 3 demo documents`.
- Polling will refresh the document status until processing completes.

Recommended local RAG threshold for the included Ollama `nomic-embed-text` demo:

```env
RAG_MATCH_THRESHOLD=0.55
```

The original `0.75` threshold is usually too strict for these short dummy PDFs with `nomic-embed-text`; valid matches often score around `0.59-0.68`.

## TASK-28: 10 QA Examples

Use these after the 3 demo PDFs are seeded and status is `ready`.

| No | Question | Expected Answer |
| --- | --- | --- |
| 1 | Jam operasional perusahaan hari Senin sampai Jumat jam berapa? | Jam operasional Senin-Jumat adalah 08.00-17.00 WIB, dengan istirahat 12.00-13.00 WIB. |
| 2 | Apa yang harus dilakukan kalau terlambat lebih dari 15 menit? | Karyawan wajib memberikan alasan kepada atasan jika terlambat lebih dari 15 menit. |
| 3 | Berapa lama kerusakan perangkat kantor harus dilaporkan? | Kerusakan perangkat wajib dilaporkan maksimal 1x24 jam. |
| 4 | Apa saja yang harus dilakukan saat penutupan operasional harian? | Simpan dokumen di cloud perusahaan, logout dari seluruh sistem internal, dan matikan perangkat elektronik yang tidak digunakan. |
| 5 | Berapa lama masa probation karyawan? | Masa probation berlangsung selama 3 bulan dengan evaluasi setiap akhir bulan. |
| 6 | Berapa jatah cuti tahunan dan kapan harus diajukan? | Cuti tahunan 12 hari kerja, dan pengajuan cuti minimal H-3. |
| 7 | Apa tahapan tindakan disipliner dalam dokumen HR? | Tahapannya adalah teguran lisan, teguran tertulis, suspensi, dan pemutusan hubungan kerja. |
| 8 | Seberapa sering password akun perusahaan harus diganti? | Password wajib diganti setiap 90 hari. |
| 9 | Kapan backup otomatis dilakukan oleh tim IT? | Backup dilakukan otomatis setiap hari pukul 23.00 WIB. |
| 10 | Apa saja hak akses untuk role Admin, Staff, dan Viewer? | Admin memiliki Full Access, Staff memiliki akses Operasional Harian, dan Viewer memiliki Read Only. |

## No-Result Test

Ask a question outside the demo documents, for example:

> Apa kebijakan reimbursement perjalanan luar negeri?

Expected behavior:

- Chat should answer that there is not enough information in the knowledge base.
- No source cards should be shown.
