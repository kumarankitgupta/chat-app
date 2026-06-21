-- Run this to enable background web push notifications.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null check (user_id in ('bubu', 'buggu')),
  p256dh_key text not null,
  auth_key text not null,
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_all" on public.push_subscriptions;
create policy "push_subscriptions_select_all"
on public.push_subscriptions for select
using (user_id in ('bubu', 'buggu'));

drop policy if exists "push_subscriptions_insert_all" on public.push_subscriptions;
create policy "push_subscriptions_insert_all"
on public.push_subscriptions for insert
with check (user_id in ('bubu', 'buggu'));

drop policy if exists "push_subscriptions_update_all" on public.push_subscriptions;
create policy "push_subscriptions_update_all"
on public.push_subscriptions for update
using (user_id in ('bubu', 'buggu'))
with check (user_id in ('bubu', 'buggu'));

drop policy if exists "push_subscriptions_delete_all" on public.push_subscriptions;
create policy "push_subscriptions_delete_all"
on public.push_subscriptions for delete
using (user_id in ('bubu', 'buggu'));
