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
create policy "Profiles are viewable by authenticated users"
on public.profiles for select
to authenticated
using (true);

-- Users can only edit their own profile
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
create policy "Users can view their own friendships"
on public.friendships for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester can create a new request
create policy "Users can send friend requests"
on public.friendships for insert
to authenticated
with check (auth.uid() = requester_id);

-- Only the addressee can accept (update status) a pending request
create policy "Addressee can accept a friend request"
on public.friendships for update
to authenticated
using (auth.uid() = addressee_id)
with check (auth.uid() = addressee_id);

-- Either side can delete: addressee declines, requester cancels/unfriends
create policy "Either side can remove a friendship or request"
on public.friendships for delete
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);


-- 3) MESSAGES ------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(content) > 0),
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Users can view their own conversations"
on public.messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
on public.messages for insert
to authenticated
with check (auth.uid() = sender_id);

-- Helpful index for loading a conversation fast
create index if not exists messages_conversation_idx
  on public.messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at);

-- 4) REALTIME ------------------------------------------------------
-- Enable realtime broadcasts for the messages table
alter publication supabase_realtime add table public.messages;