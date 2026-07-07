# RAG Quality Evaluation Plan

## Tujuan

Dokumen ini menjelaskan rencana evaluasi kualitas RAG untuk KnowledgeBot.

Target utamanya:

- Mengukur apakah search vector menemukan sumber yang benar.
- Mengukur apakah jawaban memakai konteks yang tepat.
- Menentukan nilai `RAG_MATCH_THRESHOLD`, `MATCH_COUNT`, dan candidate count yang paling stabil.
- Membandingkan dampak `FILTER_LLM=ON/OFF`.
- Menemukan pertanyaan yang gagal agar dokumen, chunking, prompt, atau threshold bisa diperbaiki.
- Membuat proses evaluasi yang bisa diulang setiap kali model, embedding provider, chunk size, atau dokumen berubah.

## Kondisi Saat Ini

Alur RAG saat ini:

1. User bertanya ke `/api/chat`.
2. Query di-embed lewat `embedTexts(..., "query")`.
3. `searchSimilarChunks()` memanggil RPC `match_document_chunks`.
4. Search memakai `matchCount` dan `threshold`.
5. Jika `FILTER_LLM=ON`, kandidat chunks dinilai ulang oleh LLM relevance judge.
6. Final chunks dikirim ke prompt.
7. Model menjawab dengan source marker `[S1]`, `[S2]`, dan source cards dikirim melalui response headers.

Kelemahannya:

- Belum ada dataset pertanyaan-jawaban internal.
- Belum ada ground truth sumber/chunk yang diharapkan.
- Belum ada metrik retrieval seperti hit rate atau MRR.
- Belum ada metrik jawaban seperti groundedness dan answer correctness.
- Tuning threshold masih manual.
- Perubahan embedding provider atau chunk size sulit dibandingkan secara objektif.

## Evaluasi Yang Dibutuhkan

Evaluasi dibagi menjadi dua lapisan:

1. **Retrieval evaluation**
   Mengukur apakah sistem mengambil dokumen/chunk yang benar sebelum LLM menjawab.

2. **Answer evaluation**
   Mengukur apakah jawaban akhir benar, lengkap, dan tidak mengarang di luar konteks.

Retrieval harus dievaluasi lebih dulu karena answer generation tidak bisa bagus jika konteks yang masuk salah.

## Dataset Evaluasi

### Format Dataset

Buat file JSONL:

```txt
eval/rag/questions.jsonl
```

Satu baris berisi satu test case:

```json
{"id":"hr-001","question":"Berapa jumlah cuti tahunan karyawan?","expected_answer":"Karyawan mendapat 12 hari cuti tahunan.","expected_documents":["HR Document"],"expected_sources":[{"document_name":"HR Document","page_number":1}],"category":"hr","must_answer":true}
```

Field yang disarankan:

- `id`: id unik test case.
- `question`: pertanyaan user.
- `expected_answer`: jawaban ringkas yang benar.
- `expected_documents`: dokumen yang harus muncul di hasil retrieval.
- `expected_sources`: sumber spesifik yang diharapkan, minimal document/page jika tersedia.
- `category`: area pertanyaan, misalnya `hr`, `it`, `sop`, `negative`.
- `must_answer`: `true` jika knowledge base seharusnya bisa menjawab.
- `notes`: opsional untuk catatan reviewer.

### Jenis Pertanyaan

Dataset sebaiknya berisi:

- Pertanyaan langsung: jawabannya eksplisit di dokumen.
- Pertanyaan parafrase: wording berbeda dari dokumen.
- Pertanyaan multi-hop ringan: perlu menggabungkan dua chunk dari dokumen yang sama.
- Pertanyaan lintas dokumen: perlu memilih dokumen yang tepat.
- Pertanyaan negatif: jawabannya tidak ada di knowledge base.
- Pertanyaan ambigu: harus meminta klarifikasi atau menjawab terbatas.
- Pertanyaan bahasa Indonesia dan Inggris jika user memakai dua bahasa.

### Ukuran Dataset Awal

Mulai kecil:

- 10 pertanyaan HR.
- 10 pertanyaan IT.
- 10 pertanyaan SOP operasional.
- 10 pertanyaan negatif.

Total awal: 40 test cases.

Setelah sistem stabil, naikkan ke 100-150 test cases.

## Metrik Retrieval

Untuk setiap test case, jalankan retrieval dengan beberapa konfigurasi:

- `MATCH_COUNT`: 2, 3, 5, 8.
- `RAG_MATCH_THRESHOLD`: 0.15, 0.20, 0.25, 0.30, 0.40, 0.55, 0.75.
- `FILTER_LLM`: `ON` dan `OFF`.

Metrik:

- **Document Hit@K**
  Apakah salah satu `expected_documents` muncul di top K.

- **Source Hit@K**
  Apakah page/chunk yang diharapkan muncul di top K.

