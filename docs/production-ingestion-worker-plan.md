# Production Ingestion Worker Plan

## Tujuan

Dokumen ini menjelaskan rencana memindahkan proses ingestion PDF dari `after()` ke sistem background worker yang lebih tahan untuk produksi.

Target utamanya:

- Upload PDF tetap cepat memberi respons `202 Accepted`.
- File PDF tersimpan secara durable sebelum response dikirim.
- Proses parsing, chunking, embedding, dan insert chunk tidak bergantung pada lifecycle request.
- Job ingestion bisa retry jika gagal.
- Dokumen tidak stuck di status `processing` tanpa jejak error.
- Admin bisa melihat status yang lebih jelas: `queued`, `processing`, `ready`, atau `failed`.

## Masalah Saat Ini

Saat ini `app/api/ingest/route.ts` dan `app/api/admin/seed-demo-documents/route.ts` memakai `after()` dari Next.js untuk menjalankan `processPdfDocument()` setelah response dikirim.

Pola ini masih cukup untuk demo atau local development, tetapi kurang aman untuk produksi karena:

- `after()` tetap dibatasi oleh `maxDuration` route/platform.
- PDF disimpan sebagai `Buffer` di memori, bukan durable storage.
- Jika serverless instance berhenti, deploy terjadi, atau timeout tercapai, proses ingestion bisa hilang.
- User sudah menerima response sukses, tetapi dokumen bisa tidak pernah selesai diproses.
- Tidak ada retry otomatis.
- Tidak ada locking untuk mencegah dua proses mengerjakan dokumen yang sama.
- Seed demo menjadwalkan beberapa proses background sekaligus di dalam request yang sama.

## Target Arsitektur

Arsitektur yang disarankan:

1. Admin upload PDF melalui `/api/ingest`.
2. API membuat record `documents` dengan status `queued`.
3. API menyimpan PDF ke Supabase Storage private bucket.
4. API membuat record `ingestion_jobs`.
5. API langsung mengembalikan response `202 Accepted`.
6. Worker endpoint mengambil job yang pending secara atomic.
7. Worker mengubah status job menjadi `running` dan dokumen menjadi `processing`.
8. Worker download PDF dari Supabase Storage.
9. Worker menjalankan pipeline PDF yang sudah ada: parse, chunk, embed, insert chunks.
10. Jika sukses, worker mengubah dokumen menjadi `ready` dan job menjadi `succeeded`.
11. Jika gagal, worker menyimpan error dan menjadwalkan retry.
12. Jika retry habis, dokumen menjadi `failed`.

## Step Implementasi

### 1. Tambah Storage Bucket

Tujuan:

- Menyimpan file PDF secara durable.
- Menghilangkan ketergantungan pada `Buffer` di memori request.
- Memungkinkan worker mengambil file kapan pun job diproses.

Implementasi:

- Buat bucket private, misalnya `document-uploads`.
- Simpan file dengan path stabil:

```txt
documents/{documentId}/{safeFileName}
```

- Akses bucket hanya dari server menggunakan `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Tambah Tabel `ingestion_jobs`

Tujuan:

- Membuat ingestion menjadi durable job.
- Menyimpan status, retry count, lock, dan error terakhir.
- Memudahkan observability di admin UI.

Kolom yang disarankan:

```sql
create table public.ingestion_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  source_type text not null default 'pdf'
    check (source_type in ('pdf')),
  storage_bucket text not null default 'document-uploads',
  storage_path text not null,
  file_name text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Tambahkan index:

```sql
create index ingestion_jobs_pending_idx
  on public.ingestion_jobs (status, run_after, created_at);

create index ingestion_jobs_document_id_idx
  on public.ingestion_jobs (document_id);
```

Aktifkan RLS:

```sql
alter table public.ingestion_jobs enable row level security;
```

Tidak perlu policy public karena akses job dilakukan lewat service role di API server.

### 3. Tambah Status `queued` ke `documents`

Tujuan:

- Membedakan file yang sudah diterima tetapi belum diproses dari file yang sedang benar-benar diproses.

Perubahan:

```sql
status in ('queued', 'processing', 'ready', 'failed')
```

Admin UI bisa tetap polling ketika ada dokumen `queued` atau `processing`.

### 4. Ubah Upload Endpoint

Tujuan:

- `/api/ingest` hanya menerima upload dan membuat job.
- Proses berat tidak lagi berjalan di request lifecycle.

Alur baru:

1. Validasi session admin.
2. Validasi file PDF dan ukuran file.
3. Insert `documents` dengan status `queued`.
4. Upload file ke Storage.
5. Insert `ingestion_jobs`.
6. Return `202 Accepted`.

Endpoint ini tidak lagi memanggil:

```ts
after(async () => {
  await processPdfDocument(...)
})
```

### 5. Refactor Pipeline Ingestion

Tujuan:

- Pipeline tetap reusable.
- Worker bisa memproses file dari Storage.
- Seed demo bisa memakai mekanisme job yang sama.

Rencana:

- Pertahankan `processPdfDocument({ documentId, fileName, fileBuffer })`.
- Tambahkan helper baru, misalnya `processPdfDocumentFromStorage(job)`.
- Helper baru bertugas:
  - download file dari Supabase Storage,
  - convert ke `Buffer`,
  - panggil `processPdfDocument`.

### 6. Buat Worker Endpoint

Tujuan:

- Menjalankan ingestion di request terpisah yang bisa dipanggil manual atau cron.
- Memproses job secara batch kecil.

Endpoint yang disarankan:

```txt
POST /api/admin/ingest-jobs/run
```

Keamanan:

- Gunakan header:

```txt
Authorization: Bearer {INGEST_WORKER_SECRET}
```

- Tambahkan env:

