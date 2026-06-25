create extension if not exists pgcrypto;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  body text,
  media_url text,
  media_path text,
  media_type text check (media_type in ('image', 'video')),
  sender_id text not null check (sender_id in ('bubu', 'buggu')),
  sender_name text not null default 'bubu' check (sender_name in ('bubu', 'buggu')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  reply_to_id uuid references public.messages (id) on delete set null,
  reply_to_sender_name text,
  reply_to_body text,
  reply_to_media_type text check (
    reply_to_media_type is null
    or reply_to_media_type in ('image', 'video')
  )
);

alter table public.messages enable row level security;

alter table public.messages
drop constraint if exists messages_sender_allowed;

alter table public.messages
add constraint messages_sender_allowed
check (
  sender_id in ('bubu', 'buggu')
  and sender_name in ('bubu', 'buggu')
  and sender_name = sender_id
) not valid;

drop policy if exists "messages_select_all" on public.messages;
create policy "messages_select_all"
on public.messages for select
using (sender_id in ('bubu', 'buggu'));

drop policy if exists "messages_insert_all" on public.messages;
create policy "messages_insert_all"
on public.messages for insert
with check (
  sender_id in ('bubu', 'buggu')
  and sender_name in ('bubu', 'buggu')
  and sender_name = sender_id
);

drop policy if exists "messages_update_read_state" on public.messages;
create policy "messages_update_read_state"
on public.messages for update
using (sender_id in ('bubu', 'buggu'))
with check (
  sender_id in ('bubu', 'buggu')
  and sender_name in ('bubu', 'buggu')
  and sender_name = sender_id
);

create index if not exists messages_created_at_idx
on public.messages (created_at);

create table if not exists public.chat_presence (
  session_id text primary key check (session_id in ('bubu', 'buggu')),
  display_name text not null default 'bubu' check (display_name in ('bubu', 'buggu')),
  last_seen timestamptz not null default now()
);

alter table public.chat_presence enable row level security;

alter table public.chat_presence
drop constraint if exists chat_presence_user_allowed;

alter table public.chat_presence
add constraint chat_presence_user_allowed
check (
  session_id in ('bubu', 'buggu')
  and display_name in ('bubu', 'buggu')
  and display_name = session_id
) not valid;

drop policy if exists "chat_presence_select_all" on public.chat_presence;
create policy "chat_presence_select_all"
on public.chat_presence for select
using (session_id in ('bubu', 'buggu'));

drop policy if exists "chat_presence_insert_all" on public.chat_presence;
create policy "chat_presence_insert_all"
on public.chat_presence for insert
with check (
  session_id in ('bubu', 'buggu')
  and display_name in ('bubu', 'buggu')
  and display_name = session_id
);

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

drop policy if exists "chat_presence_update_all" on public.chat_presence;
create policy "chat_presence_update_all"
on public.chat_presence for update
using (session_id in ('bubu', 'buggu'))
with check (
  session_id in ('bubu', 'buggu')
  and display_name in ('bubu', 'buggu')
  and display_name = session_id
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_media_select_all" on storage.objects;
create policy "chat_media_select_all"
on storage.objects for select
using (bucket_id = 'chat-media');

drop policy if exists "chat_media_insert_all" on storage.objects;
create policy "chat_media_insert_all"
on storage.objects for insert
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] in ('bubu', 'buggu')
);

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_presence;
exception
  when duplicate_object then null;
end $$;

alter table public.messages
add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

alter table public.messages
add column if not exists reply_to_sender_name text;

alter table public.messages
add column if not exists reply_to_body text;

alter table public.messages
add column if not exists reply_to_media_type text;

do $$
begin
  alter table public.messages
  add constraint messages_reply_media_type_check
  check (
    reply_to_media_type is null
    or reply_to_media_type in ('image', 'video')
  );
exception
  when duplicate_object then null;
end $$;

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