- **MRR**
  Mean reciprocal rank dari dokumen/sumber yang benar.

- **No Context Accuracy**
  Untuk pertanyaan negatif, apakah retrieval tidak mengambil konteks palsu yang terlalu percaya diri.

- **Average Source Count**
  Jumlah source final yang dipakai setelah optional filter.

- **Latency**
  Durasi embedding, similarity search, optional LLM filter, dan total retrieval.

## Metrik Jawaban

Answer evaluation bisa dimulai dengan rubric manual, lalu ditambah LLM judge.

Rubric manual:

- `correct`: jawaban sesuai expected answer.
- `grounded`: setiap klaim penting didukung source.
- `complete`: tidak kehilangan bagian penting.
- `concise`: tidak terlalu panjang.
- `refusal_ok`: untuk pertanyaan negatif, model mengakui informasi tidak ditemukan.
- `source_attribution_ok`: jawaban memakai marker source dan bagian Sources.

Skor sederhana:

```txt
0 = salah / mengarang
1 = sebagian benar tapi kurang lengkap atau kurang grounded
2 = benar, grounded, dan cukup lengkap
```

Metrik agregat:

- Answer Accuracy.
- Groundedness Rate.
- Refusal Accuracy untuk pertanyaan negatif.
- Source Attribution Rate.
- Average Answer Score.

## Step Implementasi

### 1. Buat Folder Eval

Tujuan:

- Menyimpan dataset, runner, dan output report secara terpisah dari app runtime.

Struktur:

```txt
eval/
  rag/
    questions.jsonl
    README.md
    reports/
```

### 2. Buat Dataset Awal

Tujuan:

- Menyediakan baseline evaluasi untuk dokumen demo dan dokumen internal.

Langkah:

1. Baca dokumen yang sudah di-ingest.
2. Tulis 40 pertanyaan awal.
3. Tandai expected document dan expected page/chunk jika tersedia.
4. Masukkan pertanyaan negatif yang tidak boleh dijawab.

### 3. Ekstrak Retrieval Runner

Tujuan:

- Menjalankan `searchSimilarChunks()` tanpa memanggil endpoint chat.
- Mengukur retrieval secara cepat dan murah.

Implementasi:

- Buat script:

```txt
scripts/eval-rag-retrieval.ts
```

Input:

```bash
npx tsx scripts/eval-rag-retrieval.ts \
  --dataset eval/rag/questions.jsonl \
  --out eval/rag/reports/retrieval-latest.json
```

Output per case:

- question id
- query
- config
- retrieved chunks
- hit/miss
- rank expected source
- similarity values
- latency

### 4. Tambahkan Config Sweep

Tujuan:

- Menemukan kombinasi threshold dan top-k terbaik.

Runner harus bisa menjalankan kombinasi:

```json
[
  {"matchCount":2,"threshold":0.20,"filterLlm":"OFF"},
  {"matchCount":3,"threshold":0.25,"filterLlm":"OFF"},
  {"matchCount":5,"threshold":0.25,"filterLlm":"ON"}
]
```

Output agregat:

- Document Hit@K
- Source Hit@K
- MRR
- negative false positive rate
- average latency

### 5. Buat Answer Runner

Tujuan:

- Mengevaluasi jawaban final, bukan hanya source retrieval.

Pilihan implementasi:

- Memanggil logic chat internal secara langsung.
- Atau memanggil `/api/chat` dengan test session jika auth bisa disiapkan.

Rekomendasi awal:

- Ekstrak core RAG answer generation ke helper server-side, misalnya:

```txt
lib/rag/answer.ts
```

Fungsi:

```ts
generateRagAnswer({
  query,
  matchCount,
  threshold,
})
```

Lalu `/api/chat` dan eval runner memakai helper yang sama.

### 6. Buat LLM Judge Opsional

Tujuan:

- Mempercepat review banyak test cases.

Judge input:

- question
- expected_answer
- generated_answer
- source chunks

Judge output:

```json
{
  "correctness": 0,
  "groundedness": 0,
  "completeness": 0,
  "source_attribution": true,
  "notes": "..."
}
```

Catatan:

- LLM judge tidak menggantikan manual review.
- Untuk keputusan tuning penting, sample hasil tetap dicek manusia.

### 7. Buat Report Markdown

Tujuan:

- Membuat hasil evaluasi mudah dibaca.

Output:

```txt
eval/rag/reports/report-YYYY-MM-DD.md
```

Isi report:

- config yang diuji
- ringkasan skor
- top failures
- pertanyaan negatif yang salah dijawab
- threshold recommendation
- contoh jawaban buruk
- action items

### 8. Integrasikan ke Package Scripts

Tujuan:

- Evaluasi bisa dijalankan konsisten.

Tambahkan script:

```json
{
  "eval:rag:retrieval": "tsx scripts/eval-rag-retrieval.ts",
  "eval:rag:answer": "tsx scripts/eval-rag-answer.ts"
}
```

