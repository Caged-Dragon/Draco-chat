-- ============================================================
-- DRAGON CHAT — SUPABASE SCHEMA
-- SAFE / RE-RUNNABLE VERSION
--
-- Run this whole file in:
-- Supabase Dashboard > SQL Editor
--
-- This script DOES NOT delete existing table data.
-- ============================================================


-- ============================================================
-- 1) PROFILES
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null,
    email text not null,
    created_at timestamptz default now()
);

alter table public.profiles enable row level security;


-- ------------------------------------------------------------
-- PROFILES POLICIES
-- Remove old policies first so this script can be run again.
-- ------------------------------------------------------------

drop policy if exists "Profiles are viewable by authenticated users"
on public.profiles;

create policy "Profiles are viewable by authenticated users"
on public.profiles
for select
to authenticated
using (true);


drop policy if exists "Users can update own profile"
on public.profiles;

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);


-- ------------------------------------------------------------
-- AUTO-CREATE PROFILE AFTER SIGNUP
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    base_username text;
    final_username text;
begin

    base_username := coalesce(
        new.raw_user_meta_data->>'username',
        new.raw_user_meta_data->>'user_name',
        new.raw_user_meta_data->>'full_name',
        split_part(coalesce(new.email, 'user'), '@', 1)
    );

    -- Remove non-alphanumeric characters except underscore
    base_username := regexp_replace(
        base_username,
        '[^a-zA-Z0-9_]',
        '',
        'g'
    );

    if base_username = '' or base_username is null then
        base_username := 'user';
    end if;

    final_username := base_username;

    loop
        begin

            insert into public.profiles (
                id,
                username,
                email
            )
            values (
                new.id,
                final_username,
                coalesce(new.email, '')
            );

            exit;

        exception
            when unique_violation then

                final_username :=
                    base_username ||
                    floor(random() * 9000 + 1000)::text;

        end;
    end loop;

    return new;

end;
$$;


-- ------------------------------------------------------------
-- PROFILE TRIGGER
-- ------------------------------------------------------------

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();


-- ============================================================
-- 2) FRIENDSHIPS
-- ============================================================

create table if not exists public.friendships (
    id uuid primary key default gen_random_uuid(),

    requester_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    addressee_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    status text
        not null
        default 'pending',

    created_at timestamptz default now(),

    unique (requester_id, addressee_id)
);


-- ------------------------------------------------------------
-- FRIENDSHIP STATUS CONSTRAINT
-- ------------------------------------------------------------

alter table public.friendships
drop constraint if exists friendships_status_check;

alter table public.friendships
add constraint friendships_status_check
check (status in ('pending', 'accepted'));


alter table public.friendships
enable row level security;


-- ------------------------------------------------------------
-- FRIENDSHIP POLICIES
-- ------------------------------------------------------------

drop policy if exists "Users can view their own friendships"
on public.friendships;

create policy "Users can view their own friendships"
on public.friendships
for select
to authenticated
using (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
);


drop policy if exists "Users can send friend requests"
on public.friendships;

create policy "Users can send friend requests"
on public.friendships
for insert
to authenticated
with check (
    auth.uid() = requester_id
);


drop policy if exists "Addressee can accept a friend request"
on public.friendships;

create policy "Addressee can accept a friend request"
on public.friendships
for update
to authenticated
using (
    auth.uid() = addressee_id
)
with check (
    auth.uid() = addressee_id
);


drop policy if exists "Either side can remove a friendship or request"
on public.friendships;

create policy "Either side can remove a friendship or request"
on public.friendships
for delete
to authenticated
using (
    auth.uid() = requester_id
    or auth.uid() = addressee_id
);


-- ============================================================
-- 3) MESSAGES
-- ============================================================

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),

    sender_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    receiver_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    content text,

    attachment_url text,

    attachment_type text,

    attachment_name text,

    created_at timestamptz default now()
);


-- ------------------------------------------------------------
-- ADD NEW COLUMNS TO EXISTING MESSAGES TABLE
-- ------------------------------------------------------------

alter table public.messages
add column if not exists attachment_url text;

alter table public.messages
add column if not exists attachment_type text;

alter table public.messages
add column if not exists attachment_name text;


-- ------------------------------------------------------------
-- ALLOW TEXT-LESS ATTACHMENT MESSAGES
-- ------------------------------------------------------------

alter table public.messages
alter column content drop not null;


-- Remove old constraints if they exist
alter table public.messages
drop constraint if exists messages_content_check;

alter table public.messages
drop constraint if exists messages_content_or_attachment;


-- At least text OR attachment must exist
alter table public.messages
add constraint messages_content_or_attachment
check (
    content is not null
    or attachment_url is not null
);


alter table public.messages
enable row level security;


-- ------------------------------------------------------------
-- MESSAGE POLICIES
-- ------------------------------------------------------------

drop policy if exists "Users can view their own conversations"
on public.messages;

