# Weexam (Weekly Exam)

LMS untuk ujian mingguan per topik. PWA offline-first, tanpa dependensi runtime, tanpa server.

## Menjalankan
- **Android & Windows (disarankan):** hosting folder `dist/` di hosting statis HTTPS (Netlify Drop, GitHub Pages, Cloudflare Pages), buka di Chrome/Edge, tekan **Pasang Weexam** di Pengaturan.
- **Windows tanpa hosting:** ekstrak `Weexam-Windows.zip`, klik dua kali `Pasang-Weexam-Windows.bat`.
- **Lokal:** `cd dist && python3 -m http.server 5173` lalu buka http://localhost:5173

## Pengembangan
    bun scripts/build.ts      # build -> dist/
    bun test tests            # 20 tes logika inti
    tsc -p tsconfig.json      # typecheck
    node scripts/e2e.cjs <folder-screenshot>   # uji browser (butuh dist/ disajikan di :5173)

## Struktur
- `src/time.ts` siklus Sabtu-Jumat, fase, jadwal bawaan
- `src/derive.ts` status ujian, skor topik, IP, cakupan, peringatan
- `src/grading.ts` skala A-E, nilai otomatis, potongan susulan
- `src/store.ts`, `src/db.ts` state + IndexedDB (berkas disimpan sebagai Blob)
- `src/pages/*` Dashboard, Topik, Persiapan (+editor), Ujian (+ruang ujian, koreksi), Evaluasi, Pengaturan

## Pembaruan: Evaluasi & akses soal
- **Evaluasi Ujian**: unggah banyak berkas (soal / jawaban / materi / lainnya), seret-lepas, pratinjau gambar, buka/unduh/hapus, tag, pencarian, "Muat berkas dari ujian", unduh ringkasan HTML.
- **Ujian**: berkas soal selalu tampil di layar ujian; peringatan bila belum dibuka (juga saat kirim). Setelah ujian: halaman *Soal & Jawaban* + unduh HTML + simpan ke Evaluasi (berkas soal ikut tersalin).
- **Bobot ujian** per ujian (tab Penilaian), pengingat cadangan mingguan, cadangan penulisan darurat saat tab ditutup.

## Versi web + akun
Lihat `PANDUAN-WEB.md`. Kode: `src/cloud.ts` (auth, sinkron, berkas), `src/pages/masuk.ts` (layar masuk, akun), `supabase/schema.sql`. Uji: `node scripts/mock-supabase.cjs 5180 dist` lalu `node scripts/cloud.cjs`.