Jika tidak ingin menambah dependency `tsx`, bisa pakai `node --import`/build TS terpisah, tapi `tsx` lebih praktis untuk script internal.

### 9. Tentukan Baseline

Tujuan:

- Memiliki angka pembanding sebelum tuning.

Baseline yang perlu dicatat:

- embedding provider
- embedding model
- dimensions
- chunk size
- chunk overlap
- `MATCH_COUNT`
- `RAG_MATCH_THRESHOLD`
- `FILTER_LLM`
- chat provider/model
- tanggal dokumen terakhir di-ingest

### 10. Tuning Berdasarkan Hasil

Tujuan:

- Membuat perubahan yang berbasis data, bukan perasaan.

Urutan tuning:

1. Cari threshold yang memaksimalkan retrieval hit tanpa banyak false positive.
2. Atur `MATCH_COUNT`.
3. Bandingkan `FILTER_LLM=ON/OFF`.
4. Jika retrieval masih buruk, revisi chunk size/overlap.
5. Jika retrieval bagus tapi jawaban buruk, revisi prompt atau answer generation.
6. Jika pertanyaan negatif sering dijawab, naikkan threshold atau tambah guardrail.

## Target Kualitas Awal

Target awal untuk dataset demo:

- Document Hit@3 >= 90%.
- Source Hit@5 >= 80%.
- Negative refusal accuracy >= 80%.
- Answer score rata-rata >= 1.6 dari 2.
- Source attribution rate >= 90%.

Target ini bisa dinaikkan setelah dataset makin representatif.

## Risiko dan Perhatian

- Dataset kecil bisa membuat tuning bias.
- Expected answer harus dibuat dari dokumen, bukan dari asumsi.
- Jika dokumen berubah, dataset perlu direview.
- LLM judge bisa salah; gunakan sebagai triage, bukan hakim final.
- Mengubah embedding provider butuh re-ingest sebelum hasil eval valid.
- Threshold optimal untuk NVIDIA NIM bisa berbeda dari Ollama/OpenAI.

## Urutan Implementasi Yang Disarankan

1. Buat `eval/rag/questions.jsonl` dengan 40 test cases awal.
2. Buat retrieval runner.
3. Jalankan baseline untuk config saat ini.
4. Buat report markdown otomatis.
5. Tambahkan answer runner setelah retrieval baseline stabil.
6. Tambahkan LLM judge opsional.
7. Jadikan eval sebagai checklist sebelum mengganti model, embedding provider, atau chunking.

## Definition of Done

Implementasi evaluasi dianggap siap jika:

- Dataset awal tersedia.
- Retrieval runner bisa berjalan dari command line.
- Report retrieval menampilkan metrik agregat dan failure cases.
- Ada baseline untuk konfigurasi saat ini.
- Ada rekomendasi threshold/top-k berdasarkan hasil.
- Answer runner minimal bisa mengevaluasi 10-20 sample pertama.

## Implementasi Awal

Versi awal sudah mencakup:

- Dataset awal di `eval/rag/questions.jsonl`.
- README evaluasi di `eval/rag/README.md`.
- Retrieval runner di `scripts/eval-rag-retrieval.mjs`.
- Answer runner di `scripts/eval-rag-answer.mjs`.
- LLM judge opsional melalui flag `--judge`.
- NPM script `eval:rag:retrieval` dan `eval:rag:answer`.
- Output report JSON dan Markdown di `eval/rag/reports/`.

Command default:

```bash
npm run eval:rag:retrieval
```

Command sweep:

```bash
npm run eval:rag:retrieval -- \
  --match-counts 2,3,5 \
  --thresholds 0.25,0.55,0.75 \
  --out eval/rag/reports/retrieval-sweep-latest.json \
  --report eval/rag/reports/retrieval-sweep-latest.md
```

Catatan hasil awal dengan dataset demo:

- Threshold `0.25` memberi document/source hit tinggi untuk pertanyaan answerable.
- Threshold `0.25` juga memberi negative false positive tinggi, sehingga perlu tuning tambahan di rentang tengah seperti `0.30` sampai `0.50`.
- Threshold `0.55` terlalu ketat untuk dataset demo saat ini.

Answer runner:

```bash
npm run eval:rag:answer
```

Runner ini memakai retrieval report, mengambil full chunk dari Supabase, lalu generate jawaban dengan chat provider aktif. Metrik otomatisnya masih ringan, sehingga correctness dan groundedness tetap perlu manual review atau LLM judge pada iterasi berikutnya.

Answer runner dengan LLM judge:

```bash
npm run eval:rag:answer -- --limit 5 --judge
```

Judge memberi skor `correctness`, `groundedness`, dan `completeness` dalam rentang 0-2. Skor ini dipakai untuk triage cepat, tetapi sampel penting tetap perlu dicek manual.
