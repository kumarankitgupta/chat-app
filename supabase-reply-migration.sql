-- Run this ONLY if you already have the chat app set up.
-- Safe to run more than once.

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
