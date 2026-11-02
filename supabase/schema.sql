-- Weexam: skema Supabase (jalankan sekali di SQL Editor).
-- Tiap pengguna hanya bisa membaca/menulis barisnya sendiri (Row Level Security).

create table if not exists public.weexam_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb       not null,
  rev        bigint      not null default 1,   -- nomor revisi untuk mendeteksi bentrok antar perangkat
  updated_at timestamptz not null default now()
);

alter table public.weexam_state enable row level security;

drop policy if exists "weexam_state_select" on public.weexam_state;
drop policy if exists "weexam_state_insert" on public.weexam_state;
drop policy if exists "weexam_state_update" on public.weexam_state;
drop policy if exists "weexam_state_delete" on public.weexam_state;
create policy "weexam_state_select" on public.weexam_state for select to authenticated using (auth.uid() = user_id);
create policy "weexam_state_insert" on public.weexam_state for insert to authenticated with check (auth.uid() = user_id);
create policy "weexam_state_update" on public.weexam_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weexam_state_delete" on public.weexam_state for delete to authenticated using (auth.uid() = user_id);

-- Penyimpanan berkas (privat, maks 25 MB per berkas)
insert into storage.buckets (id, name, public, file_size_limit)
values ('weexam-files', 'weexam-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "weexam_files_select" on storage.objects;
drop policy if exists "weexam_files_insert" on storage.objects;
drop policy if exists "weexam_files_update" on storage.objects;
drop policy if exists "weexam_files_delete" on storage.objects;
create policy "weexam_files_select" on storage.objects for select to authenticated using (bucket_id = 'weexam-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "weexam_files_insert" on storage.objects for insert to authenticated with check (bucket_id = 'weexam-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "weexam_files_update" on storage.objects for update to authenticated using (bucket_id = 'weexam-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "weexam_files_delete" on storage.objects for delete to authenticated using (bucket_id = 'weexam-files' and (storage.foldername(name))[1] = auth.uid()::text);
