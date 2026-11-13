-- =====================================================================
-- Stream Streaming — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query
--
-- Tables
--   profiles      one row per signed-up user (name, researcher ID, role)
--   datasets      one row per upload (who, when, stream, note)
--   measurements  one row per water sample inside a dataset
--
-- Roles
--   researcher : can read everything, upload, edit/delete ONLY own datasets
--   head       : lab head researcher, can edit/delete ALL datasets and
--                change other users' roles
--
-- Permissions are enforced here with Row Level Security (RLS), so they hold
-- even if someone bypasses the website and calls the API directly.
-- =====================================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text not null default '',
  researcher_code text not null default '',
  role            text not null default 'researcher' check (role in ('researcher', 'head')),
  created_at      timestamptz not null default now()
);

-- Helper: is the current user the lab head?
-- SECURITY DEFINER lets it read profiles without triggering RLS recursion.
create or replace function public.is_head()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'head'
  );
$$;

-- Helper: the current user's own role (used to stop people promoting themselves)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Create a profile automatically whenever someone signs up.
-- Name and researcher ID come from the sign-up form (user metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, researcher_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'researcher_code', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles: signed-in users can read" on public.profiles;
create policy "profiles: signed-in users can read"
  on public.profiles for select
  to authenticated
  using (true);

-- Users may edit their own name / researcher ID but NOT their role.
drop policy if exists "profiles: update own (role unchanged)" on public.profiles;
create policy "profiles: update own (role unchanged)"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

-- The head can edit anyone (including roles).
drop policy if exists "profiles: head can update all" on public.profiles;
create policy "profiles: head can update all"
  on public.profiles for update
  to authenticated
  using (public.is_head())
  with check (public.is_head());


-- ---------- datasets ----------
create table if not exists public.datasets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  researcher_code  text not null,
  researcher_name  text not null,
  title            text not null,
  stream_name      text not null default '',
  sampling_date    date not null,
  note             text not null default '',
  source           text not null default 'form' check (source in ('csv', 'xlsx', 'form')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists datasets_owner_idx on public.datasets (owner_id);

alter table public.datasets enable row level security;

drop policy if exists "datasets: signed-in users can read" on public.datasets;
create policy "datasets: signed-in users can read"
  on public.datasets for select
  to authenticated
  using (true);

drop policy if exists "datasets: insert as yourself" on public.datasets;
create policy "datasets: insert as yourself"
  on public.datasets for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "datasets: owner or head can update" on public.datasets;
create policy "datasets: owner or head can update"
  on public.datasets for update
  to authenticated
  using (owner_id = auth.uid() or public.is_head())
  with check (owner_id = auth.uid() or public.is_head());

drop policy if exists "datasets: owner or head can delete" on public.datasets;
create policy "datasets: owner or head can delete"
  on public.datasets for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_head());


-- ---------- measurements ----------
create table if not exists public.measurements (
  id          bigint generated always as identity primary key,
  dataset_id  uuid not null references public.datasets (id) on delete cascade,
  site        text not null default '',
  sampled_at  timestamptz,
  lat         double precision,
  lon         double precision,
  temp_c      double precision,   -- water temperature, °C
  ph          double precision,   -- pH
  do_mgl      double precision,   -- dissolved oxygen, mg/L
  ec_uscm     double precision,   -- electrical conductivity, µS/cm
  turb_ntu    double precision,   -- turbidity, NTU
  bod_mgl     double precision,   -- biochemical oxygen demand, mg/L
  cod_mgl     double precision,   -- chemical oxygen demand, mg/L
  tss_mgl     double precision,   -- total suspended solids, mg/L
  tn_mgl      double precision,   -- total nitrogen, mg/L
  tp_mgl      double precision,   -- total phosphorus, mg/L
  extra       jsonb not null default '{}'::jsonb  -- any other numeric columns from the file
);

create index if not exists measurements_dataset_idx on public.measurements (dataset_id);

-- Helper: may the current user change rows of this dataset?
create or replace function public.can_edit_dataset(ds uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_head()
      or exists (select 1 from public.datasets d where d.id = ds and d.owner_id = auth.uid());
$$;

alter table public.measurements enable row level security;

drop policy if exists "measurements: signed-in users can read" on public.measurements;
create policy "measurements: signed-in users can read"
  on public.measurements for select
  to authenticated
  using (true);

drop policy if exists "measurements: owner or head can insert" on public.measurements;
create policy "measurements: owner or head can insert"
  on public.measurements for insert
  to authenticated
  with check (public.can_edit_dataset(dataset_id));

drop policy if exists "measurements: owner or head can update" on public.measurements;
create policy "measurements: owner or head can update"
  on public.measurements for update
  to authenticated
  using (public.can_edit_dataset(dataset_id))
  with check (public.can_edit_dataset(dataset_id));

drop policy if exists "measurements: owner or head can delete" on public.measurements;
create policy "measurements: owner or head can delete"
  on public.measurements for delete
  to authenticated
  using (public.can_edit_dataset(dataset_id));

-- Keep datasets.updated_at fresh on edits
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists datasets_touch on public.datasets;
create trigger datasets_touch
  before update on public.datasets
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- After the lab head has signed up on the website, make them head:
--
--   update public.profiles set role = 'head' where email = 'head@example.com';
-- =====================================================================
