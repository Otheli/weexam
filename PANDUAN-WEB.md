# Weexam versi web: pasang dalam ±15 menit (semua gratis, tanpa kartu kredit)

Hasilnya: situs `https://weexam.pages.dev` (atau nama lain yang mengandung "weexam"), dengan login email atau Google, dan data tersimpan di akun.

## 1. Buat backend gratis (Supabase)
1. Daftar di <https://supabase.com> → **New project** (nama bebas, mis. `weexam`; region Singapore; simpan password database).
2. Buka **SQL Editor** → **New query** → tempel seluruh isi `supabase/schema.sql` → **Run**. Ini membuat tabel data dan penyimpanan berkas, dengan aturan keamanan: tiap orang hanya bisa membuka datanya sendiri.
3. Buka **Project Settings → API**. Salin **Project URL** dan **anon / publishable key**.
4. Buka berkas `config.js` di folder `dist/`, isi:
   ```js
   window.WEEXAM_CLOUD = { url: 'https://xxxx.supabase.co', key: 'eyJ...' };
   ```
   (Key ini memang publik; yang menjaga data adalah aturan keamanan di langkah 2.)

## 2. Pasang situs di hosting gratis
Pilih salah satu (cukup unggah isi folder `dist/`):
- **Cloudflare Pages** (disarankan): <https://dash.cloudflare.com> → Workers & Pages → Create → Pages → **Upload assets** → nama proyek `weexam` → unggah folder `dist`. Alamat: `https://weexam.pages.dev`.
- **Netlify**: <https://app.netlify.com/drop>, seret folder `dist`, lalu Site settings → ubah nama jadi `weexam` → `https://weexam.netlify.app`.
Bila nama `weexam` sudah dipakai orang lain, tambahkan akhiran, mis. `weexam-app`.

## 3. Hubungkan alamat situs ke login
Di Supabase → **Authentication → URL Configuration**:
- **Site URL**: alamat situsmu (mis. `https://weexam.pages.dev`)
- **Redirect URLs**: tambahkan alamat yang sama.

Pilihan tambahan:
- **Tanpa konfirmasi email** (daftar langsung masuk): Authentication → Sign In / Providers → Email → matikan *Confirm email*. Bila dibiarkan aktif, pengguna baru perlu klik tautan di emailnya dulu.
- **Login Google**: Authentication → Sign In / Providers → Google → aktifkan. Buat OAuth Client ID di <https://console.cloud.google.com/apis/credentials> (jenis *Web application*), isi **Authorized redirect URI** dengan `https://<ref-proyek>.supabase.co/auth/v1/callback`, lalu tempel Client ID dan Secret ke Supabase.

## Cara kerjanya
- Data tetap disimpan dulu di perangkat (bisa dipakai offline), lalu otomatis dikirim ke akun beberapa detik setelah ada perubahan, dan diperbarui dari perangkat lain saat aplikasi dibuka kembali.
- Bila dua perangkat mengubah data saat sama-sama offline, muncul pilihan versi mana yang dipakai.
- Berkas (soal, jawaban, materi) disimpan di akun dan diunduh saat dibuka di perangkat lain. Batas 25 MB per berkas.
- "Lanjut tanpa akun" tetap tersedia: data hanya di perangkat itu.
- Data tamu otomatis ikut dipindahkan ke akun saat pertama kali mendaftar.

## Batas paket gratis
- Supabase gratis: 500 MB database, 1 GB berkas, dan proyek **dijeda bila 7 hari tidak ada yang membukanya** (data tidak hilang; tekan *Restore* di dashboard, atau pakai aplikasinya sesekali). Lanjutkan tetap membuat cadangan manual dari Pengaturan.
- Cloudflare Pages / Netlify gratis memadai untuk pemakaian pribadi atau kelas kecil.
