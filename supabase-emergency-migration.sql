-- Run this for existing setups to enable emergency suspension mode.

create table if not exists public.chat_service_state (
  id int primary key check (id = 1),
  suspended_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('bubu', 'buggu'))
);

alter table public.chat_service_state enable row level security;

drop policy if exists "chat_service_state_select_all" on public.chat_service_state;
create policy "chat_service_state_select_all"
on public.chat_service_state for select
using (true);

drop policy if exists "chat_service_state_insert_all" on public.chat_service_state;
create policy "chat_service_state_insert_all"
on public.chat_service_state for insert
with check (id = 1 and updated_by in ('bubu', 'buggu'));

drop policy if exists "chat_service_state_update_all" on public.chat_service_state;
create policy "chat_service_state_update_all"
on public.chat_service_state for update
using (id = 1)
with check (id = 1 and updated_by in ('bubu', 'buggu'));
