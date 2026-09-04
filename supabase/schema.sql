-- ============================================================
-- DRAGON CHAT — SUPABASE SCHEMA
-- Run this whole file once in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) PROFILES ---------------------------------------------------
-- One row per user. Created automatically when someone signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Anyone logged in can search/view basic profile info
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
on public.profiles for select
to authenticated
using (true);

-- Users can only edit their own profile
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id);

-- Auto-create a profile row whenever a new user signs up.
-- Handles email/password signups (which pass a chosen "username") and
-- OAuth signups (Google/GitHub, which don't) by falling back to the
-- provider's name/email, and retries with a random suffix if that
-- username is already taken.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_username text;
  final_username text;
begin
  base_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );
  -- Strip anything that isn't alphanumeric/underscore, keep it short
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
  if base_username = '' or base_username is null then
    base_username := 'user';
  end if;
  final_username := base_username;

  loop
    begin
      insert into public.profiles (id, username, email)
      values (new.id, final_username, new.email);
      exit;
    exception when unique_violation then
      -- Username taken — try again with a random 4-digit suffix
      final_username := base_username || floor(random() * 9000 + 1000)::text;
    end;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2) FRIENDSHIPS -------------------------------------------------
-- Real request/accept flow:
--   requester sends a row with status 'pending'
--   recipient can update it to 'accepted' or delete it to decline
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

-- Either side of the friendship (or request) can see the row
drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
on public.friendships for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester can create a new request
drop policy if exists "Users can send friend requests" on public.friendships;
create policy "Users can send friend requests"
on public.friendships for insert
to authenticated
with check (auth.uid() = requester_id);

-- Only the addressee can accept (update status) a pending request
drop policy if exists "Addressee can accept a friend request" on public.friendships;
create policy "Addressee can accept a friend request"
on public.friendships for update
to authenticated
using (auth.uid() = addressee_id)
with check (auth.uid() = addressee_id);

-- Either side can delete: addressee declines, requester cancels/unfriends
drop policy if exists "Either side can remove a friendship or request" on public.friendships;
create policy "Either side can remove a friendship or request"
on public.friendships for delete
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);


-- 3) MESSAGES ------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  content text,
  attachment_url text,
  attachment_type text,   -- 'image' | 'file'
  attachment_name text,
  created_at timestamptz default now()
);

-- Upgrading an existing v1/v2 database: relax content to allow
-- attachment-only messages, and add the attachment columns if they're
-- not already there.
alter table public.messages alter column content drop not null;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages drop constraint if exists messages_content_or_attachment;
alter table public.messages add constraint messages_content_or_attachment
  check (content is not null or attachment_url is not null);

alter table public.messages enable row level security;

drop policy if exists "Users can view their own conversations" on public.messages;
create policy "Users can view their own conversations"
on public.messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages"
on public.messages for insert
to authenticated
with check (auth.uid() = sender_id);

-- Helpful index for loading a conversation fast
create index if not exists messages_conversation_idx
  on public.messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at);

-- 4) REALTIME ------------------------------------------------------
-- Enable realtime broadcasts for the messages table
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;


-- 5) THEME SETTINGS (v3) --------------------------------------------
-- Global theme: one row per user, applies everywhere in the app.
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme jsonb not null default '{}'::jsonb,
  wallpaper_url text,
  updated_at timestamptz default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users manage their own global settings" on public.user_settings;
create policy "Users manage their own global settings"
on public.user_settings for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Per-chat theme: one row per (owner, friend) pair. Only overrides the
-- conversation view for the owner — the friend on the other side keeps
-- their own settings, since each side has their own row (or none).
create table if not exists public.chat_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  friend_id uuid references public.profiles(id) on delete cascade not null,
  theme jsonb not null default '{}'::jsonb,
  wallpaper_url text,
  updated_at timestamptz default now(),
  unique (owner_id, friend_id)
);

alter table public.chat_settings enable row level security;

drop policy if exists "Users manage their own chat settings" on public.chat_settings;
create policy "Users manage their own chat settings"
on public.chat_settings for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);