```txt
INGEST_WORKER_SECRET=
```

Alur worker:

1. Validasi `INGEST_WORKER_SECRET`.
2. Ambil 1 sampai beberapa job yang siap diproses.
3. Lock job secara atomic.
4. Download file dari Storage.
5. Jalankan pipeline.
6. Update status sukses/gagal.
7. Return ringkasan hasil.

### 7. Buat Function Atomic Claim Job

Tujuan:

- Mencegah dua worker memproses job yang sama.
- Memungkinkan cron berjalan paralel tanpa double processing.

Disarankan membuat SQL function, misalnya:

```sql
create or replace function private.claim_ingestion_jobs(
  worker_id text,
  job_limit integer default 1
)
returns setof public.ingestion_jobs
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.ingestion_jobs
    where status = 'queued'
      and run_after <= now()
      and attempts < max_attempts
    order by created_at
    limit job_limit
    for update skip locked
  )
  update public.ingestion_jobs jobs
  set
    status = 'running',
    locked_at = now(),
    locked_by = worker_id,
    attempts = attempts + 1,
    updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
$$;
```

Catatan keamanan:

- Lebih baik simpan function privileged di schema private, bukan schema exposed/public.
- Jika memakai schema `private`, pastikan schema dibuat dan tidak diekspos ke Data API.

### 8. Tambahkan Retry dan Backoff

Tujuan:

- Error sementara dari embedding provider atau storage tidak langsung membuat dokumen gagal permanen.

Aturan yang disarankan:

- Jika job gagal dan `attempts < max_attempts`, set:
  - `status = 'queued'`
  - `run_after = now() + interval '5 minutes'`
  - `last_error = error message`
- Jika job gagal dan retry habis, set:
  - job `status = 'failed'`
  - document `status = 'failed'`
  - document `error_message = last_error`

### 9. Jadwalkan Worker

Tujuan:

- Job diproses otomatis tanpa admin harus menekan tombol manual.

Pilihan:

- Vercel Cron memanggil endpoint worker tiap 1-5 menit.
- GitHub Actions cron memanggil endpoint worker.
- Supabase Cron + `pg_net` memanggil endpoint worker.

Untuk deployment Next.js/Vercel, Vercel Cron adalah opsi paling langsung. Untuk local/dev, endpoint worker bisa dipanggil manual.

Jika memakai Supabase Cron, aktifkan cron setelah aplikasi memiliki URL publik:

```sql
select private.configure_ingestion_worker_cron(
  'https://your-app.example.com/api/admin/ingest-jobs/run?limit=3',
  'your-ingest-worker-secret',
  '*/5 * * * *',
  true
);
```

Jangan gunakan `localhost` untuk Supabase Cron karena cron berjalan dari Supabase cloud, bukan dari mesin lokal.

### 10. Update Admin UI

Tujuan:

- Admin bisa melihat state ingestion dengan jelas.
- Admin bisa melakukan retry untuk dokumen gagal.

Perubahan UI:

- Tampilkan status `queued`.
- Polling dokumen jika ada status `queued` atau `processing`.
- Tambahkan informasi `error_message` untuk dokumen gagal.
- Tambahkan tombol retry untuk job gagal.

### 11. Migrasikan Seed Demo

Tujuan:

- Seed demo memakai mekanisme ingestion yang sama dengan upload normal.
- Tidak ada lagi multiple `after()` callback dalam satu request.

Alur baru seed demo:

1. Baca file demo dari `public/document`.
2. Insert `documents` dengan status `queued`.
3. Upload file demo ke Storage.
4. Insert `ingestion_jobs`.
5. Return daftar dokumen yang masuk queue.

## Detail Implementasi Yang Disarankan

Urutan kerja coding:

1. Buat migration untuk bucket metadata, status `queued`, tabel `ingestion_jobs`, index, RLS, dan function claim job.
2. Tambahkan helper Storage di `lib/ingest/storage.ts`.
3. Tambahkan helper job di `lib/ingest/jobs.ts`.
4. Refactor `app/api/ingest/route.ts` agar membuat job, bukan menjalankan pipeline.
5. Buat `app/api/admin/ingest-jobs/run/route.ts`.
6. Refactor `app/api/admin/seed-demo-documents/route.ts` agar membuat job.
7. Update tipe status dokumen di admin client.
8. Update polling admin agar status `queued` ikut dipantau.
9. Tambahkan env `INGEST_WORKER_SECRET` ke `env.example`.
10. Jalankan `npm run lint`.
11. Apply migration ke Supabase.
12. Test manual:
    - upload PDF,
    - cek document status `queued`,
    - panggil worker endpoint,
    - cek status berubah ke `ready`,
    - cek chunks terisi.

## Verifikasi

Checklist verifikasi minimum:

- Upload PDF mengembalikan `202 Accepted`.
- Record `documents` dibuat dengan status `queued`.
- File muncul di Storage bucket.
- Record `ingestion_jobs` dibuat.
- Worker bisa claim job.
- Worker mengubah job menjadi `running`.
- Worker mengubah dokumen menjadi `processing`.
- Setelah selesai, dokumen menjadi `ready`.
- Chunk terisi di tabel `chunks`.
- Jika embedding gagal, job masuk retry.
- Setelah retry habis, dokumen menjadi `failed`.
- Admin UI menampilkan status yang benar.

## Catatan

Supabase Queues berbasis PGMQ juga bisa dipakai untuk sistem queue yang lebih formal. Namun untuk codebase ini, job table lebih sederhana dan lebih dekat dengan pipeline Node.js yang sudah ada. Jika kebutuhan concurrency dan volume ingestion meningkat, migrasi ke Supabase Queues bisa dilakukan setelah worker endpoint stabil.