create policy "Users can view their own conversations"
on public.messages
for select
to authenticated
using (
    auth.uid() = sender_id
    or auth.uid() = receiver_id
);


drop policy if exists "Users can send messages"
on public.messages;

create policy "Users can send messages"
on public.messages
for insert
to authenticated
with check (
    auth.uid() = sender_id
);


-- ------------------------------------------------------------
-- MESSAGE INDEX
-- ------------------------------------------------------------

create index if not exists messages_conversation_idx
on public.messages (
    least(sender_id, receiver_id),
    greatest(sender_id, receiver_id),
    created_at
);


-- ============================================================
-- 4) REALTIME
-- ============================================================

-- Add messages to Supabase Realtime only if it is not
-- already part of the publication.

do $$
begin

    if not exists (
        select 1
        from pg_publication_rel pr
        join pg_class c
            on c.oid = pr.prrelid
        join pg_publication p
            on p.oid = pr.prpubid
        where p.pubname = 'supabase_realtime'
          and c.oid = 'public.messages'::regclass
    ) then

        alter publication supabase_realtime
        add table public.messages;

    end if;

end;
$$;


-- ============================================================
-- 5) GLOBAL USER SETTINGS
-- ============================================================

create table if not exists public.user_settings (
    user_id uuid primary key
        references public.profiles(id)
        on delete cascade,

    theme jsonb
        not null
        default '{}'::jsonb,

    wallpaper_url text,

    updated_at timestamptz
        default now()
);


alter table public.user_settings
enable row level security;


-- ------------------------------------------------------------
-- USER SETTINGS POLICY
-- ------------------------------------------------------------

drop policy if exists "Users manage their own global settings"
on public.user_settings;

create policy "Users manage their own global settings"
on public.user_settings
for all
to authenticated
using (
    auth.uid() = user_id
)
with check (
    auth.uid() = user_id
);


-- ============================================================
-- 6) PER-CHAT SETTINGS
-- ============================================================

create table if not exists public.chat_settings (
    id uuid primary key default gen_random_uuid(),

    owner_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    friend_id uuid
        references public.profiles(id)
        on delete cascade
        not null,

    theme jsonb
        not null
        default '{}'::jsonb,

    wallpaper_url text,

    updated_at timestamptz
        default now(),

    unique (owner_id, friend_id)
);


alter table public.chat_settings
enable row level security;


-- ------------------------------------------------------------
-- CHAT SETTINGS POLICY
-- ------------------------------------------------------------

drop policy if exists "Users manage their own chat settings"
on public.chat_settings;

create policy "Users manage their own chat settings"
on public.chat_settings
for all
to authenticated
using (
    auth.uid() = owner_id
)
with check (
    auth.uid() = owner_id
);


-- ============================================================
-- 7) STORAGE BUCKETS
-- ============================================================

-- Attachments bucket
insert into storage.buckets (
    id,
    name,
    public
)
values (
    'chat-attachments',
    'chat-attachments',
    true
)
on conflict (id) do nothing;


-- Wallpapers bucket
insert into storage.buckets (
    id,
    name,
    public
)
values (
    'chat-wallpapers',
    'chat-wallpapers',
    true
)
on conflict (id) do nothing;


-- ============================================================
-- 8) STORAGE POLICIES
-- ============================================================


-- ------------------------------------------------------------
-- ATTACHMENTS: UPLOAD
-- ------------------------------------------------------------

drop policy if exists "Authenticated users can upload attachments"
on storage.objects;

create policy "Authenticated users can upload attachments"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'chat-attachments'
);


-- ------------------------------------------------------------
-- ATTACHMENTS: VIEW
-- ------------------------------------------------------------

drop policy if exists "Anyone can view attachments"
on storage.objects;

create policy "Anyone can view attachments"
on storage.objects
for select
using (
    bucket_id = 'chat-attachments'
);


-- ------------------------------------------------------------
-- WALLPAPERS: UPLOAD
-- ------------------------------------------------------------

drop policy if exists "Authenticated users can upload wallpapers"
on storage.objects;

create policy "Authenticated users can upload wallpapers"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'chat-wallpapers'
);


-- ------------------------------------------------------------
-- WALLPAPERS: VIEW
-- ------------------------------------------------------------

drop policy if exists "Anyone can view wallpapers"
on storage.objects;

create policy "Anyone can view wallpapers"
on storage.objects
for select
using (
    bucket_id = 'chat-wallpapers'
);


-- ------------------------------------------------------------
-- DELETE OWN UPLOADS
-- ------------------------------------------------------------

drop policy if exists "Users can delete their own uploads"
on storage.objects;

create policy "Users can delete their own uploads"
on storage.objects
for delete
to authenticated
using (
    bucket_id in (
        'chat-attachments',
        'chat-wallpapers'
    )
    and owner = auth.uid()
);


-- ============================================================
-- DONE
-- ============================================================