-- 6) STORAGE (v3) — attachments + wallpapers -------------------------
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('chat-wallpapers', 'chat-wallpapers', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload attachments" on storage.objects;
create policy "Authenticated users can upload attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat-attachments');

drop policy if exists "Anyone can view attachments" on storage.objects;
create policy "Anyone can view attachments"
on storage.objects for select
using (bucket_id = 'chat-attachments');

drop policy if exists "Authenticated users can upload wallpapers" on storage.objects;
create policy "Authenticated users can upload wallpapers"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat-wallpapers');

drop policy if exists "Anyone can view wallpapers" on storage.objects;
create policy "Anyone can view wallpapers"
on storage.objects for select
using (bucket_id = 'chat-wallpapers');

-- Only the person who uploaded a file can delete it later
drop policy if exists "Users can delete their own uploads" on storage.objects;
create policy "Users can delete their own uploads"
on storage.objects for delete
to authenticated
using (bucket_id in ('chat-attachments', 'chat-wallpapers') and owner = auth.uid());


-- ============================================================
-- v5 — PROFILES: avatar, status message, presence, last seen
-- ============================================================
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists status_message text;
alter table public.profiles add column if not exists presence_status text not null default 'online'
  check (presence_status in ('online', 'away', 'busy', 'dnd', 'offline'));
alter table public.profiles add column if not exists last_seen_at timestamptz default now();


-- ============================================================
-- v5 — MESSAGES: reply, edit, delete, read receipts
-- ============================================================
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;

drop policy if exists "Users can update own messages" on public.messages;
create policy "Users can update own messages"
on public.messages for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

-- A second, separate UPDATE policy: Postgres OR's multiple policies for
-- the same command together, so this lets the RECEIVER flip read_at
-- without being able to touch anything else about the sender's message
-- (enforced by the app only ever sending {read_at: ...} from that side).
drop policy if exists "Receiver can mark messages read" on public.messages;
create policy "Receiver can mark messages read"
on public.messages for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

drop policy if exists "Users can delete own messages" on public.messages;
create policy "Users can delete own messages"
on public.messages for delete
to authenticated
using (auth.uid() = sender_id);


-- ============================================================
-- v5 — MESSAGE REACTIONS
-- ============================================================
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

drop policy if exists "Users can view reactions on their conversations" on public.message_reactions;
create policy "Users can view reactions on their conversations"
on public.message_reactions for select
to authenticated
using (
  exists (
    select 1 from public.messages m
    where m.id = message_id and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
  )
);

drop policy if exists "Users can add their own reactions" on public.message_reactions;
create policy "Users can add their own reactions"
on public.message_reactions for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
on public.message_reactions for delete
to authenticated
using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;


-- ============================================================
-- v5 — BLOCKING (also prevents blocked users from messaging you)
-- ============================================================
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "Users can see blocks involving them" on public.blocks;
create policy "Users can see blocks involving them"
on public.blocks for select
to authenticated
using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can create their own blocks" on public.blocks;
create policy "Users can create their own blocks"
on public.blocks for insert
to authenticated
with check (auth.uid() = blocker_id);

drop policy if exists "Users can remove their own blocks" on public.blocks;
create policy "Users can remove their own blocks"
on public.blocks for delete
to authenticated
using (auth.uid() = blocker_id);

-- Re-issue the messages insert policy so it also blocks sending in
-- either direction of an active block.
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = receiver_id and b.blocked_id = auth.uid())
       or (b.blocker_id = auth.uid() and b.blocked_id = receiver_id)
  )
);


-- ============================================================
-- v5 — REPORTS
-- ============================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  created_at timestamptz default now()
);

alter table public.reports enable row level security;

drop policy if exists "Users can file reports" on public.reports;
create policy "Users can file reports"
on public.reports for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "Users can view their own filed reports" on public.reports;
create policy "Users can view their own filed reports"
on public.reports for select
to authenticated
using (auth.uid() = reporter_id);


-- ============================================================
-- v5 — CALL HISTORY
-- ============================================================
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references public.profiles(id) on delete cascade not null,
  callee_id uuid references public.profiles(id) on delete cascade not null,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null check (status in ('completed', 'missed', 'declined')),
  duration_seconds integer not null default 0,
  created_at timestamptz default now()
);

alter table public.calls enable row level security;

drop policy if exists "Users can view their own calls" on public.calls;
create policy "Users can view their own calls"
on public.calls for select
to authenticated
using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "Users can log calls they took part in" on public.calls;
create policy "Users can log calls they took part in"
on public.calls for insert
to authenticated
with check (auth.uid() = caller_id or auth.uid() = callee_id);


-- ============================================================
-- v5 — GROUPS (parallel to 1:1 chat — its own tables, so the
-- existing friend-to-friend messaging code is untouched)
-- ============================================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text,
  attachment_url text,
  attachment_type text,
  attachment_name text,
  reply_to_id uuid references public.group_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  constraint group_messages_content_or_attachment check (content is not null or attachment_url is not null)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- Helper for membership checks used inside RLS policies below. A SELECT
-- policy on group_members that queries group_members itself (e.g. "am I
-- a member of this group") causes Postgres to raise "infinite recursion
-- detected in policy for relation group_members" — evaluating the outer
-- row requires re-evaluating the same policy for the inner subquery's
-- rows, forever. Wrapping the lookup in a SECURITY DEFINER function
-- breaks the cycle: the function runs as its owner (bypassing RLS on
-- its own internal query) instead of re-triggering the calling policy.
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
on public.groups for select
to authenticated
using (public.is_group_member(id, auth.uid()));

drop policy if exists "Users can create groups" on public.groups;
create policy "Users can create groups"
on public.groups for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "Creator can update group" on public.groups;
create policy "Creator can update group"
on public.groups for update
to authenticated
using (auth.uid() = created_by);

-- BUG FIX: this policy used to query group_members from within its own
-- USING clause ("select 1 from group_members gm2 where ..."), which is
-- exactly the self-referencing pattern above and broke every query
-- against group_members (and, transitively, the "groups" policy that
-- depends on it) with "infinite recursion detected in policy for
-- relation group_members" — this took down the entire Groups feature.
drop policy if exists "Members can view membership" on public.group_members;
create policy "Members can view membership"
on public.group_members for select
to authenticated
using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Creator can add members or user can join self" on public.group_members;
create policy "Creator can add members or user can join self"
on public.group_members for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
);

drop policy if exists "Members can leave a group" on public.group_members;
create policy "Members can leave a group"
on public.group_members for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Members can view group messages" on public.group_messages;
create policy "Members can view group messages"
on public.group_messages for select
to authenticated
using (exists (select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()));

drop policy if exists "Members can send group messages" on public.group_messages;
create policy "Members can send group messages"
on public.group_messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid())
);

drop policy if exists "Senders can edit own group messages" on public.group_messages;
create policy "Senders can edit own group messages"
on public.group_messages for update
to authenticated
using (auth.uid() = sender_id);

drop policy if exists "Senders can delete own group messages" on public.group_messages;
create policy "Senders can delete own group messages"
on public.group_messages for delete
to authenticated
using (auth.uid() = sender_id);

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null;
end $$;


-- ============================================================
-- v5 — STORAGE: avatars bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
on storage.objects for insert
to authenticated
with check (bucket_id = 'avatars');

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Users can delete their own avatar uploads" on storage.objects;
create policy "Users can delete their own avatar uploads"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and owner = auth.uid());
