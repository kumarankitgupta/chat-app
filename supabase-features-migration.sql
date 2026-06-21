-- Run this if you already have the chat app set up.
-- Adds typing indicators and message reactions.

alter table public.chat_presence
add column if not exists is_typing boolean not null default false;

alter table public.chat_presence
add column if not exists typing_updated_at timestamptz;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id text not null check (user_id in ('bubu', 'buggu')),
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reactions_message_id_idx
on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "message_reactions_select_all" on public.message_reactions;
create policy "message_reactions_select_all"
on public.message_reactions for select
using (user_id in ('bubu', 'buggu'));

drop policy if exists "message_reactions_insert_all" on public.message_reactions;
create policy "message_reactions_insert_all"
on public.message_reactions for insert
with check (user_id in ('bubu', 'buggu'));

drop policy if exists "message_reactions_update_all" on public.message_reactions;
create policy "message_reactions_update_all"
on public.message_reactions for update
using (user_id in ('bubu', 'buggu'))
with check (user_id in ('bubu', 'buggu'));

drop policy if exists "message_reactions_delete_all" on public.message_reactions;
create policy "message_reactions_delete_all"
on public.message_reactions for delete
using (user_id in ('bubu', 'buggu'));

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;

alter table public.message_reactions
drop constraint if exists message_reactions_emoji_check;

alter table public.message_reactions
add constraint message_reactions_emoji_check
check (char_length(emoji) between 1 and 16);
